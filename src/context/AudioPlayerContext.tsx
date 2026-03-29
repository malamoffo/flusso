import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Article } from '../types';
import { useRss } from './RssContext';
import { parseDurationToSeconds } from '../lib/utils';

interface AudioPlayerContextType {
  currentTrack: Article | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  play: (track: Article) => void;
  pause: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  stop: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const { updateArticle } = useRss();
  const [currentTrack, setCurrentTrack] = useState<Article | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
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
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
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
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
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

      navigator.mediaSession.setActionHandler('play', () => toggle());
      navigator.mediaSession.setActionHandler('pause', () => toggle());
      navigator.mediaSession.setActionHandler('seekbackward', () => seek(Math.max(0, progress - 10)));
      navigator.mediaSession.setActionHandler('seekforward', () => seek(Math.min(duration, progress + 30)));
      navigator.mediaSession.setActionHandler('stop', () => stop());
    }
  }, [currentTrack, progress, duration]);

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
    }).catch(err => {
      if (err.name === 'AbortError') {
        // Ignore AbortError as it's usually caused by a new play request
        return;
      }
      console.error("Playback failed:", err);
    });
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

  return (
    <AudioPlayerContext.Provider value={{
      currentTrack,
      isPlaying,
      progress,
      duration,
      play,
      pause,
      toggle,
      seek,
      stop
    }}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (context === undefined) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
}
