import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Article } from '../types';
import { useRss } from './RssContext';
import { parseDurationToSeconds, getSafeUrl } from '../lib/utils';
import { fetchWithProxy } from '../utils/proxy';
import { MediaSession } from '@capgo/capacitor-media-session';
import QueuePlugin from '../plugins/QueuePlugin';
import Media3 from '../services/media3';
import { Capacitor } from '@capacitor/core';

interface AudioPlayerStateContextType {
  currentTrack: Article | null;
  isPlaying: boolean;
  isBuffering: boolean;
  play: (track: Article) => void;
  pause: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  stop: () => void;
  playNext: () => void;
  playPrevious: () => void;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
}

interface AudioPlayerProgressContextType {
  progress: number;
  duration: number;
}

const AudioPlayerStateContext = createContext<AudioPlayerStateContextType | undefined>(undefined);
const AudioPlayerProgressContext = createContext<AudioPlayerProgressContextType | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const { articles, updateArticle, settings, updateSettings, feeds } = useRss();
  const [currentTrack, setCurrentTrack] = useState<Article | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const ErrorPopup = () => errorMessage ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="p-6 bg-white rounded-lg shadow-xl max-w-sm w-full">
        <h3 className="text-lg font-bold mb-2">Errore di riproduzione</h3>
        <p className="text-gray-700 mb-4">{errorMessage}</p>
        <button 
          className="w-full py-2 bg-blue-600 text-white rounded"
          onClick={() => setErrorMessage(null)}
        >
          Chiudi
        </button>
      </div>
    </div>
  ) : null;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<number>(0);
  const lastSavedProgressRef = useRef<number>(0);
  const currentTrackRef = useRef<Article | null>(null);

  // Restore last played track
  useEffect(() => {
    if (articles.length > 0 && settings.lastPlayedArticleId && !currentTrack) {
      const track = articles.find(a => a.id === settings.lastPlayedArticleId);
      if (track) {
        setCurrentTrack(track);
      }
    }
  }, [articles, settings.lastPlayedArticleId]);

  // Update Media3 metadata when currentTrack changes
  useEffect(() => {
    if (Capacitor.isNativePlatform() && currentTrack) {
      const feed = feeds.find(f => f.id === currentTrack.feedId);
      const safeMediaUrl = getSafeUrl(currentTrack.mediaUrl, '');
      Media3.updateMetadata({
        id: currentTrack.id,
        title: currentTrack.title,
        artist: feed?.title || 'Podcast',
        url: safeMediaUrl,
        image: currentTrack.imageUrl || feed?.imageUrl || ''
      }).catch(console.error);
    }
  }, [currentTrack, feeds]);

  // Save last played track
  useEffect(() => {
    if (currentTrack && currentTrack.id !== settings.lastPlayedArticleId) {
      updateSettings({ lastPlayedArticleId: currentTrack.id });
    }
  }, [currentTrack, settings.lastPlayedArticleId, updateSettings]);


  // Get the current queue: queued and favorited podcasts
  const queue = useMemo(() => articles.filter(a => (a.isQueued || a.isFavorite) && a.type === 'podcast'), [articles]);
  const recentPodcasts = useMemo(() => articles
    .filter(a => a.type === 'podcast' && a.lastPlayedAt)
    .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))
    .slice(0, 20), [articles]);
  const favoritePodcasts = useMemo(() => articles.filter(a => a.isFavorite && a.type === 'podcast'), [articles]);
  
  const queueRef = useRef<Article[]>([]);
  
  useEffect(() => {
    queueRef.current = queue;
    if (Capacitor.isNativePlatform()) {
      const mapTrack = (a: Article) => {
        const feed = feeds.find(f => f.id === a.feedId);
        return {
          id: a.id,
          title: a.title,
          artist: feed?.title || 'Podcast',
          album: 'Flusso',
          artwork: a.imageUrl || feed?.imageUrl,
          url: getSafeUrl(a.mediaUrl, '')
        };
      };

      const mappedQueue = queue.map(mapTrack);
      const mappedRecent = recentPodcasts.map(mapTrack);
      const mappedFavorites = favoritePodcasts.map(mapTrack);

      QueuePlugin.setQueue({ 
        queue: mappedQueue,
        recent: mappedRecent,
        favorites: mappedFavorites
      }).then(() => console.log("Queue sent to native:", { 
        queueCount: mappedQueue.length, 
        recentCount: mappedRecent.length, 
        favoritesCount: mappedFavorites.length 
      })).catch(console.error);

      Media3.setFavorites({ favorites: mappedFavorites }).catch(console.error);
      Media3.setRecent({ recent: mappedRecent }).catch(console.error);
    }
  }, [queue, recentPodcasts, favoritePodcasts, feeds]);

  const playNextRef = useRef<() => void>(() => {});

  // Keep track of current track in a ref for event listeners
  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  // Initialize audio element once
  useEffect(() => {
    const audio = new Audio();
    // ⚡ Bolt: Removed crossOrigin = 'anonymous' to improve compatibility with podcast servers
    // that don't support CORS. This is safe as we don't use the Web Audio API or Canvas with audio.
    audioRef.current = audio;
    
    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);
      progressRef.current = audio.currentTime;
      setIsBuffering(false);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      audio.playbackRate = playbackRate;
      if (Capacitor.getPlatform() === 'ios') {
        const currentDuration = audio.duration;
        MediaSession.setPositionState({
          duration: isNaN(currentDuration) ? 0 : currentDuration,
          playbackRate: audio.playbackRate,
          position: audio.currentTime
        }).catch(console.error);
      }
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handlePlaying = () => {
      setIsBuffering(false);
      audio.playbackRate = playbackRate;
      if (Capacitor.getPlatform() === 'ios') {
        MediaSession.setPlaybackState({ playbackState: 'playing' }).catch(console.error);
        const currentDuration = audio.duration;
        MediaSession.setPositionState({
          duration: isNaN(currentDuration) ? 0 : currentDuration,
          playbackRate: audio.playbackRate,
          position: audio.currentTime
        }).catch(console.error);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      setProgress(0);
      if (Capacitor.getPlatform() === 'ios') MediaSession.setPlaybackState({ playbackState: 'none' }).catch(console.error);
      if (currentTrackRef.current) {
        updateArticle(currentTrackRef.current.id, { progress: 0 });
        // Auto-play next in queue if available
        playNextRef.current();
      }
    };

    const handleError = (e: any) => {
      // Ignore AbortError as it's usually caused by a new play request
      if (e?.name === 'AbortError') return;
      
      const audio = audioRef.current;
      const error = audio?.error;
      let errorMessage = "Unknown audio error";
      
      if (error) {
        switch (error.code) {
          case 1: errorMessage = "MEDIA_ERR_ABORTED: Fetching process aborted by user."; break;
          case 2: errorMessage = "MEDIA_ERR_NETWORK: Network error occurred."; break;
          case 3: errorMessage = "MEDIA_ERR_DECODE: Decoding error occurred."; break;
          case 4: errorMessage = "MEDIA_ERR_SRC_NOT_SUPPORTED: The media resource indicated by the src attribute or assigned media provider object was not suitable."; break;
        }
        if (error.message) errorMessage += ` (${error.message})`;
      }

      console.error("[AUDIO] Web playback error:", errorMessage, {
        src: audio?.src,
        networkState: audio?.networkState,
        readyState: audio?.readyState
      });
      
      setIsPlaying(false);
      setIsBuffering(false);
      if (Capacitor.getPlatform() === 'ios') MediaSession.setPlaybackState({ playbackState: 'none' }).catch(console.error);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
  }, [updateArticle]);

  // Periodically save progress
  useEffect(() => {
    if (isPlaying && currentTrack && duration > 0) {
      const interval = setInterval(() => {
        const currentProgress = progressRef.current / duration;
        // Save if progress changed significantly (more than 1%)
        if (Math.abs(currentProgress - lastSavedProgressRef.current) > 0.01) {
          updateArticle(currentTrack.id, { progress: currentProgress });
          lastSavedProgressRef.current = currentProgress;
        }
      }, 5000); // Every 5 seconds
      return () => clearInterval(interval);
    }
  }, [isPlaying, currentTrack, duration, updateArticle]);

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
      if (Capacitor.getPlatform() === 'ios' && isPlaying) {
        MediaSession.setPositionState({
          duration: audioRef.current.duration || duration,
          playbackRate: rate,
          position: audioRef.current.currentTime
        }).catch(console.error);
      }
    }
  }, [isPlaying, duration]);

  const play = useCallback(async (track: Article) => {
    if (!audioRef.current) return;

    const safeMediaUrl = getSafeUrl(track.mediaUrl, '');
    if (!safeMediaUrl) {
      console.error("No valid media URL for track:", track.id);
      return;
    }

    setIsBuffering(true);

    const isNewTrack = currentTrack?.id !== track.id;
    const isMissingSrcWeb = !Capacitor.isNativePlatform() && (!audioRef.current.src || audioRef.current.src === window.location.href || audioRef.current.src.endsWith('/'));

    if (isNewTrack) {
      setCurrentTrack(track);
      updateArticle(track.id, { lastPlayedAt: Date.now() });
      
      // Fetch chapters if needed
      if (track.chaptersUrl && (!track.chapters || track.chapters.length === 0)) {
        fetchWithProxy(track.chaptersUrl, false)
          .then(text => JSON.parse(text))
          .then(data => {
            if (data && data.chapters && Array.isArray(data.chapters)) {
              const mappedChapters = data.chapters.map((c: any) => ({
                startTime: Number(c.startTime) || 0,
                title: c.title || 'Untitled Chapter',
                url: c.url,
                imageUrl: c.img || c.image || c.imageUrl
              }));
              updateArticle(track.id, { chapters: mappedChapters });
              setCurrentTrack(prev => prev?.id === track.id ? { ...prev, chapters: mappedChapters } : prev);
            }
          })
          .catch(err => console.error('Failed to fetch chapters:', err));
      }
    }

    if (isNewTrack || isMissingSrcWeb) {
      // Resume from saved progress if available
      if (track.progress && track.progress > 0) {
        const resumeTime = track.progress * (track.duration ? parseDurationToSeconds(track.duration) : 0);
        if (resumeTime > 0) {
          audioRef.current.currentTime = resumeTime;
          setProgress(resumeTime);
          lastSavedProgressRef.current = track.progress;
        }
      } else {
        lastSavedProgressRef.current = 0;
      }
    }
    
    if (Capacitor.isNativePlatform()) {
      console.log("[AUDIO] Native play request for:", track.id);
      
      const attemptPlay = async (retries: number): Promise<void> => {
        try {
          const feed = feeds.find(f => f.id === track.feedId);
          await Media3.updateMetadata({
            id: track.id,
            title: track.title,
            artist: feed?.title || 'Podcast',
            url: safeMediaUrl,
            image: track.imageUrl || feed?.imageUrl || ''
          });
          
          // Use resetAndPlay for native to ensure a clean state
          await Media3.resetAndPlay();
          
          console.log("[AUDIO] Native play success");
          setIsPlaying(true);
          setIsBuffering(false);
        } catch (err) {
          if (retries > 0) {
            console.warn(`[AUDIO] Native playback failed, retrying... (${retries} left)`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return attemptPlay(retries - 1);
          }
          console.error("[AUDIO] Native playback failed after retries:", err);
          setErrorMessage("Impossibile avviare la riproduzione nativa. Riprova più tardi.");
          setIsBuffering(false);
        }
      };

      await attemptPlay(3);
    } else {
      if (isNewTrack || isMissingSrcWeb) {
        console.log("[AUDIO] Setting web src:", safeMediaUrl);
        audioRef.current.src = safeMediaUrl;
      }
      console.log("[AUDIO] Web play request for:", track.id);
      audioRef.current.play().then(() => {
        console.log("[AUDIO] Web play success");
        setIsPlaying(true);
        setIsBuffering(false);
      }).catch(err => {
        if (err.name === 'AbortError') {
          console.log("[AUDIO] Web play aborted (new request)");
          setIsBuffering(false);
          return;
        }
        
        // If it failed with a "not suitable" error, try a proxy as fallback
        const audio = audioRef.current;
        if (audio && (audio.error?.code === 4 || err.message?.includes('suitable'))) {
          const proxiedUrl = `https://corsproxy.io/?${encodeURIComponent(safeMediaUrl)}`;
          console.warn("[AUDIO] Web playback failed, retrying with proxy:", proxiedUrl);
          audio.src = proxiedUrl;
          audio.play().then(() => {
            console.log("[AUDIO] Web play success via proxy");
            setIsPlaying(true);
            setIsBuffering(false);
          }).catch(proxyErr => {
            console.error("[AUDIO] Web playback failed even with proxy:", proxyErr);
            setIsBuffering(false);
          });
        } else {
          console.error("[AUDIO] Web playback failed:", err);
          setIsBuffering(false);
        }
      });
    }
  }, [currentTrack, feeds, updateArticle]);

  // Check for pending media ID from Android Auto
  useEffect(() => {
    if (Capacitor.isNativePlatform() && articles.length > 0) {
      QueuePlugin.getPendingMediaId().then(({ mediaId }) => {
        if (mediaId) {
          const trackToPlay = articles.find(a => a.id === mediaId);
          if (trackToPlay) {
            play(trackToPlay);
          }
        }
      }).catch(console.error);
    }
  }, [articles, play]);

  const playNext = useCallback(() => {
    if (!currentTrackRef.current) return;
    
    // Determine which list we are currently playing from
    let currentList = queue;
    let currentIndex = currentList.findIndex(a => a.id === currentTrackRef.current?.id);
    
    if (currentIndex === -1) {
      currentList = recentPodcasts;
      currentIndex = currentList.findIndex(a => a.id === currentTrackRef.current?.id);
    }
    
    if (currentIndex !== -1 && currentIndex < currentList.length - 1) {
      play(currentList[currentIndex + 1]);
    }
  }, [queue, recentPodcasts, play]);

  const playPrevious = useCallback(() => {
    if (!currentTrackRef.current) return;
    
    // Determine which list we are currently playing from
    let currentList = queue;
    let currentIndex = currentList.findIndex(a => a.id === currentTrackRef.current?.id);
    
    if (currentIndex === -1) {
      currentList = recentPodcasts;
      currentIndex = currentList.findIndex(a => a.id === currentTrackRef.current?.id);
    }
    
    if (currentIndex > 0) {
      play(currentList[currentIndex - 1]);
    }
  }, [queue, recentPodcasts, play]);

  // Update the ref for handleEnded
  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  // Listen for play requests from Android Auto
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const listener = QueuePlugin.addListener('playRequest', (data) => {
        const trackToPlay = articles.find(a => a.id === data.id);
        if (trackToPlay) {
          play(trackToPlay);
        }
      });
      return () => {
        listener.then(l => l.remove());
      };
    }
  }, [articles, play]);

  const pause = useCallback(() => {
    if (Capacitor.isNativePlatform()) {
      Media3.pause().catch(console.error);
      setIsPlaying(false);
    } else {
      if (!audioRef.current) return;
      audioRef.current.pause();
      setIsPlaying(false);
    }
    
    if (Capacitor.getPlatform() === 'ios') {
      MediaSession.setPlaybackState({ playbackState: 'paused' }).catch(console.error);
      const currentDuration = audioRef.current.duration;
      MediaSession.setPositionState({
        duration: isNaN(currentDuration) ? duration : currentDuration,
        playbackRate: 0,
        position: audioRef.current.currentTime
      }).catch(console.error);
    }
    
    // Save progress on pause
    if (currentTrack && duration > 0) {
      const currentProgress = progress / duration;
      updateArticle(currentTrack.id, { progress: currentProgress });
      lastSavedProgressRef.current = currentProgress;
    }
  }, [currentTrack, progress, duration, updateArticle]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
    } else if (currentTrack) {
      play(currentTrack);
    }
  }, [isPlaying, currentTrack, play, pause]);

  const seek = useCallback((time: number) => {
    if (Capacitor.isNativePlatform()) {
      Media3.seek({ position: time * 1000 }).catch(console.error);
      setProgress(time);
    } else {
      if (!audioRef.current) return;
      audioRef.current.currentTime = time;
      setProgress(time);
    }
    
    if (Capacitor.getPlatform() === 'ios') {
      const currentDuration = audioRef.current.duration;
      MediaSession.setPositionState({
        duration: isNaN(currentDuration) ? duration : currentDuration,
        playbackRate: isPlaying ? audioRef.current.playbackRate : 0,
        position: time
      }).catch(console.error);
    }

    // Save progress on seek
    if (currentTrack && duration > 0) {
      const currentProgress = time / duration;
      updateArticle(currentTrack.id, { progress: currentProgress });
      lastSavedProgressRef.current = currentProgress;
    }
  }, [currentTrack, duration, updateArticle, isPlaying]);

  const stop = useCallback(() => {
    if (!audioRef.current) return;
    
    // Save progress before stopping
    if (currentTrack && duration > 0) {
      const currentProgress = progress / duration;
      updateArticle(currentTrack.id, { progress: currentProgress });
    }
    
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentTrack(null);
    if (Capacitor.getPlatform() === 'ios') MediaSession.setPlaybackState({ playbackState: 'none' }).catch(console.error);
  }, [currentTrack, progress, duration, updateArticle]);

  // Media Session API for background controls (iOS only, Android uses Media3Service)
  useEffect(() => {
    if (currentTrack && Capacitor.getPlatform() === 'ios') {
      const feed = feeds.find(f => f.id === currentTrack.feedId);
      MediaSession.setMetadata({
        title: currentTrack.title,
        artist: feed?.title || 'Podcast', // Use feed title if found, else generic 'Podcast'
        album: 'Flusso',
        artwork: (currentTrack.imageUrl || feed?.imageUrl) ? [{ src: currentTrack.imageUrl || feed!.imageUrl! }] : []
      }).catch(console.error);

      MediaSession.setActionHandler({ action: 'play' }, () => {
        console.log("MediaSession play action handler called");
        if (currentTrack) {
          play(currentTrack);
        } else if (queue.length > 0) {
          play(queue[0]);
        }
      });
      MediaSession.setActionHandler({ action: 'pause' }, () => {
        console.log("MediaSession pause action handler called");
        pause();
      });
      MediaSession.setActionHandler({ action: 'seekbackward' }, () => seek(Math.max(0, progress - 10)));
      MediaSession.setActionHandler({ action: 'seekforward' }, () => seek(Math.min(duration, progress + 30)));
      MediaSession.setActionHandler({ action: 'stop' }, () => stop());
      
      // Android Auto / Media Session Queue Support
      MediaSession.setActionHandler({ action: 'previoustrack' }, () => playPrevious());
      MediaSession.setActionHandler({ action: 'nexttrack' }, () => playNext());
    }
  }, [currentTrack, progress, duration, playNext, playPrevious, seek, stop, feeds, play, pause, queue]);

  // ⚡ Bolt: Memoize state context value
  const stateValue = useMemo(() => ({
    currentTrack,
    isPlaying,
    isBuffering,
    play,
    pause,
    toggle,
    seek,
    stop,
    playNext,
    playPrevious,
    playbackRate,
    setPlaybackRate
  }), [currentTrack, isPlaying, isBuffering, play, pause, toggle, seek, stop, playNext, playPrevious, playbackRate, setPlaybackRate]);

  // ⚡ Bolt: Memoize progress context value (this will update frequently)
  const progressValue = useMemo(() => ({
    progress,
    duration
  }), [progress, duration]);

  // Listen for playback state changes from Media3
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const stateListener = Media3.addListener('onPlaybackStateChanged', (data) => {
        setIsPlaying(data.isPlaying);
      });
      const positionListener = Media3.addListener('onPositionChanged', (data) => {
        setProgress(data.position / 1000);
        progressRef.current = data.position / 1000;
      });
      const playRequestListener = Media3.addListener('playRequest', (data) => {
        const trackToPlay = articles.find(a => a.id === data.id);
        if (trackToPlay) {
          play(trackToPlay);
        }
      });
      return () => {
        stateListener.then(l => l.remove());
        positionListener.then(l => l.remove());
        playRequestListener.then(l => l.remove());
      };
    }
  }, []);

  return (
    <AudioPlayerStateContext.Provider value={stateValue}>
      <AudioPlayerProgressContext.Provider value={progressValue}>
        {children}
        <ErrorPopup />
      </AudioPlayerProgressContext.Provider>
    </AudioPlayerStateContext.Provider>
  );
}

/**
 * ⚡ Bolt: Custom hook to access audio player state.
 * Use this for components that only need to know WHAT is playing or need actions.
 */
export function useAudioState() {
  const context = useContext(AudioPlayerStateContext);
  if (context === undefined) {
    throw new Error('useAudioState must be used within an AudioPlayerProvider');
  }
  return context;
}

/**
 * ⚡ Bolt: Custom hook to access audio player progress.
 * Use this for components that need to display REAL-TIME progress (seek bars, timers).
 * Warning: Components using this will re-render frequently during playback.
 */
export function useAudioProgress() {
  const context = useContext(AudioPlayerProgressContext);
  if (context === undefined) {
    throw new Error('useAudioProgress must be used within an AudioPlayerProvider');
  }
  return context;
}

/**
 * @deprecated Use useAudioState or useAudioProgress for better performance.
 */
export function useAudioPlayer() {
  const state = useAudioState();
  const progress = useAudioProgress();
  return { ...state, ...progress };
}