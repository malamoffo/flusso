import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Article } from '../types';
import { useRss } from './RssContext';
import { Capacitor } from '@capacitor/core';
import { MediaSession } from '@capgo/capacitor-media-session';
import { QueuePlugin } from '../plugins/QueuePlugin';
import { imagePersistence } from '../utils/imagePersistence';
import { parseDurationToSeconds } from '../lib/utils';
import { useAudioStore } from '../store/audioStore';

// ─── costanti throttling ───────────────────────────────────────────────────────
const POSITION_SYNC_INTERVAL_MS = 3000;   // posizione → max 1 volta / 3s
const POSITION_SYNC_THRESHOLD_S = 2;      // invia solo se delta ≥ 2s (evita jitter)

function AudioBridge() {
  const { articles, updateArticle, feeds } = useRss();

  // ─── init store ──────────────────────────────────────────────────────────────
  useEffect(() => {
    useAudioStore.getState().setUpdateArticleProgress((trackId, progress) => {
      // Find the track in articles to check its type and duration
      const track = articlesRef.current.find(a => a.id === trackId);
      const updates: Partial<Article> = { progress };
      
      if (track && track.type === 'podcast') {
        const totalSeconds = parseDurationToSeconds(track.duration);
        const currentSeconds = progress * totalSeconds;
        // Mark as read if reached < 2 minutes from end (120 seconds)
        if (totalSeconds > 0 && (totalSeconds - currentSeconds) < 120 && !track.isRead) {
          updates.isRead = true;
          updates.readAt = Date.now();
        }
      }
      
      updateArticle(trackId, updates);
    });
  }, [updateArticle]);

  // Use a ref to articles to avoid dependency re-renders while allowing access in callback
  const articlesRef = useRef(articles);
  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);

  useEffect(() => {
    useAudioStore.getState().initAudio();
  }, []);

  // ─── calcolo code ─────────────────────────────────────────────────────────────
  const { queue, recentPodcasts, favoritePodcasts } = useMemo(() => {
    const q: Article[] = [];
    const r: Article[] = [];
    const f: Article[] = [];

    for (let i = 0; i < articles.length; i++) {
      const a = articles[i];
      if (a.type !== 'podcast') continue;
      if (a.isQueued || a.isFavorite) q.push(a);
      if (r.length < 20) r.push(a);
      if (a.isFavorite) f.push(a);
    }

    return { queue: q, recentPodcasts: r, favoritePodcasts: f };
  }, [articles]);

  useEffect(() => {
    useAudioStore.getState().setCollections({ queue, recentPodcasts, favoritePodcasts });
  }, [queue, recentPodcasts, favoritePodcasts]);

  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);

  // ─── helper artwork ───────────────────────────────────────────────────────────
  const getArtworkData = useCallback((a: Article) => {
    const feed = feedMap.get(a.feedId);
    const artworkUrl = a.imageUrl || feed?.imageUrl || '';
    const artworkFilename = artworkUrl ? imagePersistence.getFilename(artworkUrl) : '';
    return { artworkUrl, artworkFilename, feed };
  }, [feedMap]);

  // ─── helper map traccia → oggetto nativo ──────────────────────────────────────
  const mapTrack = useCallback((a: Article) => {
    const { artworkUrl, artworkFilename, feed } = getArtworkData(a);
    return {
      id: a.id,
      title: a.title || 'Untitled',
      artist: feed?.title || 'Podcast',
      album: 'Flusso',
      artwork: artworkUrl,
      artworkFilename,
      uri: a.mediaUrl || '',
      duration: a.duration ? parseDurationToSeconds(a.duration) : 0,
    };
  }, [getArtworkData]);

  // ─── listener comandi nativi (Android Auto / media buttons) ───────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let actionListener: { remove: () => Promise<void> } | null = null;
    let playListener:   { remove: () => Promise<void> } | null = null;
    let seekListener:   { remove: () => Promise<void> } | null = null;

    const setup = async () => {
      actionListener = await QueuePlugin.addListener('actionRequest', (data) => {
        const s = useAudioStore.getState();
        switch (data.action) {
          case 'play':
            if (s.currentTrack) s.play(s.currentTrack);
            else if (s.queue.length > 0) s.play(s.queue[0]);
            break;
          case 'pause':    s.pause();        break;
          case 'next':     s.playNext();     break;
          case 'previous': s.playPrevious(); break;
          case 'stop':     s.stop();         break;
          case 'seek':     
            if (typeof data.position === 'number' && Number.isFinite(data.position)) {
              s.seek(data.position);
            }
            break;
        }
      });

      playListener = await QueuePlugin.addListener('playRequest', (data) => {
        const track = articles.find((a) => a.id === data.id && a.type === 'podcast');
        if (track) useAudioStore.getState().play(track);
      });

      seekListener = await QueuePlugin.addListener('seekRequest', (data) => {
        if (typeof data.position === 'number' && Number.isFinite(data.position)) {
          useAudioStore.getState().seek(data.position);
        }
      });
    };

    setup().catch(console.error);

    return () => {
      actionListener?.remove();
      playListener?.remove();
      seekListener?.remove();
    };
  }, [articles]);

  // ─── sync code verso nativo (solo quando cambiano le code) ───────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    // Guard: non scrivere su disco finché Dexie non ha caricato gli articoli.
    // Senza questo guard, al primo render articles=[] e setQueue sovrascrive
    // favorites.json con [] su disco, causando lista vuota in Android Auto
    // al cold start (quando l'auto è già connessa prima che la WebView sia pronta).
    if (articles.length === 0) return;

    QueuePlugin.setQueue({
      queue:     queue.map(mapTrack),
      recent:    recentPodcasts.map(mapTrack),
      favorites: favoritePodcasts.map(mapTrack),
    }).catch((err) => console.error('setQueue error:', err));
  }, [queue, recentPodcasts, favoritePodcasts, mapTrack, articles]);

  // ─── autoplay pending al boot ─────────────────────────────────────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || articles.length === 0) return;

    QueuePlugin.getPendingMediaId()
      .then(({ mediaId }) => {
        if (mediaId && !useAudioStore.getState().currentTrack) {
          const track = articles.find((a) => a.id === mediaId && a.type === 'podcast');
          if (track) useAudioStore.getState().play(track);
        }
      })
      .catch(console.error);
  }, [articles]);

  // ─── stato player ─────────────────────────────────────────────────────────────
  const currentTrack = useAudioStore((state) => state.currentTrack);
  const progress     = useAudioStore((state) => state.progress);
  const duration     = useAudioStore((state) => state.duration);
  const isPlaying    = useAudioStore((state) => state.isPlaying);

  // ─── ref per throttling posizione ────────────────────────────────────────────
  const lastSentPositionRef  = useRef(-1);
  const lastPositionSyncRef  = useRef(0);      // timestamp ms dell'ultimo invio
  const pendingPositionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── livello 1: metadata — solo al cambio traccia ────────────────────────────
  useEffect(() => {
    if (!currentTrack || !Capacitor.isNativePlatform()) return;

    const { artworkUrl, artworkFilename, feed } = getArtworkData(currentTrack);

    // reset del throttling posizione ad ogni cambio traccia
    lastSentPositionRef.current = -1;
    lastPositionSyncRef.current = 0;
    if (pendingPositionTimer.current) {
      clearTimeout(pendingPositionTimer.current);
      pendingPositionTimer.current = null;
    }

    // aggiorna metadata completi
    QueuePlugin.updateMediaSession({
      mediaId:         currentTrack.id,
      title:           currentTrack.title,
      artist:          feed?.title || 'Podcast',
      album:           'Flusso',
      artwork:         artworkUrl,
      artworkFilename,
      duration,
      position:        0,
      isPlaying:       false,
    }).catch(() => {});

    // aggiorna MediaSession di sistema (lockscreen/headunit)
    MediaSession.setMetadata({
      title:   currentTrack.title,
      artist:  feed?.title || 'Podcast',
      album:   'Flusso',
      artwork: artworkUrl ? [{ src: artworkUrl }] : [],
    }).catch(console.error);

    MediaSession.setActionHandler({ action: 'play' }, () => {
      const s = useAudioStore.getState();
      if (s.currentTrack) s.play(s.currentTrack);
      else if (s.queue.length > 0) s.play(s.queue[0]);
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
    MediaSession.setActionHandler({ action: 'stop' },          () => useAudioStore.getState().stop());
    MediaSession.setActionHandler({ action: 'previoustrack' }, () => useAudioStore.getState().playPrevious());
    MediaSession.setActionHandler({ action: 'nexttrack' },     () => useAudioStore.getState().playNext());

  }, [currentTrack?.id, feedMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── livello 2: isPlaying — immediato, ma senza metadata completi ────────────
  const lastSentPlayingRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!currentTrack || !Capacitor.isNativePlatform()) return;
    if (lastSentPlayingRef.current === isPlaying) return;

    lastSentPlayingRef.current = isPlaying;

    QueuePlugin.updateMediaSession({
      mediaId:   currentTrack.id,
      position:  progress,
      duration,
      isPlaying,
    }).catch(() => {});
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── livello 3: posizione — throttled 3s, invia solo se delta ≥ 2s ──────────
  useEffect(() => {
    if (!currentTrack || !Capacitor.isNativePlatform()) return;
    if (!isPlaying) return; // se in pausa non serve aggiornare posizione

    const delta = Math.abs(progress - lastSentPositionRef.current);
    if (delta < POSITION_SYNC_THRESHOLD_S) return;

    const now = Date.now();
    const elapsed = now - lastPositionSyncRef.current;

    const doSend = () => {
      lastSentPositionRef.current = progress;
      lastPositionSyncRef.current = Date.now();
      pendingPositionTimer.current = null;

      QueuePlugin.updateMediaSession({
        mediaId:  currentTrack.id,
        position: progress,
        duration,
        isPlaying,
      }).catch(() => {});
    };

    if (elapsed >= POSITION_SYNC_INTERVAL_MS) {
      // abbastanza tempo trascorso: invia subito
      if (pendingPositionTimer.current) {
        clearTimeout(pendingPositionTimer.current);
        pendingPositionTimer.current = null;
      }
      doSend();
    } else {
      // schedula l'invio al momento giusto, senza accumulare timer
      if (!pendingPositionTimer.current) {
        const delay = POSITION_SYNC_INTERVAL_MS - elapsed;
        pendingPositionTimer.current = setTimeout(doSend, delay);
      }
    }

    return () => {
      if (pendingPositionTimer.current) {
        clearTimeout(pendingPositionTimer.current);
        pendingPositionTimer.current = null;
      }
    };
  }, [progress]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AudioBridge />
      {children}
    </>
  );
}