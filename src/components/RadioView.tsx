import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Heart, Search, Loader2, Globe, Clock, Calendar, X, Radio } from 'lucide-react';
import { cn } from '../lib/utils';
import { RadioStation } from '../types';
import { MediaSession } from '@capgo/capacitor-media-session';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Logger } from '../lib/logger';
import { isPluginAvailable, isNative } from '../utils/platform';
import { getRadioSchedule } from '../utils/radioSchedule';

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
  const currentStationRef = useRef<RadioStation | null>(null);
  const playStationRef = useRef<((station: RadioStation) => Promise<any>) | null>(null);
  
  const [selectedStationDetail, setSelectedStationDetail] = useState<RadioStation | null>(null);

  const scheduleData = useMemo(() => {
    if (!selectedStationDetail) return null;
    return getRadioSchedule(selectedStationDetail);
  }, [selectedStationDetail]);

  // Keep refs updated to prevent stale closures in event and media session handlers
  useEffect(() => {
    currentStationRef.current = currentStation;
  }, [currentStation]);

  useEffect(() => {
    playStationRef.current = playStation;
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
        setIsPlaying(true);
        setIsAudioLoading(false);
        if (isNative() && isPluginAvailable('MediaSession')) {
          if (MediaSession && typeof MediaSession.setPlaybackState === 'function') {
            Logger.log('Native: setting playbackState to playing');
            MediaSession.setPlaybackState({ playbackState: 'playing' }).catch(err => {
              Logger.error('Native: setPlaybackState error', err);
            });
          }
        }
      });

      audio.addEventListener('pause', () => {
        Logger.log('Audio: pause event');
        setIsPlaying(false);
        if (isNative() && isPluginAvailable('MediaSession')) {
          if (MediaSession && typeof MediaSession.setPlaybackState === 'function') {
            Logger.log('Native: setting playbackState to paused');
            MediaSession.setPlaybackState({ playbackState: 'paused' }).catch(err => {
              Logger.error('Native: setPlaybackState error', err);
            });
          }
        }
      });

      audio.addEventListener('error', (e) => {
        const error = (e.target as any).error;
        Logger.error('Audio: error event', { 
          code: error?.code, 
          message: error?.message, 
          src: audio.src 
        });
        setIsPlaying(false);
        setIsAudioLoading(false);
        if (isNative() && isPluginAvailable('MediaSession')) {
          if (MediaSession && typeof MediaSession.setPlaybackState === 'function') {
            MediaSession.setPlaybackState({ playbackState: 'none' }).catch(() => {});
          }
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
              } else {
                audioRef.current?.play().catch(err => Logger.error("Native play handler error", err));
              }
            }).catch(err => Logger.warn("Failed to set native play handler", err));
            
            MediaSession.setActionHandler({ action: 'pause' }, () => {
              Logger.log('Native: MediaSession Action: pause');
              if (currentStationRef.current && playStationRef.current) {
                playStationRef.current(currentStationRef.current).catch(err => Logger.error("Native pause handler error", err));
              } else {
                audioRef.current?.pause();
              }
            }).catch(err => Logger.warn("Failed to set native pause handler", err));
            
            MediaSession.setActionHandler({ action: 'stop' }, () => {
              Logger.log('Native: MediaSession Action: stop');
              audioRef.current?.pause();
              if (audioRef.current) {
                audioRef.current.removeAttribute('src');
                audioRef.current.load();
              }
              setCurrentStation(null);
              if (typeof MediaSession.setPlaybackState === 'function') {
                MediaSession.setPlaybackState({ playbackState: 'none' }).catch(() => {});
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
    
    if (currentStation?.stationuuid === station.stationuuid) {
      Logger.log('Radio: Same station, toggling playback');
      if (isPlaying) {
        Logger.log('Radio: Pausing');
        try {
          audioRef.current?.pause();
          // Clear src on pause to save bandwidth and prevent stale live socket error
          if (audioRef.current) {
            audioRef.current.removeAttribute('src');
            audioRef.current.load();
          }
        } catch (e) {
          Logger.error('Radio: Pause error', e);
        }
      } else {
        Logger.log('Radio: Resuming live stream from fresh URL');
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
            Logger.log('Radio: Resume success');
          } catch (err) {
            Logger.error("Playback resume failed", err);
            setIsAudioLoading(false);
          }
        }
      }
      return;
    }

    setCurrentStation(station);
    setIsAudioLoading(true);
    setIsPlaying(false);
    
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
        if (isNative() && isPluginAvailable('MediaSession')) {
          if (MediaSession && typeof MediaSession.setPlaybackState === 'function') {
            MediaSession.setPlaybackState({ playbackState: 'none' }).catch(() => {});
          }
        }
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
            } else {
              audioRef.current?.play().catch(e => Logger.error('MS Play error', e));
            }
          });
          navigator.mediaSession.setActionHandler('pause', () => {
            Logger.log('MediaSession Action: pause');
            if (currentStationRef.current && playStationRef.current) {
              playStationRef.current(currentStationRef.current).catch(e => Logger.error('MS Pause error', e));
            } else {
              audioRef.current?.pause();
            }
          });
          navigator.mediaSession.setActionHandler('stop', () => {
            Logger.log('MediaSession Action: stop');
            audioRef.current?.pause();
            if (audioRef.current) {
              audioRef.current.removeAttribute('src');
              audioRef.current.load();
            }
            setCurrentStation(null);
          });
        } catch (e) {
          Logger.error("MediaSession handlers error", e);
        }
      }
    }, 200);
  };

  const displayStations = useMemo(() => {
    if (!stations) return [];
    
    // Remove duplicates
    const uniqueStations = Array.from(new Map(stations.map(s => [s.stationuuid, s])).values());
    
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
        {selectedStationDetail && scheduleData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
            onClick={() => setSelectedStationDetail(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl bg-[#14141d] border border-white/10 p-6 text-white shadow-2xl scrollbar-hide flex flex-col gap-5"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedStationDetail(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-gray-400 hover:text-white transition-colors"
                aria-label="Chiudi"
              >
                <X className="w-5 h-5" />
              </button>

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
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm transition-all shadow-md active:scale-95",
                    currentStation?.stationuuid === selectedStationDetail.stationuuid && isPlaying
                      ? "bg-white text-gray-900 hover:bg-gray-100"
                      : "bg-red-500 hover:bg-red-600 text-white"
                  )}
                >
                  {currentStation?.stationuuid === selectedStationDetail.stationuuid && isAudioLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin font-bold" />
                      Caricamento...
                    </>
                  ) : currentStation?.stationuuid === selectedStationDetail.stationuuid && isPlaying ? (
                    <>
                      <Square className="w-4 h-4 fill-current text-gray-900" />
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

              {/* NOW BROADCASTING SECTION */}
              <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex gap-4 items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Radio className="w-4 h-4 text-red-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">In onda ora</span>
                  </div>
                  <p className="text-base font-bold text-white leading-tight truncate">
                    {scheduleData.currentProgram.title}
                  </p>
                  <p className="text-xs text-gray-400 font-semibold mt-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    {scheduleData.currentProgram.time}
                  </p>
                  <p className="text-xs text-gray-300 mt-2 line-clamp-2 leading-relaxed">
                    {scheduleData.currentProgram.description}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-2.5">
                    Conduttore: <span className="text-white font-medium">{scheduleData.currentProgram.host}</span>
                  </p>
                </div>

                {currentStation?.stationuuid === selectedStationDetail.stationuuid && isPlaying && (
                  <div className="flex items-end gap-1 h-10 w-12 justify-end pr-1 flex-shrink-0">
                    {[1, 2, 3, 4].map((bar) => (
                      <motion.div
                        key={bar}
                        animate={{
                          height: [6, 26, 11, 38, 14, 6][bar % 6]
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
                )}
              </div>

              {/* PALINSESTO / SCHEDULE SECTION */}
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  Palinsesto Odierno
                </h3>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-hide divide-y divide-white/5">
                  {scheduleData.schedule.map((item) => {
                    const isCurrentItem = item.id === scheduleData.currentProgram.id;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "pt-3 first:pt-0 pb-3 last:pb-0 flex flex-col gap-1 transition-all",
                          isCurrentItem && "bg-red-500/5 px-2 rounded-xl border border-red-500/10 font-medium"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn(
                            "text-xs font-mono tracking-tight font-medium",
                            isCurrentItem ? "text-red-400" : "text-gray-400"
                          )}>
                            {item.time}
                          </p>
                          {isCurrentItem && (
                            <span className="text-[8px] font-bold uppercase tracking-wider text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full flex items-center gap-1 border border-red-500/10">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                              Ora in onda
                            </span>
                          )}
                        </div>
                        <h4 className={cn(
                          "text-sm font-semibold",
                          isCurrentItem ? "text-white" : "text-gray-200"
                        )}>
                          {item.title}
                        </h4>
                        <p className="text-xs text-gray-400 leading-normal">
                          {item.description}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          Conduttore: <span className="text-gray-300">{item.host}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});
