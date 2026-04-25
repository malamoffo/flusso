import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Heart, Search, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { RadioStation } from '../types';
import { MediaSession } from '@capgo/capacitor-media-session';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

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
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('playing', () => {
        setIsPlaying(true);
        setIsAudioLoading(false);
        if (Capacitor.isNativePlatform()) {
          MediaSession.setPlaybackState({ playbackState: 'playing' }).catch(() => {});
        }
      });
      audioRef.current.addEventListener('pause', () => {
        setIsPlaying(false);
        if (Capacitor.isNativePlatform()) {
          MediaSession.setPlaybackState({ playbackState: 'paused' }).catch(() => {});
        }
      });
      audioRef.current.addEventListener('error', () => {
        setIsPlaying(false);
        setIsAudioLoading(false);
        if (Capacitor.isNativePlatform()) {
          MediaSession.setPlaybackState({ playbackState: 'none' }).catch(() => {});
        }
      });
      audioRef.current.addEventListener('waiting', () => setIsAudioLoading(true));
      audioRef.current.addEventListener('canplay', () => setIsAudioLoading(false));

      // Setup platform handlers
      if (Capacitor.isNativePlatform()) {
        try {
          MediaSession.setActionHandler({ action: 'play' }, () => {
            audioRef.current?.play();
          }).catch(() => {});
          MediaSession.setActionHandler({ action: 'pause' }, () => {
            audioRef.current?.pause();
          }).catch(() => {});
          MediaSession.setActionHandler({ action: 'stop' }, () => {
            audioRef.current?.pause();
            setCurrentStation(null);
            MediaSession.setPlaybackState({ playbackState: 'none' }).catch(() => {});
          }).catch(() => {});
        } catch (e) {
          console.warn("MediaSession API not initialized properly.", e);
        }
      }
    }
  }, []);

  const fetchStations = async (query: string = '') => {
    setIsLoading(true);
    try {
      const body = {
        countrycode: 'IT',
        limit: 100,
        name: query,
        hidebroken: true,
        order: 'clickcount',
        reverse: true,
      };
      
      const response = await fetch('https://de1.api.radio-browser.info/json/stations/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      setStations(data);
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
    if (currentStation?.stationuuid === station.stationuuid) {
      if (isPlaying) {
        audioRef.current?.pause();
      } else {
        setIsAudioLoading(true);
        audioRef.current?.play().catch(console.error);
      }
      return;
    }

    setCurrentStation(station);
    setIsAudioLoading(true);
    setIsPlaying(false);
    
    if (audioRef.current) {
      audioRef.current.src = station.url_resolved;
      try {
        await audioRef.current.play();
      } catch (err) {
        console.error("Playback failed", err);
        setIsAudioLoading(false);
      }
    }

    if (Capacitor.isNativePlatform()) {
      try {
        MediaSession.setMetadata({
          title: station.name || 'Radio',
          artist: station.tags ? station.tags.split(',')[0] : 'Radio',
          album: 'Flusso Radio',
          artwork: station.favicon ? [
            { src: station.favicon, sizes: '512x512', type: 'image/png' }
          ] : []
        }).catch(() => {});
      } catch (e) {
        console.warn("Could not set metadata for native media session", e);
      }
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: 'Radio',
        artwork: [
          { src: station.favicon || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?fit=crop&w=512&h=512&q=80', sizes: '512x512', type: 'image/png' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => {
        audioRef.current?.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audioRef.current?.pause();
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        audioRef.current?.pause();
        setCurrentStation(null);
      });
    }
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
