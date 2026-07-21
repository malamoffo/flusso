import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Heart, Search, Loader2, Globe, X, Radio, ThumbsUp, Copy, Check, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import { RadioStation } from '../types';
import { MediaSession } from '@capgo/capacitor-media-session';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Logger } from '../lib/logger';
import { isPluginAvailable, isNative } from '../utils/platform';

interface RadioViewProps {
  isActive: boolean;
  searchQuery: string;
}

const STORAGE_KEY = 'flusso_radio_favorites';

export const RadioView = memo(({ isActive, searchQuery }: RadioViewProps) => {
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [favorites, setFavorites] = useState<Record<string, RadioStation>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const [currentStation, setCurrentStation] = useState<RadioStation | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  const currentStationRef = useRef<RadioStation | null>(null);
  const playStationRef = useRef<((station: RadioStation) => Promise<any>) | null>(null);
  const stopStreamRef = useRef<(() => void) | null>(null);
  const stopStationAndStreamRef = useRef<(() => void) | null>(null);
  
  const [selectedStationDetail, setSelectedStationDetail] = useState<RadioStation | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }).catch(err => {
      Logger.error('Failed to copy stream URL', err);
    });
  };

  const stopStream = () => {
    Logger.log('Radio: stopStream called - interrupting audio stream and releasing connection');
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      } catch (e) {
        Logger.error('Radio: stopStream error', e);
      }
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsAudioLoading(false);

    if (isNative() && isPluginAvailable('MediaSession')) {
      if (MediaSession && typeof MediaSession.setPlaybackState === 'function') {
        MediaSession.setPlaybackState({ playbackState: 'paused' }).catch(() => {});
      }
    } else if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'paused';
      } catch (e) {}
    }
  };

  const stopStationAndStream = () => {
    Logger.log('Radio: stopStationAndStream called');
    stopStream();
    setCurrentStation(null);

    if (isNative() && isPluginAvailable('MediaSession')) {
      if (MediaSession && typeof MediaSession.setPlaybackState === 'function') {
        MediaSession.setPlaybackState({ playbackState: 'none' }).catch(() => {});
      }
    } else if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
      } catch (e) {}
    }
  };

  // Keep refs updated to prevent stale closures in event and media session handlers
  useEffect(() => {
    currentStationRef.current = currentStation;
  }, [currentStation]);

  useEffect(() => {
    playStationRef.current = playStation;
    stopStreamRef.current = stopStream;
    stopStationAndStreamRef.current = stopStationAndStream;
  });
  
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    Logger.log('RadioView: Initializing audio element and listeners');
    if (!audioRef.current) {
      audioRef.current = new Audio();
      
      const audio = audioRef.current;

      audio.addEventListener('playing', () => {
        Logger.log('Audio: playing event');
        isPlayingRef.current = true;
        setIsPlaying(true);
        setIsAudioLoading(false);
        if (isNative() && isPluginAvailable('MediaSession')) {
          if (MediaSession && typeof MediaSession.setPlaybackState === 'function') {
            Logger.log('Native: setting playbackState to playing');
            MediaSession.setPlaybackState({ playbackState: 'playing' }).catch(err => {
              Logger.error('Native: setPlaybackState error', err);
            });
          }
        } else if ('mediaSession' in navigator) {
          try {
            navigator.mediaSession.playbackState = 'playing';
          } catch (e) {}
        }
      });

      audio.addEventListener('pause', () => {
        Logger.log('Audio: pause event');
        isPlayingRef.current = false;
        setIsPlaying(false);
        setIsAudioLoading(false);

        // Ensure live stream connection is completely severed when paused
        if (audio.src && audio.src !== 'about:blank' && audio.src !== window.location.href) {
          try {
            audio.removeAttribute('src');
            audio.load();
          } catch (e) {}
        }

        if (isNative() && isPluginAvailable('MediaSession')) {
          if (MediaSession && typeof MediaSession.setPlaybackState === 'function') {
            Logger.log('Native: setting playbackState to paused');
            MediaSession.setPlaybackState({ playbackState: 'paused' }).catch(err => {
              Logger.error('Native: setPlaybackState error', err);
            });
          }
        } else if ('mediaSession' in navigator) {
          try {
            navigator.mediaSession.playbackState = 'paused';
          } catch (e) {}
        }
      });

      audio.addEventListener('error', (e) => {
        const error = (e.target as any).error;
        Logger.error('Audio: error event', { 
          code: error?.code, 
          message: error?.message, 
          src: audio.src 
        });
        isPlayingRef.current = false;
        setIsPlaying(false);
        setIsAudioLoading(false);
        if (isNative() && isPluginAvailable('MediaSession')) {
          if (MediaSession && typeof MediaSession.setPlaybackState === 'function') {
            MediaSession.setPlaybackState({ playbackState: 'none' }).catch(() => {});
          }
        } else if ('mediaSession' in navigator) {
          try {
            navigator.mediaSession.playbackState = 'none';
          } catch (e) {}
        }
      });

      audio.addEventListener('waiting', () => {
        Logger.log('Audio: waiting event');
        setIsAudioLoading(true);
      });

      audio.addEventListener('canplay', () => {
        Logger.log('Audio: canplay event');
        setIsAudioLoading(false);
      });

      audio.addEventListener('loadstart', () => Logger.log('Audio: loadstart event'));
      audio.addEventListener('loadedmetadata', () => Logger.log('Audio: loadedmetadata event'));

      // Setup platform handlers
      if (isNative() && isPluginAvailable('MediaSession')) {
        try {
          Logger.log('Native: Setting up MediaSession handlers');
          
          if (MediaSession && typeof MediaSession.setActionHandler === 'function') {
            MediaSession.setActionHandler({ action: 'play' }, () => {
              Logger.log('Native: MediaSession Action: play');
              if (currentStationRef.current && playStationRef.current) {
                playStationRef.current(currentStationRef.current).catch(err => Logger.error("Native play handler error", err));
              } else if (audioRef.current) {
                audioRef.current.play().catch(err => Logger.error("Native play handler error", err));
              }
            }).catch(err => Logger.warn("Failed to set native play handler", err));
            
            MediaSession.setActionHandler({ action: 'pause' }, () => {
              Logger.log('Native: MediaSession Action: pause');
              if (stopStreamRef.current) {
                stopStreamRef.current();
              }
            }).catch(err => Logger.warn("Failed to set native pause handler", err));
            
            MediaSession.setActionHandler({ action: 'stop' }, () => {
              Logger.log('Native: MediaSession Action: stop');
              if (stopStationAndStreamRef.current) {
                stopStationAndStreamRef.current();
              }
            }).catch(err => Logger.warn("Failed to set native stop handler", err));
          } else {
            Logger.warn('Native: MediaSession or setActionHandler not available');
          }
        } catch (e) {
          Logger.error("Native: MediaSession initialization exception", e);
        }
      }
    }
  }, []);

  const fetchStations = async (query: string = '') => {
    setIsLoading(true);
    const mirrors = [
      'https://de1.api.radio-browser.info',
      'https://at1.api.radio-browser.info',
      'https://nl1.api.radio-browser.info',
      'https://fr1.api.radio-browser.info',
    ];

    let lastError: any = null;
    let success = false;

    for (const mirror of mirrors) {
      try {
        const response = await fetch(`${mirror}/json/stations/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            countrycode: 'IT',
            limit: 100,
            name: query,
            hidebroken: true,
            order: 'clickcount',
            reverse: true,
          }),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP status ${response.status}`);
        }
        
        const data = await response.json();
        setStations(Array.isArray(data) ? data : []);
        success = true;
        break; // Stop attempting other mirrors on success
      } catch (error: any) {
        console.warn(`Failed to fetch stations from ${mirror} (Error: ${error?.message || error}). Trying next mirror...`);
        lastError = error;
      }
    }

    if (!success) {
      console.error('Failed to fetch stations:', lastError);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      if (isActive) fetchStations(searchQuery);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery, isActive]);

  useEffect(() => {
    if (isActive && stations.length === 0) fetchStations();
  }, [isActive]);

  useEffect(() => {
    if (selectedStationDetail) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
    return () => { 
      document.body.style.overflow = '';
      document.body.style.paddingRight = ''; 
    };
  }, [selectedStationDetail]);

  const toggleFavorite = (station: RadioStation, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = { ...prev };
      if (next[station.stationuuid]) {
        delete next[station.stationuuid];
      } else {
        next[station.stationuuid] = station;
      }
      return next;
    });
  };

  const playStation = async (station: RadioStation) => {
    Logger.log('Radio: playStation called', { name: station.name, url: station.url_resolved });
    
    if (currentStationRef.current?.stationuuid === station.stationuuid) {
      Logger.log('Radio: Same station action');
      if (isPlayingRef.current || (audioRef.current && !audioRef.current.paused)) {
        Logger.log('Radio: Currently playing, stopping stream');
        stopStream();
        return;
      } else {
        Logger.log('Radio: Currently stopped/paused, starting fresh live stream');
        setIsAudioLoading(true);
        if (audioRef.current) {
          try {
            const audio = audioRef.current;
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            
            audio.src = station.url_resolved;
            const playPromise = audio.play();
            if (playPromise !== undefined) {
              await playPromise;
            }
            Logger.log('Radio: Stream restart success');
          } catch (err) {
            Logger.error("Playback start failed", err);
            setIsAudioLoading(false);
            stopStream();
          }
        }
        return;
      }
    }

    setCurrentStation(station);
    setIsAudioLoading(true);
    setIsPlaying(false);
    isPlayingRef.current = false;
    
    if (audioRef.current) {
      Logger.log('Radio: Preparing audio element for new source');
      const audio = audioRef.current;
      
      try {
        audio.pause();
        // Remove direct src assignment to avoid invalid state errors on some Android versions
        audio.removeAttribute('src');
        audio.load();
        
        Logger.log('Radio: Preparing metadata');
        const metadata: any = {
          title: station.name || 'Radio',
          artist: station.tags ? station.tags.split(',')[0].trim() : 'Radio',
          album: 'Flusso Radio'
        };

        if (station.favicon && station.favicon.startsWith('http')) {
          metadata.artwork = [{ 
            src: station.favicon, 
            sizes: '192x192',
            type: 'image/png' 
          }];
        }

        // Set metadata BEFORE playing to avoid crash on some Android versions
        if (isNative() && isPluginAvailable('MediaSession')) {
          if (typeof MediaSession.setMetadata === 'function') {
            Logger.log('Native: Setting metadata before play');
            await MediaSession.setMetadata(metadata).catch(e => Logger.error('Native: pre-play setMetadata error', e));
          }
        } else if ('mediaSession' in navigator && window.MediaMetadata) {
          navigator.mediaSession.metadata = new window.MediaMetadata(metadata);
        }

        Logger.log('Radio: Setting new src', station.url_resolved);
        if (!station.url_resolved || !station.url_resolved.startsWith('http')) {
          throw new Error('Invalid radio URL');
        }

        audio.src = station.url_resolved;
        
        Logger.log('Radio: Starting play() promise');
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
          await playPromise;
          Logger.log('Radio: play() promise resolved');
        }
      } catch (err) {
        Logger.error("Playback start failed", err);
        setIsAudioLoading(false);
        stopStream();
        return; 
      }
    }

    // Set actions with a small delay
    setTimeout(() => {
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler('play', () => {
            Logger.log('MediaSession Action: play');
            if (currentStationRef.current && playStationRef.current) {
              playStationRef.current(currentStationRef.current).catch(e => Logger.error('MS Play error', e));
            } else if (audioRef.current) {
              audioRef.current.play().catch(e => Logger.error('MS Play error', e));
            }
          });
          navigator.mediaSession.setActionHandler('pause', () => {
            Logger.log('MediaSession Action: pause');
            if (stopStreamRef.current) {
              stopStreamRef.current();
            }
          });
          navigator.mediaSession.setActionHandler('stop', () => {
            Logger.log('MediaSession Action: stop');
            if (stopStationAndStreamRef.current) {
              stopStationAndStreamRef.current();
            }
          });
        } catch (e) {
          Logger.error("MediaSession handlers error", e);
        }
      }
    }, 200);
  };

  const displayStations = useMemo(() => {
    if (!stations) return [];
    
    // Group and deduplicate by name (case-insensitive and trimmed), preferring logo (favicon)
    const nameMap = new Map<string, RadioStation>();
    
    for (const s of stations) {
      const normName = s.name.trim().toLowerCase();
      const existing = nameMap.get(normName);
      
      if (!existing) {
        nameMap.set(normName, s);
      } else {
        const currentHasLogo = !!(s.favicon && s.favicon.trim());
        const existingHasLogo = !!(existing.favicon && existing.favicon.trim());
        
        if (currentHasLogo && !existingHasLogo) {
          // Current has logo, existing doesn't -> overwrite
          nameMap.set(normName, s);
        } else if (currentHasLogo === existingHasLogo) {
          // Both have or neither has a logo -> prefer the one with more votes
          const currentScore = s.votes || 0;
          const existingScore = existing.votes || 0;
          if (currentScore > existingScore) {
            nameMap.set(normName, s);
          }
        }
      }
    }
    
    const uniqueStations = Array.from(nameMap.values());
    
    // Sort all stations alphabetically first
    const sortedAll = [...uniqueStations].sort((a, b) => a.name.localeCompare(b.name));
    
    // Convert favorites dict to array
    const favArray = Object.values(favorites).sort((a, b) => a.name.localeCompare(b.name));
    
    // Create a map of favorite UUIDs
    const favSet = new Set(Object.keys(favorites));
    
    // Filter out favorites from regular stations
    const nonFavStations = sortedAll.filter(s => !favSet.has(s.stationuuid));
    
    // If no search query, return favorites then non-favorites
    if (!searchQuery) {
      return [...favArray, ...nonFavStations];
    }
    
    // If search query, filter both and return
    const searchLower = searchQuery.toLowerCase();
    const matchingFavs = favArray.filter(f => 
      f.name.toLowerCase().includes(searchLower) || 
      (f.tags && f.tags.toLowerCase().includes(searchLower))
    );
    
    const matchingNonFavs = nonFavStations.filter(s => 
      s.name.toLowerCase().includes(searchLower) || 
      (s.tags && s.tags.toLowerCase().includes(searchLower))
    );
    
    return [...matchingFavs, ...matchingNonFavs];
  }, [stations, favorites, searchQuery]);

  return (
    <>
      <motion.main
        className={cn(
          "absolute inset-0 overflow-y-auto transition-opacity duration-300 transform-gpu will-change-scroll pb-32 bg-transparent scrollbar-hide",
          isActive ? "z-10 opacity-100 pointer-events-auto" : "z-0 opacity-0 pointer-events-none"
        )}
        initial={false}
      >
        <div className="flex-1 max-w-3xl mx-auto px-2 pt-0 pb-2 space-y-2">
          {isLoading && stations.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
               <Loader2 className="w-8 h-8 animate-spin text-red-500" />
            </div>
          ) : displayStations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500 px-6 text-center">
              <p className="text-lg font-medium text-white mb-1">Nessuna radio trovata</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {displayStations.map((station) => {
                const isFavorite = !!favorites[station.stationuuid];
                const isCurrent = currentStation?.stationuuid === station.stationuuid;

                return (
                  <motion.div
                    key={station.stationuuid}
                    layoutId={`radio-${station.stationuuid}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={cn(
                      "relative overflow-hidden rounded-2xl bg-white/5 dark:bg-black/20 backdrop-blur-xl border transform-gpu",
                      isCurrent ? "border-red-500/50 shadow-lg shadow-red-500/10" : "border-white/10 dark:border-white/5",
                      "cursor-pointer"
                    )}
                    onClick={() => setSelectedStationDetail(station)}
                  >
                    <div className="p-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {station.favicon ? (
                          <img 
                            src={station.favicon} 
                            alt="" 
                            className="w-full h-full object-cover" 
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                          />
                        ) : (
                          <div className="w-full h-full bg-red-500/20 text-red-500 flex items-center justify-center font-bold">
                            {station.name.substring(0, 2)}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0 overflow-hidden group/item">
                        <div className="flex whitespace-nowrap">
                          <h3 className={cn("text-white font-medium pr-8", station.name.length > 20 && "animate-marquee")}>
                            {station.name}
                          </h3>
                          {station.name.length > 20 && (
                            <h3 className="text-white font-medium pr-8 animate-marquee" aria-hidden="true">
                              {station.name}
                            </h3>
                          )}
                        </div>
                        {station.tags && (
                          <p className="text-xs text-gray-400 truncate mt-1">
                            {station.tags.split(',').slice(0, 3).join(', ')}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={(e) => toggleFavorite(station, e)}
                          className="p-2 rounded-full hover:bg-white/5 transition-colors"
                        >
                          <Heart 
                            className={cn("w-5 h-5", isFavorite ? "fill-red-500 text-red-500" : "text-gray-400")} 
                          />
                        </button>
                        
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            playStation(station);
                          }}
                          className="w-10 h-10 rounded-full bg-red-500/10 hover:bg-red-500/20 active:scale-95 flex items-center justify-center text-red-500 flex-shrink-0 transition-all cursor-pointer"
                        >
                          {isCurrent && isAudioLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : isCurrent && isPlaying ? (
                            <Square className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </motion.main>

      <AnimatePresence>
        {selectedStationDetail && (
          <motion.div 
            className="fixed inset-0 z-50 pointer-events-none transform-gpu"
            style={{ willChange: 'transform' }}
          >
            <motion.div 
              key="radio-reader-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="fixed inset-0 bg-black/60 backdrop-blur-md pointer-events-auto"
              onClick={() => setSelectedStationDetail(null)}
            />
            <motion.article 
              key="radio-reader-modal"
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 220 }}
              className="fixed inset-0 z-10 w-full h-full overflow-hidden flex flex-col transition-colors break-words font-sans bg-zinc-950/80 backdrop-blur-3xl scrollbar-hide pointer-events-auto shadow-2xl isolate transform-gpu"
            >
              {/* Top App Bar */}
              <div className="sticky top-0 z-20 px-4 py-4 flex items-center justify-between bg-gradient-to-b from-transparent to-transparent pointer-events-none">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setSelectedStationDetail(null)}
                  className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white pointer-events-auto transition-colors"
                  aria-label="Chiudi"
                >
                  <X className="w-5 h-5 text-gray-200" aria-hidden="true" />
                </motion.button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-12">
                <div className="max-w-2xl mx-auto w-full pt-4 flex flex-col gap-6">
                  
                  {/* Station Info Header */}
                  <div className="flex gap-4 items-start pr-8 mt-2">
                    <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center overflow-hidden flex-shrink-0 border border-white/10 shadow-inner">
                      {selectedStationDetail.favicon ? (
                        <img 
                          src={selectedStationDetail.favicon} 
                          alt="" 
                          className="w-full h-full object-cover" 
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                        />
                      ) : (
                        <div className="w-full h-full bg-red-500/20 text-red-500 flex items-center justify-center font-bold text-xl">
                          {selectedStationDetail.name.substring(0, 2)}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-bold text-white tracking-tight leading-snug truncate">
                        {selectedStationDetail.name}
                      </h2>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                        {selectedStationDetail.country || 'Italia'} • {selectedStationDetail.language || 'Italiano'}
                      </p>
                      
                      {selectedStationDetail.tags && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {selectedStationDetail.tags.split(',').slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="text-[10px] uppercase tracking-wider font-semibold bg-white/5 border border-white/5 text-gray-300 px-2.5 py-0.5 rounded-full">
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons: Play/Pause/Fav/Website */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => playStation(selectedStationDetail)}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm transition-all shadow-md active:scale-95 bg-red-500 hover:bg-red-600 text-white"
                    >
                      {currentStation?.stationuuid === selectedStationDetail.stationuuid && isAudioLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin font-bold text-white" />
                          Caricamento...
                        </>
                      ) : currentStation?.stationuuid === selectedStationDetail.stationuuid && isPlaying ? (
                        <>
                          <Square className="w-4 h-4 fill-current text-white" />
                          Interrompi
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current ml-0.5 text-white" />
                          Ascolta Ora
                        </>
                      )}
                    </button>

                    <button
                      onClick={(e) => toggleFavorite(selectedStationDetail, e)}
                      className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors active:scale-95 flex items-center justify-center"
                      aria-label="Preferiti"
                    >
                      <Heart
                        className={cn(
                          "w-5 h-5 transition-colors",
                          favorites[selectedStationDetail.stationuuid]
                            ? "fill-red-500 text-red-500"
                            : "text-gray-400 hover:text-white"
                        )}
                      />
                    </button>

                    {selectedStationDetail.homepage && (
                      <a
                        href={selectedStationDetail.homepage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white font-medium text-xs transition-all active:scale-95"
                      >
                        <Globe className="w-4 h-4" />
                        Sito
                      </a>
                    )}
                  </div>

                  {/* ACTIVE AUDIO VISUALIZER */}
                  {currentStation?.stationuuid === selectedStationDetail.stationuuid && isPlaying && (
                    <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-4 flex gap-4 items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Radio className="w-4 h-4 text-red-500 animate-pulse" />
                          <span className="text-sm font-bold text-red-500">In riproduzione</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          Streaming audio live attivo a bassa latenza.
                        </p>
                      </div>

                      <div className="flex items-end gap-1 h-8 w-12 justify-end pr-1 flex-shrink-0">
                        {[1, 2, 3, 4].map((bar) => (
                          <motion.div
                            key={bar}
                            animate={{
                              height: [6, 22, 9, 32, 12, 6][bar % 6]
                            }}
                            transition={{
                              duration: 0.5 + bar * 0.11,
                              repeat: Infinity,
                              ease: "easeInOut"
                            }}
                            className="w-1 bg-gradient-to-t from-red-600 to-red-400 rounded-full"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* DETTAGLI CANALE */}
                  <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                      <Info className="w-4 h-4 text-red-400" />
                      Dettagli Canale
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-3 bg-white/[0.02] border border-white/5 rounded-2xl p-4 text-xs">
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-500 font-medium">Nazione</span>
                        <span className="text-gray-200 font-semibold">{selectedStationDetail.country || 'Nazionale'}</span>
                      </div>
                      {selectedStationDetail.state && (
                        <div className="flex flex-col gap-1">
                          <span className="text-gray-500 font-medium">Stato / Regione</span>
                          <span className="text-gray-200 font-semibold">{selectedStationDetail.state}</span>
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-500 font-medium">Lingua</span>
                        <span className="text-gray-200 font-semibold capitalize">{selectedStationDetail.language || 'Italiano'}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-500 font-semibold flex items-center gap-1">
                          <ThumbsUp className="w-3.5 h-3.5 text-gray-400" /> Popolarità
                        </span>
                        <span className="text-gray-200 font-semibold">
                          {selectedStationDetail.votes ? `${selectedStationDetail.votes.toLocaleString()} voti` : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* SORGENTE STREAMING LINK */}
                  <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Sorgente Streaming Link
                    </h3>
                    <div className="flex gap-2 items-center bg-white/[0.02] hover:bg-[#1f1f2e] border border-white/5 rounded-2xl px-4 py-3 text-xs transition-colors group/url">
                      <span className="font-mono text-gray-400 truncate flex-1 select-all text-[11px]">
                        {selectedStationDetail.url_resolved || selectedStationDetail.url}
                      </span>
                      <button
                        onClick={() => copyToClipboard(selectedStationDetail.url_resolved || selectedStationDetail.url)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors flex-shrink-0 flex items-center gap-1"
                        title="Copia link sorgente"
                      >
                        {copiedUrl ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            </motion.article>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});
