import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Article } from '../types';
import { useRss } from './RssContext';
import { Capacitor } from '@capacitor/core';
import { MediaSession } from '@capgo/capacitor-media-session';
import QueuePlugin from '../plugins/QueuePlugin';
import { imagePersistence } from '../utils/imagePersistence';
import { parseDurationToSeconds } from '../lib/utils';
import { useAudioStore, setGlobalUpdateArticleProgress } from '../store/audioStore';

const AudioPlayerProgressContext = createContext<{progress: number; duration: number} | undefined>(undefined);

// A silent bridge component that syncs Rss arrays to Zustand and to Android Auto
// This avoids rendering the entire DOM below it when Audio updates.
function AudioBridge() {
  const { articles, updateArticle, feeds } = useRss();
  
  // 1. Send update function to store
  useEffect(() => {
    setGlobalUpdateArticleProgress((trackId, progress) => {
      updateArticle(trackId, { progress });
    });
  }, [updateArticle]);

  // 2. Initialize Media Logic exactly once
  useEffect(() => {
    useAudioStore.getState().initAudio();
  }, []);

  // 3. Compute Queues
  const { queue, recentPodcasts, favoritePodcasts } = useMemo(() => {
    const q: Article[] = [];
    const r: Article[] = [];
    const f: Article[] = [];

    for (let i = 0; i < articles.length; i++) {
      const a = articles[i];
      if (a.type !== 'podcast') continue;

      if (a.isQueued || a.isFavorite) q.push(a);
      if (r.length < 20) r.push(a);
      if (a.isFavorite && a.mediaUrl) f.push(a);
    }

    return { queue: q, recentPodcasts: r, favoritePodcasts: f };
  }, [articles]);

  // Sync to store
  useEffect(() => {
    useAudioStore.getState().setCollections({ queue, recentPodcasts, favoritePodcasts });
  }, [queue, recentPodcasts, favoritePodcasts]);

  const feedMap = useMemo(() => new Map(feeds.map(f => [f.id, f])), [feeds]);
  
  // Listen for actions from Native bridge
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const listener = QueuePlugin.addListener('actionRequest', (data) => {
        const h = useAudioStore.getState();
        switch (data.action) {
          case 'play': h.toggle(); break;
          case 'pause': h.pause(); break;
          case 'next': h.playNext(); break;
          case 'previous': h.playPrevious(); break;
          case 'stop': h.stop(); break;
        }
      });
      const playListener = QueuePlugin.addListener('playRequest', (data) => {
        const trackToPlay = articles.find(a => a.id === data.id);
        if (trackToPlay) useAudioStore.getState().play(trackToPlay);
      });
      return () => {
        listener.then(l => l.remove());
        playListener.then(l => l.remove());
      };
    }
  }, [articles]);

  // Sync Android Native Queues
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const mapTrack = (a: Article) => {
        const feed = feedMap.get(a.feedId);
        const artworkUrl = a.imageUrl || feed?.imageUrl || '';
        let artworkFilename = '';
        if (artworkUrl) artworkFilename = imagePersistence.getFilename(artworkUrl);
        return {
          id: a.id,
          title: a.title || 'Untitled',
          artist: feed?.title || 'Podcast',
          album: 'Flusso',
          artwork: artworkUrl,
          artworkFilename: artworkFilename,
          uri: a.mediaUrl || '',
          duration: a.duration ? parseDurationToSeconds(a.duration) : 0
        };
      };

      QueuePlugin.setQueue({ 
        queue: queue.map(mapTrack),
        recent: recentPodcasts.map(mapTrack),
        favorites: favoritePodcasts.map(mapTrack)
      }).catch(err => console.error('Error setting queue:', err));
    }
  }, [queue, recentPodcasts, favoritePodcasts, feedMap]);

  // 4. Android MediaSession Syncs
  const currentTrack = useAudioStore(state => state.currentTrack);
  const progress = useAudioStore(state => state.progress);
  const duration = useAudioStore(state => state.duration);
  const isPlaying = useAudioStore(state => state.isPlaying);

  // Auto-play pending on boot
  useEffect(() => {
    if (Capacitor.isNativePlatform() && articles.length > 0) {
      QueuePlugin.getPendingMediaId().then(({ mediaId }) => {
        if (mediaId && !useAudioStore.getState().currentTrack) {
          const trackToPlay = articles.find(a => a.id === mediaId);
          if (trackToPlay) useAudioStore.getState().play(trackToPlay);
        }
      }).catch(console.error);
    }
  }, [articles]);

  const lastSyncProgress = useRef(0);
  useEffect(() => {
    if (currentTrack && Capacitor.isNativePlatform()) {
      // 1) Constant Throttled background updates
      if (Math.abs(progress - lastSyncProgress.current) >= 1 || progress === 0) {
        lastSyncProgress.current = progress;
        
        const feed = feedMap.get(currentTrack.feedId);
        const artworkUrl = currentTrack.imageUrl || feed?.imageUrl || '';
        QueuePlugin.updateMediaSession({
          title: currentTrack.title,
          artist: feed?.title || 'Podcast',
          album: 'Flusso',
          artwork: artworkUrl,
          artworkFilename: artworkUrl ? imagePersistence.getFilename(artworkUrl) : '',
          duration: duration,
          position: progress,
          isPlaying: isPlaying
        }).catch(() => {});
      }
    }
  }, [currentTrack?.id, progress, duration, isPlaying, feedMap]);

  useEffect(() => {
    if (currentTrack && Capacitor.isNativePlatform()) {
      // 2) Statically update metadata only when track changes
      const feed = feedMap.get(currentTrack.feedId);
      const artworkUrl = currentTrack.imageUrl || feed?.imageUrl || '';
      
      MediaSession.setMetadata({
        title: currentTrack.title,
        artist: feed?.title || 'Podcast',
        album: 'Flusso',
        artwork: artworkUrl ? [{ src: artworkUrl }] : []
      }).catch(console.error);

      // We read from .getState() directly to avoid stale closures here
      MediaSession.setActionHandler({ action: 'play' }, () => {
        const state = useAudioStore.getState();
        if (state.currentTrack) state.play(state.currentTrack);
        else if (state.queue.length > 0) state.play(state.queue[0]);
      });
      MediaSession.setActionHandler({ action: 'pause' }, () => useAudioStore.getState().pause());
      MediaSession.setActionHandler({ action: 'seekbackward' }, () => {
        const s = useAudioStore.getState();
        s.seek(Math.max(0, s.progress - 10));
      });
      MediaSession.setActionHandler({ action: 'seekforward' }, () => {
        const s = useAudioStore.getState();
        s.seek(Math.min(s.duration, s.progress + 30));
      });
      MediaSession.setActionHandler({ action: 'stop' }, () => useAudioStore.getState().stop());
      MediaSession.setActionHandler({ action: 'previoustrack' }, () => useAudioStore.getState().playPrevious());
      MediaSession.setActionHandler({ action: 'nexttrack' }, () => useAudioStore.getState().playNext());
    }
  }, [currentTrack?.id, feedMap]);

  return null;
}

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  // We keep AudioPlayerProgressContext to NOT break `<PlayerBar>` and other progress-rendering
  // components immediately today.
  const progress = useAudioStore(state => state.progress);
  const duration = useAudioStore(state => state.duration);
  const progressValue = useMemo(() => ({ progress, duration }), [progress, duration]);

  return (
    <>
      <AudioBridge />
      <AudioPlayerProgressContext.Provider value={progressValue}>
        {children}
      </AudioPlayerProgressContext.Provider>
    </>
  );
}

// ⚡ Bolt: Wraps Zustand hooks to remain compatible with older components without rewrites!
export function useAudioState() {
  return useAudioStore(
    useShallow((state) => ({
      currentTrack: state.currentTrack,
      isPlaying: state.isPlaying,
      isBuffering: state.isBuffering,
      play: state.play,
      pause: state.pause,
      toggle: state.toggle,
      seek: state.seek,
      stop: state.stop,
      playNext: state.playNext,
      playPrevious: state.playPrevious
    }))
  );
}

export function useAudioProgress() {
  // We use the Context here because some components still wrap inside it.
  const context = useContext(AudioPlayerProgressContext);
  if (context === undefined) {
    throw new Error('useAudioProgress must be used within an AudioPlayerProvider');
  }
  return context;
}

export function useAudioPlayer() {
  const state = useAudioState();
  const progress = useAudioProgress();
  return { ...state, ...progress };
}
