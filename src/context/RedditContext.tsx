import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { Subreddit, RedditPost } from '../types';
import { storage } from '../services/storage';
import DataWorker from '../workers/dataProcessor.worker.ts?worker';
import { useSettings } from './SettingsContext';

interface RedditContextType {
  subreddits: Subreddit[];
  redditPosts: RedditPost[];
  redditSort: 'new' | 'hot' | 'top';
  isLoading: boolean;
  refreshReddit: (subsToRefresh?: Subreddit[], currentPosts?: RedditPost[], sort?: 'new' | 'hot' | 'top') => Promise<void>;
  loadMoreReddit: () => Promise<void>;
  handleRedditSortChange: (sort: 'new' | 'hot' | 'top') => Promise<void>;
  toggleRedditRead: (id: string) => void;
  markRedditAsRead: (id: string) => void;
  toggleRedditFavorite: (id: string) => void;
  updateRedditPost: (id: string, updates: Partial<RedditPost>) => void;
  removeSubreddit: (id: string) => void;
  markAllRedditAsRead: () => void;
  redditUnreadCount: number;
}

const RedditContext = createContext<RedditContextType | undefined>(undefined);

export const RedditProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [redditPosts, setRedditPosts] = useState<RedditPost[]>([]);
  const [redditSort, setRedditSort] = useState<'new' | 'hot' | 'top'>('new');
  const [isLoading, setIsLoading] = useState(false);
  
  const [redditUnreadCount, setRedditUnreadCount] = useState(0);
  const { settings } = useSettings();
  
  const subredditsRef = useRef<Subreddit[]>([]);
  const redditPostsRef = useRef<RedditPost[]>([]);
  const worker = useRef<Worker | undefined>(undefined);

  useEffect(() => {
    setRedditUnreadCount(redditPosts.filter(p => !p.isRead).length);
  }, [redditPosts]);

  useEffect(() => {
    worker.current = new DataWorker();
    return () => worker.current?.terminate();
  }, []);

  useEffect(() => {
    subredditsRef.current = subreddits;
    redditPostsRef.current = redditPosts;
  }, [subreddits, redditPosts]);

  useEffect(() => {
    const loadData = async () => {
      await storage.cleanupOldRedditPosts(settings.redditRetentionDays);
      const loadedSubreddits = await storage.getSubreddits();
      const loadedRedditPosts = await storage.getRedditPosts();
      setSubreddits(loadedSubreddits);
      setRedditPosts(loadedRedditPosts.sort((a, b) => b.createdUtc - a.createdUtc));
    };
    loadData();
  }, [settings.redditRetentionDays]);

  const refreshReddit = useCallback(async (subsToRefresh?: Subreddit[], currentPosts?: RedditPost[], sort?: 'new' | 'hot' | 'top') => {
    const targetSubs = subsToRefresh || subredditsRef.current;
    const targetSort = sort || redditSort;
    
    // Update local subreddits state if new ones are provided
    if (subsToRefresh) {
      setSubreddits(prev => {
        const next = [...prev];
        subsToRefresh.forEach(newSub => {
          if (!next.find(s => s.id === newSub.id)) {
            next.push(newSub);
          }
        });
        return next;
      });
    }

    if (targetSubs.length === 0) return;

    setIsLoading(true);
    try {
      const posts: RedditPost[] = [];
      for (const sub of targetSubs) {
        try {
          const incomingPosts = await storage.fetchRedditPosts(sub.name, targetSort);
          posts.push(...incomingPosts);
        } catch (e) {
          console.error(`Failed to refresh r/${sub.name}`, e);
        }
      }

      if (worker.current) {
        const handler = (e: MessageEvent) => {
          if (e.data.type === 'mergedRedditPosts') {
            const merged = e.data.merged;
            setRedditPosts(merged);
            storage.saveRedditPosts(merged);
            worker.current!.removeEventListener('message', handler);
          }
        };
        worker.current.addEventListener('message', handler);
        worker.current.postMessage({ type: 'mergeRedditPosts', prev: redditPostsRef.current, incoming: posts, sort: targetSort });
      }
    } finally {
      setIsLoading(false);
    }
  }, [redditSort]);

  const loadMoreReddit = useCallback(async () => {
    // Simplified load more for now
    await refreshReddit();
  }, [refreshReddit]);

  const handleRedditSortChange = useCallback(async (sort: 'new' | 'hot' | 'top') => {
    setRedditSort(sort);
    await refreshReddit(undefined, undefined, sort);
  }, [refreshReddit]);

  const toggleRedditRead = useCallback((id: string) => {
    setRedditPosts(prev => {
      const next = prev.map(p => p.id === id ? { ...p, isRead: !p.isRead } : p);
      storage.saveRedditPosts(next);
      return next;
    });
  }, []);

  const markRedditAsRead = useCallback((id: string) => {
    setRedditPosts(prev => {
      const next = prev.map(p => p.id === id ? { ...p, isRead: true } : p);
      storage.saveRedditPosts(next);
      return next;
    });
  }, []);

  const toggleRedditFavorite = useCallback((id: string) => {
    setRedditPosts(prev => {
      const next = prev.map(p => p.id === id ? { ...p, isFavorite: !p.isFavorite } : p);
      storage.saveRedditPosts(next);
      return next;
    });
  }, []);

  const updateRedditPost = useCallback((id: string, updates: Partial<RedditPost>) => {
    setRedditPosts(prev => {
      const next = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      storage.saveRedditPosts(next);
      return next;
    });
  }, []);

  const removeSubreddit = useCallback((id: string) => {
    setSubreddits(prev => {
      const next = prev.filter(s => s.id !== id);
      storage.saveSubreddits(next);
      return next;
    });
    // Also remove posts from that subreddit
    setRedditPosts(prev => {
      const sub = subreddits.find(s => s.id === id);
      if (!sub) return prev;
      const next = prev.filter(p => (p.subredditName || '').toLowerCase() !== sub.name.toLowerCase());
      storage.saveRedditPosts(next);
      return next;
    });
  }, [subreddits]);

  const markAllRedditAsRead = useCallback(() => {
    setRedditPosts(prev => {
      const next = prev.map(p => ({ ...p, isRead: true }));
      storage.saveRedditPosts(next);
      return next;
    });
  }, []);

  return (
    <RedditContext.Provider value={{
      subreddits, redditPosts, redditSort, isLoading,
      refreshReddit, loadMoreReddit, handleRedditSortChange,
      toggleRedditRead, markRedditAsRead, toggleRedditFavorite, updateRedditPost,
      removeSubreddit, markAllRedditAsRead, redditUnreadCount
    }}>
      {children}
    </RedditContext.Provider>
  );
};

export const useReddit = () => {
  const context = useContext(RedditContext);
  if (context === undefined) {
    throw new Error('useReddit must be used within a RedditProvider');
  }
  return context;
};
