import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import { Article } from '../types';
import { useRss } from './RssContext';
import { Capacitor } from '@capacitor/core';
import { MediaSession } from '@capgo/capacitor-media-session';
import { QueuePlugin } from '../plugins/QueuePlugin';
import { imagePersistence } from '../utils/imagePersistence';
import { parseDurationToSeconds } from '../lib/utils';
import { useAudioStore } from '../store/audioStore';
import { storage } from '../services/storage';

// ─── costanti throttling ───────────────────────────────────────────────────────
const POSITION_SYNC_INTERVAL_MS = 3000;
const POSITION_SYNC_THRESHOLD_S = 2;

function AudioBridge() {
  const { articles, updateArticle, feeds } = useRss();

  // ─── init store ──────────────────────────────────────────────────────────────
  useEffect(() => {
    useAudioStore.getState().setUpdateArticleProgress((trackId, progress) => {
      const track = articlesRef.current.find(a => a.id === trackId);
      const updates: Partial<Article> = { progress };

      if (track && track.type === 'podcast') {
        const totalSeconds = parseDurationToSeconds(track.duration);
        const currentSeconds = progress * totalSeconds;
        if (totalSeconds > 0 && (totalSeconds - currentSeconds) < 120 && !track.isRead) {
          updates.isRead = 1;
          updates.readAt = Date.now();
        }
      }

      updateArticle(trackId, updates);
    });
  }, [updateArticle]);

  const articlesRef = useRef(articles);
  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);

  useEffect(() => {
    useAudioStore.getState().initAudio();
  }, []);

  // ─── calcolo code ─────────────────────────────────────────────────────────────
  const { queue, recentPodcasts } = useMemo(() => {
    const q: Article[] = [];
    const r: Article[] = [];

    for (let i = 0; i < articles.length; i++) {
      const a = articles[i];
      if (a.type !== 'podcast') continue;
      if (a.isQueued || a.isFavorite) q.push(a);
      if (r.length < 20) r.push(a);
    }

    return { queue: q, recentPodcasts: r };
  }, [articles]);

  // ─── favoritePodcasts: letti direttamente dal DB, non dall'array in RAM ───────
  // Questo evita il bug in cui i podcast preferiti non rientrano nella prima
  // pagina di 50 articoli caricata da loadData() e quindi non compaiono in articles[].
  const favoritePodcastsRef = useRef<Article[]>([]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (articles.length === 0) return; // aspetta che Dexie abbia caricato

    storage.getFavoritePodcasts().then(favs => {
      favoritePodcastsRef.current = favs;
    }).catch(console.error);
  }, [articles]); // si aggiorna ogni volta che articles cambia (toggle preferito)

  useEffect(() => {
    useAudioStore.getState().setCollections({
      queue,
      recentPodcasts,
      favoritePodcasts: favoritePodcastsRef.current,
    });
  }, [queue, recentPodcasts]);

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
        const track = articlesRef.current.find((a) => a.id === data.id && a.type === 'podcast');
        if (track) {
          useAudioStore.getState().play(track);
        } else {
          // Fallback: cerca nel DB se la traccia non è in RAM (podcast fuori paginazione)
          storage.getFavoritePodcasts().then(favs => {
            const favTrack = favs.find(a => a.id === data.id);
            if (favTrack) useAudioStore.getState().play(favTrack);
          }).catch(console.error);
        }
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

  // ─── sync code verso nativo ──────────────────────────────────────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (articles.length === 0) return;

    // Legge i preferiti freschi dal DB per evitare che la paginazione
    // nasconda podcast preferiti con pubDate vecchio
    storage.getFavoritePodcasts().then(favs => {
      favoritePodcastsRef.current = favs;
      QueuePlugin.setQueue({
        queue:     queue.map(mapTrack),
        recent:    recentPodcasts.map(mapTrack),
        favorites: favs.map(mapTrack),
      }).catch((err) => console.error('setQueue error:', err));
    }).catch(console.error);

  }, [queue, recentPodcasts, mapTrack, articles]);

  // ─── autoplay pending al boot ─────────────────────────────────────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || articles.length === 0) return;

    QueuePlugin.getPendingMediaId()
      .then(({ mediaId }) => {
        if (mediaId && !useAudioStore.getState().currentTrack) {
          const track = articlesRef.current.find((a) => a.id === mediaId && a.type === 'podcast');
          if (track) {
            useAudioStore.getState().play(track);
          } else {
            // Cerca nel DB se non è in RAM
            storage.getFavoritePodcasts().then(favs => {
              const favTrack = favs.find(a => a.id === mediaId);
              if (favTrack) useAudioStore.getState().play(favTrack);
            }).catch(console.error);
          }
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
  const lastPositionSyncRef  = useRef(0);
  const pendingPositionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── livello 1: metadata — solo al cambio traccia ────────────────────────────
  useEffect(() => {
    if (!currentTrack || !Capacitor.isNativePlatform()) return;

    const { artworkUrl, artworkFilename, feed } = getArtworkData(currentTrack);

    lastSentPositionRef.current = -1;
    lastPositionSyncRef.current = 0;
    if (pendingPositionTimer.current) {
      clearTimeout(pendingPositionTimer.current);
      pendingPositionTimer.current = null;
    }

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
    MediaSession.setActionHandler({ action: 'pause' },        () => useAudioStore.getState().pause());
    MediaSession.setActionHandler({ action: 'seekbackward' }, () => {
      const s = useAudioStore.getState();
      s.seek(Math.max(0, s.progress - 10));
    });
    MediaSession.setActionHandler({ action: 'seekforward' },  () => {
      const s = useAudioStore.getState();
      s.seek(Math.min(s.duration, s.progress + 30));
    });
    MediaSession.setActionHandler({ action: 'stop' },          () => useAudioStore.getState().stop());
    MediaSession.setActionHandler({ action: 'previoustrack' }, () => useAudioStore.getState().playPrevious());
    MediaSession.setActionHandler({ action: 'nexttrack' },     () => useAudioStore.getState().playNext());

  }, [currentTrack?.id, feedMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── livello 2: isPlaying ────────────────────────────────────────────────────
  const lastSentPlayingRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!currentTrack || !Capacitor.isNativePlatform()) return;
    if (lastSentPlayingRef.current === isPlaying) return;

    lastSentPlayingRef.current = isPlaying;

    QueuePlugin.updateMediaSession({
      mediaId:  currentTrack.id,
      position: progress,
      duration,
      isPlaying,
    }).catch(() => {});
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── livello 3: posizione — throttled 3s ────────────────────────────────────
  useEffect(() => {
    if (!currentTrack || !Capacitor.isNativePlatform()) return;
    if (!isPlaying) return;

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
      if (pendingPositionTimer.current) {
        clearTimeout(pendingPositionTimer.current);
        pendingPositionTimer.current = null;
      }
      doSend();
    } else {
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