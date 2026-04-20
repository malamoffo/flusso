import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Article } from '../types';
import { useRss } from './RssContext';
import { Capacitor } from '@capacitor/core';
import { MediaSession } from '@capgo/capacitor-media-session';
import { QueuePlugin } from '../plugins/QueuePlugin';
import { imagePersistence } from '../utils/imagePersistence';
import { parseDurationToSeconds } from '../lib/utils';
import { useAudioStore, setGlobalUpdateArticleProgress } from '../store/audioStore';

const AudioPlayerProgressContext = createContext<{ progress: number; duration: number } | undefined>(undefined);

function AudioBridge() {
  const { articles, updateArticle, feeds } = useRss();

  useEffect(() => {
    setGlobalUpdateArticleProgress((trackId, progress) => {
      updateArticle(trackId, { progress });
    });
  }, [updateArticle]);

  useEffect(() => {
    useAudioStore.getState().initAudio();
  }, []);

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

    return {
      queue: q,
      recentPodcasts: r,
      favoritePodcasts: f,
    };
  }, [articles]);

  useEffect(() => {
    useAudioStore.getState().setCollections({ queue, recentPodcasts, favoritePodcasts });
  }, [queue, recentPodcasts, favoritePodcasts]);

  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let actionListener: { remove: () => Promise<void> } | null = null;
    let playListener: { 