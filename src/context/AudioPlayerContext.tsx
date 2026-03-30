import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Article } from '../types';
import { useRss } from './RssContext';
import { parseDurationToSeconds } from '../lib/utils';

interface AudioPlayerStateContextType {
  currentTrack: Article | null;
  isPlaying: boolean;
  isBuffering: boolean;
  play: (track: Article) => void;
  pause: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  stop: () => void;
}

interface AudioPlayerProgressContextType {
  progress: number;
  duration: number;
}

const AudioPlayerStateContext = createContext<AudioPlayerStateContextType | undefined>(undefined);
const AudioPlayerProgressContext = createContext<AudioPlayerProgressContextType | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const { updateArticle } = useRss();
  const [currentTrack, setCurrentTrack] = useState<Article | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSavedProgressRef = useRef<number>(0);
  const currentTrackRef = useRef<Article | null>(null);

  // Keep track of current track in a ref for event listeners
  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  // Initialize audio element once
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    
    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);
      setIsBuffering(false);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handlePlaying = () => {
      setIsBuffering(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      setProgress(0);
      if (currentTrackRef.current) {
        updateArticle(currentTrackRef.current.id, { progress: 0 });
      }
    };

    const handleError = (e: any) => {
      // Ignore AbortError as it's usually caused by a new play request
      if (e?.name === 'AbortError') return;
      console.error("Audio error:", e);
      setIsPlaying(false);
      setIsBuffering(false);
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
        const currentProgress = progress / duration;
        // Save if progress changed significantly (more than 1%)
        if (Math.abs(currentProgress - lastSavedProgressRef.current) > 0.01) {
          updateArticle(currentTrack.id, { progress: currentProgress });
          lastSavedProgressRef.current = currentProgress;
        }
      }, 5000); // Every 5 seconds
      return () => clearInterval(interval);
    }
  }, [isPlaying, currentTrack, progress, duration, updateArticle]);

  // Media Session API for background controls
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.feedId, // Using feedId as artist for now
        artwork: currentTrack.imageUrl ? [{ src: currentTrack.imageUrl }] : []
      });

      // We use references to avoid dependency re-runs but we need to ensure handlers are fresh or use stable ones
    }
  }, [currentTrack]);

  // Handle media session actions with stable callbacks
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        if (audioRef.current && currentTrackRef.current) {
          audioRef.current.play();
          setIsPlaying(true);
        }
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        if (audioRef.current) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
      });
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        if (audioRef.current) {
          audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
        }
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        if (audioRef.current) {
          audioRef.current.currentTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 30);
        }
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          setIsPlaying(false);
          setCurrentTrack(null);
        }
      });
    }
  }, []);

  const play = useCallback((track: Article) => {
    if (!audioRef.current) return;

    if (currentTrack?.id !== track.id) {
      setCurrentTrack(track);
      audioRef.current.src = track.mediaUrl || '';
      audioRef.current.load();
      
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
    
    audioRef.current.play().then(() => {
      setIsPlaying(true);
      setIsBuffering(false);
    }).catch(err => {
      if (err.name === 'AbortError') {
        // Ignore AbortError as it's usually caused by a new play request
        return;
      }
      console.error("Playback failed:", err);
      setIsBuffering(false);
    });
    setIsBuffering(true);
  }, [currentTrack]);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setIsPlaying(false);
    
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
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setProgress(time);
    
    // Save progress on seek
    if (currentTrack && duration > 0) {
      const currentProgress = time / duration;
      updateArticle(currentTrack.id, { progress: currentProgress });
      lastSavedProgressRef.current = currentProgress;
    }
  }, [currentTrack, duration, updateArticle]);

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
  }, [currentTrack, progress, duration, updateArticle]);

  // ⚡ Bolt: Memoize state context value
  const stateValue = useMemo(() => ({
    currentTrack,
    isPlaying,
    isBuffering,
    play,
    pause,
    toggle,
    seek,
    stop
  }), [currentTrack, isPlaying, isBuffering, play, pause, toggle, seek, stop]);

  // ⚡ Bolt: Memoize progress context value (this will update frequently)
  const progressValue = useMemo(() => ({
    progress,
    duration
  }), [progress, duration]);

  return (
    <AudioPlayerStateContext.Provider value={stateValue}>
      <AudioPlayerProgressContext.Provider value={progressValue}>
        {children}
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
