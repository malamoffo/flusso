import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Article } from '../types';
import { useRss } from './RssContext';
import { parseDurationToSeconds } from '../lib/utils';
import { MediaSession } from '@capgo/capacitor-media-session';
import QueuePlugin from '../plugins/QueuePlugin';
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
}

interface AudioPlayerProgressContextType {
  progress: number;
  duration: number;
}

const AudioPlayerStateContext = createContext<AudioPlayerStateContextType | undefined>(undefined);
const AudioPlayerProgressContext = createContext<AudioPlayerProgressContextType | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const { articles, updateArticle } = useRss();
  const [currentTrack, setCurrentTrack] = useState<Article | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<number>(0);
  const lastSavedProgressRef = useRef<number>(0);
  const currentTrackRef = useRef<Article | null>(null);

  // Get the current queue
  const queue = articles.filter(a => a.isQueued);
  const queueRef = useRef<Article[]>([]);
  const { feeds } = useRss();
  
  useEffect(() => {
    queueRef.current = queue;
    if (Capacitor.isNativePlatform()) {
      const queueData = queue.map(a => {
        const feed = feeds.find(f => f.id === a.feedId);
        return {
          id: a.id,
          title: a.title,
          artist: feed?.title || 'Podcast',
          album: 'Flusso',
          artwork: a.imageUrl || feed?.imageUrl
        };
      });
      QueuePlugin.setQueue({ queue: queueData }).catch(console.error);
    }
  }, [queue, feeds]);

  const playNextRef = useRef<() => void>(() => {});

  // Keep track of current track in a ref for event listeners
  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  // Initialize audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;
    
    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);
      progressRef.current = audio.currentTime;
      setIsBuffering(false);
      
      // Update position state for media session
      if (audio.duration > 0) {
        MediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: audio.currentTime
        }).catch(console.error);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      MediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: audio.currentTime
      }).catch(console.error);
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handlePlaying = () => {
      setIsBuffering(false);
      MediaSession.setPlaybackState({ playbackState: 'playing' }).catch(console.error);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      setProgress(0);
      MediaSession.setPlaybackState({ playbackState: 'none' }).catch(console.error);
      if (currentTrackRef.current) {
        updateArticle(currentTrackRef.current.id, { progress: 0 });
        // Auto-play next in queue if available
        playNextRef.current();
      }
    };

    const handleError = (e: any) => {
      // Ignore AbortError as it's usually caused by a new play request
      if (e?.name === 'AbortError') return;
      console.error("Audio error:", e);
      setIsPlaying(false);
      setIsBuffering(false);
      MediaSession.setPlaybackState({ playbackState: 'none' }).catch(console.error);
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

  const playNext = useCallback(() => {
    if (!currentTrackRef.current) return;
    const currentIndex = queue.findIndex(a => a.id === currentTrackRef.current?.id);
    if (currentIndex !== -1 && currentIndex < queue.length - 1) {
      play(queue[currentIndex + 1]);
    }
  }, [queue, play]);

  const playPrevious = useCallback(() => {
    if (!currentTrackRef.current) return;
    const currentIndex = queue.findIndex(a => a.id === currentTrackRef.current?.id);
    if (currentIndex > 0) {
      play(queue[currentIndex - 1]);
    }
  }, [queue, play]);

  // Update the ref for handleEnded
  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  // Listen for play requests from Android Auto
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const listener = QueuePlugin.addListener('playRequest', (data) => {
        const trackToPlay = queue.find(a => a.id === data.id);
        if (trackToPlay) {
          play(trackToPlay);
        }
      });
      return () => {
        listener.then(l => l.remove());
      };
    }
  }, [queue, play]);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setIsPlaying(false);
    MediaSession.setPlaybackState({ playbackState: 'paused' }).catch(console.error);
    
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
    MediaSession.setPlaybackState({ playbackState: 'none' }).catch(console.error);
  }, [currentTrack, progress, duration, updateArticle]);

  // Media Session API for background controls
  useEffect(() => {
    if (currentTrack) {
      const feed = feeds.find(f => f.id === currentTrack.feedId);
      MediaSession.setMetadata({
        title: currentTrack.title,
        artist: feed?.title || 'Podcast', // Use feed title if found, else generic 'Podcast'
        album: 'Flusso',
        artwork: (currentTrack.imageUrl || feed?.imageUrl) ? [{ src: currentTrack.imageUrl || feed!.imageUrl! }] : []
      }).catch(console.error);

      MediaSession.setActionHandler({ action: 'play' }, () => {
        console.log("MediaSession play action handler called");
        if (audioRef.current) {
          audioRef.current.play();
          MediaSession.setPlaybackState({ playbackState: 'playing' }).catch(console.error);
        }
      });
      MediaSession.setActionHandler({ action: 'pause' }, () => {
        console.log("MediaSession pause action handler called");
        if (audioRef.current) {
          audioRef.current.pause();
          MediaSession.setPlaybackState({ playbackState: 'paused' }).catch(console.error);
        }
      });
      MediaSession.setActionHandler({ action: 'seekbackward' }, () => seek(Math.max(0, progress - 10)));
      MediaSession.setActionHandler({ action: 'seekforward' }, () => seek(Math.min(duration, progress + 30)));
      MediaSession.setActionHandler({ action: 'stop' }, () => stop());
      
      // Android Auto / Media Session Queue Support
      MediaSession.setActionHandler({ action: 'previoustrack' }, () => playPrevious());
      MediaSession.setActionHandler({ action: 'nexttrack' }, () => playNext());
    }
  }, [currentTrack, progress, duration, playNext, playPrevious, seek, stop, feeds]);

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
    playPrevious
  }), [currentTrack, isPlaying, isBuffering, play, pause, toggle, seek, stop, playNext, playPrevious]);

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