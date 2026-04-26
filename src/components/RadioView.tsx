import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Heart, Search, Loader2 } from 'lucide-react';
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
              audioRef.current?.play().catch(err => Logger.error("Native play handler error", err));
            }).catch(err => Logger.warn("Failed to set native play handler", err));
            
            MediaSession.setActionHandler({ action: 'pause' }, () => {
              Logger.log('Native: MediaSession Action: pause');
              audioRef.current?.pause();
            }).catch(err => Logger.warn("Failed to set native pause handler", err));
            
            MediaSession.setActionHandler({ action: 'stop' }, () => {
              Logger.log('Native: MediaSession Action: stop');
              audioRef.current?.pause();
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
    try {
      const response = await fetch('https://de1.api.radio-browser.info/json/stations/search', {
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
      const data = await response.json();
      setStations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch stations:', error);
    } finally {
      setIsLoading(false);
    }
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
        } catch (e) {
          Logger.error('Radio: Pause error', e);
        }
      } else {
        Logger.log('Radio: Resuming');
        setIsAudioLoading(true);
        try {
          const playPromise = audioRef.current?.play();
          if (playPromise !== undefined) {
             await playPromise;
          }
          Logger.log('Radio: Resume success');
        } catch (err) {
          Logger.error("Playback resume failed", err);
          setIsAudioLoading(false);
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
            audioRef.current?.play().catch(e => Logger.error('MS Play error', e));
          });
          navigator.mediaSession.setActionHandler('pause', () => {
            Logger.log('MediaSession Action: pause');
            audioRef.current?.pause();
          });
          navigator.mediaSession.setActionHandler('stop', () => {
            Logger.log('MediaSession Action: stop');
            audioRef.current?.pause();
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
    
    // Convert favorites dict to array for sorting
    const favArray = Object.values(favorites);
    
    // Create a map of favorite UUIDs
    const favSet = new Set(Object.keys(favorites));
    
    // Filter out favorites from regular stations
    const nonFavStations = stations.filter(s => !favSet.has(s.stationuuid));
    
    // If no search query, return favorites then top stations
    if (!searchQuery) {
      return [...favArray, ...nonFavStations];
    }
    
    // If search query, filter favorites matching query, then add fetched stations
    const searchLower = searchQuery.toLowerCase();
    const matchingFavs = favArray.filter(f => 
      f.name.toLowerCase().includes(searchLower) || 
      (f.tags && f.tags.toLowerCase().includes(searchLower))
    );
    
    return [...matchingFavs, ...nonFavStations];
  }, [stations, favorites, searchQuery]);

  return (
    <motion.main
      className={cn(
        "absolute inset-0 overflow-y-auto transition-opacity duration-300 will-change-transform pb-32 bg-transparent",
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
                    "relative overflow-hidden rounded-2xl bg-gray-900/40 backdrop-blur-md border",
                    isCurrent ? "border-red-500/50 shadow-lg shadow-red-500/10" : "border-white/5",
                    "cursor-pointer"
                  )}
                  onClick={() => playStation(station)}
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
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium truncate flex items-center gap-2">
                        {station.name}
                      </h3>
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
                      
                      <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 flex-shrink-0">
                        {isCurrent && isAudioLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : isCurrent && isPlaying ? (
                          <Square className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-5 h-5 fill-current ml-0.5" />
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </motion.main>
  );
});
