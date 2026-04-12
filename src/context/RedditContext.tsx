import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { Subreddit, RedditPost } from '../types';
import { storage } from '../services/storage';
import DataWorker from '../workers/dataProcessor.worker?worker';

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
}

const RedditContext = createContext<RedditContextType | undefined>(undefined);

export const RedditProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [redditPosts, setRedditPosts] = useState<RedditPost[]>([]);
  const [redditSort, setRedditSort] = useState<'new' | 'hot' | 'top'>('new');
  const [isLoading, setIsLoading] = useState(false);
  
  const subredditsRef = useRef<Subreddit[]>([]);
  const redditPostsRef = useRef<RedditPost[]>([]);
  const worker = useRef<Worker>();

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
      const loadedSubreddits = await storage.getSubreddits();
      const loadedRedditPosts = await storage.getRedditPosts();
      setSubreddits(loadedSubreddits);
      setRedditPosts(loadedRedditPosts.sort((a, b) => b.createdUtc - a.createdUtc));
    };
    loadData();
  }, []);

  const refreshReddit = useCallback(async (subsToRefresh?: Subreddit[], currentPosts?: RedditPost[], sort?: 'new' | 'hot' | 'top') => {
    const targetSubs = subsToRefresh || subredditsRef.current;
    const targetSort = sort || redditSort;
    if (targetSubs.length === 0) return;

    setIsLoading(true);
    try {
      const posts: RedditPost[] = [];
      for (const sub of targetSubs) {
        try {
          const response = await fetch(`https://www.reddit.com/r/${sub.name}/${targetSort}.json?limit=25`);
          if (response.ok) {
            const data = await response.json();
            const incomingPosts = data.data.children.map((child: any) => ({
              id: child.data.id,
              title: child.data.title,
              author: child.data.author,
              subreddit: child.data.subreddit,
              permalink: child.data.permalink,
              url: child.data.url,
              imageUrl: child.data.thumbnail && child.data.thumbnail.startsWith('http') ? child.data.thumbnail : null,
              createdUtc: child.data.created_utc,
              score: child.data.score,
              numComments: child.data.num_comments,
              isRead: false,
              isFavorite: false
            }));
            posts.push(...incomingPosts);
          }
        } catch (e) {
          console.error(`Failed to refresh r/${sub.name}`, e);
        }
      }

      if (worker.current) {
        const handler = (e: MessageEvent) => {
          if (e.data.type === 'redditPostsMerged') {
            const merged = e.data.posts;
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
      const next = prev.filter(p => p.subreddit.toLowerCase() !== sub.name.toLowerCase());
      storage.saveRedditPosts(next);
      return next;
    });
  }, [subreddits]);

  return (
    <RedditContext.Provider value={{
      subreddits, redditPosts, redditSort, isLoading,
      refreshReddit, loadMoreReddit, handleRedditSortChange,
      toggleRedditRead, markRedditAsRead, toggleRedditFavorite, updateRedditPost,
      removeSubreddit
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
