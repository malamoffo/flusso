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
  markRedditPostsAsRead: (ids: string[]) => void;
  toggleRedditFavorite: (id: string) => void;
  updateRedditPost: (id: string, updates: Partial<RedditPost>) => void;
  removeSubreddit: (id: string) => void;
  addSubreddit: (url: string) => void;
  markAllRedditAsRead: () => void;
  prefetchRedditComments: (permalink: string) => Promise<void>;
  getCachedComments: (permalink: string) => any[] | null;
  redditUnreadCount: number;
  enforceRetention: () => Promise<void>;
}

const RedditContext = createContext<RedditContextType | undefined>(undefined);

export const RedditProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [redditPosts, setRedditPosts] = useState<RedditPost[]>([]);
  const [redditSort, setRedditSort] = useState<'new' | 'hot' | 'top'>('new');
  const [isLoading, setIsLoading] = useState(false);
  
  const [redditUnreadCount, setRedditUnreadCount] = useState(0);
  const { settings } = useSettings();
  
  const redditOffset = useRef<number>(0);
  const PAGE_SIZE = 25;
  const subredditsRef = useRef<Subreddit[]>([]);
  const redditPostsRef = useRef<RedditPost[]>([]);
  const paginationCursors = useRef<Record<string, string>>({}); // Track 'after' cursors
  const worker = useRef<Worker | undefined>(undefined);
  const commentCache = useRef<Map<string, any[]>>(new Map());
  const prefetchQueue = useRef<Set<string>>(new Set());

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
      await storage.cleanupOldRedditPosts(1);
      const loadedSubreddits = await storage.getSubreddits();
      const loadedRedditPosts = await storage.getRedditPosts(0, PAGE_SIZE);
      setRedditPosts(loadedRedditPosts);
      setSubreddits(loadedSubreddits);
      redditOffset.current = loadedRedditPosts.length;
    };
    loadData();
  }, []);

  const prefetchRedditComments = useCallback(async (permalink: string) => {
    if (commentCache.current.has(permalink) || prefetchQueue.current.has(permalink)) {
      return;
    }

    prefetchQueue.current.add(permalink);
    try {
      // Increased delay to 1.5s to be less aggressive and reduce proxy/API load
      await new Promise(resolve => setTimeout(resolve, 1500));
      const comments = await storage.fetchRedditComments(permalink);
      if (comments && comments.length > 0) {
        commentCache.current.set(permalink, comments);
        
        // Keep cache size manageable
        if (commentCache.current.size > 50) {
          const firstKey = commentCache.current.keys().next().value;
          if (firstKey) commentCache.current.delete(firstKey);
        }
      }
    } catch (e) {
      console.warn(`[Prefetch] Failed to prefetch comments for ${permalink}`);
    } finally {
      prefetchQueue.current.delete(permalink);
    }
  }, []);

  const getCachedComments = useCallback((permalink: string) => {
    return commentCache.current.get(permalink) || null;
  }, []);

  const refreshReddit = useCallback(async (subsToRefresh?: Subreddit[], currentPosts?: RedditPost[], sort?: 'new' | 'hot' | 'top') => {
    const targetSubs = subsToRefresh || subredditsRef.current;
    const targetSort = sort || redditSort;
    
    // Reset cursors on refresh
    if (!subsToRefresh) {
        paginationCursors.current = {};
    }

    if (targetSubs.length === 0) {
      return;
    }

    setIsLoading(true);
    try {
     const fetchPromises = targetSubs.map(async (sub) => {
        try {
          const result = await storage.fetchRedditPosts(sub.name, targetSort);
          if (result.after) {
            paginationCursors.current[sub.name] = result.after;
          }
          return result.posts;
        } catch (e) {
          console.error(`Failed to refresh r/${sub.name}`, e);
          return [];
        }
      });
      
      const results = await Promise.all(fetchPromises);
      const posts: RedditPost[] = results.flat();

      if (worker.current) {
        const handler = (e: MessageEvent) => {
          if (e.data.type === 'mergedRedditPosts') {
            const merged: RedditPost[] = e.data.merged;
            
            // ... (rest of the logic)
            const retentionMs = 1 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            
            let filtered = merged.filter(p => {
              if (p.isFavorite) return true;
              const isWithinRetention = (now - p.createdUtc) < retentionMs;
              const hasComments = p.numComments > 0;
              return isWithinRetention && hasComments;
            });

            if (filtered.length < 5 && merged.length > 0) {
              const sorted = [...merged].sort((a, b) => b.createdUtc - a.createdUtc);
              filtered = sorted.slice(0, 5);
            }

            setRedditPosts(filtered);
            storage.saveRedditPosts(filtered);
            worker.current!.removeEventListener('message', handler);
          }
        };
        worker.current.addEventListener('message', handler);
        worker.current.postMessage({ type: 'mergeRedditPosts', prev: redditPostsRef.current, incoming: posts, sort: targetSort });
      }
    } finally {
      setIsLoading(false);
    }
  }, [settings.redditRetentionDays, redditSort]);

  const loadMoreReddit = useCallback(async () => {
    // 1. Try to load more from local storage first
    const moreLocalPosts = await storage.getRedditPosts(redditOffset.current, PAGE_SIZE);
    
    if (moreLocalPosts.length > 0) {
      setRedditPosts(prev => {
        const combined = [...prev, ...moreLocalPosts];
        const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
        unique.sort((a, b) => b.createdUtc - a.createdUtc);
        return unique;
      });
      redditOffset.current += moreLocalPosts.length;
      return;
    }

    // 2. If no more local posts, fetch from API
    const targetSubs = subredditsRef.current;
    if (targetSubs.length === 0) return;

    setIsLoading(true);
    try {
      const oldestPost = redditPostsRef.current[redditPostsRef.current.length - 1];
      const targetDateBoundary = oldestPost ? oldestPost.createdUtc - (24 * 60 * 60 * 1000) : Date.now() - (24 * 60 * 60 * 1000);
      
      let allNewPosts: RedditPost[] = [];
      let reachedBoundary = false;
      let attempts = 0;
      const MAX_ATTEMPTS = 3; // Limit to avoid infinite loops if it's very quiet

      while (!reachedBoundary && attempts < MAX_ATTEMPTS) {
        attempts++;
        const fetchPromises = targetSubs.map(async (sub) => {
           const cursor = paginationCursors.current[sub.name];
           if (cursor === 'end') return []; // No more posts for this sub

           const result = await storage.fetchRedditPosts(sub.name, redditSort, cursor);
           
           if (!result.after) {
             paginationCursors.current[sub.name] = 'end';
           } else {
             paginationCursors.current[sub.name] = result.after;
           }
           return result.posts;
        });
        
        const results = await Promise.all(fetchPromises);
        const batch = results.flat();
        
        if (batch.length === 0) break;
        
        allNewPosts = [...allNewPosts, ...batch];
        
        // Check if we have at least one post older than targetDateBoundary
        const minDate = Math.min(...allNewPosts.map(p => p.createdUtc));
        if (minDate <= targetDateBoundary) {
          reachedBoundary = true;
        }
        
        // If all subreddits reached 'end', break
        if (Object.values(paginationCursors.current).every(c => c === 'end')) {
          reachedBoundary = true;
        }
      }
      
      if (allNewPosts.length > 0) {
        setRedditPosts(prev => {
            const combined = [...prev, ...allNewPosts];
            const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
            unique.sort((a, b) => b.createdUtc - a.createdUtc);                
            storage.saveRedditPosts(allNewPosts); 
            return unique;
        });
        redditOffset.current += allNewPosts.length;
      }
    } finally {
        setIsLoading(false);
    }
  }, [redditSort]);

  const handleRedditSortChange = useCallback(async (sort: 'new' | 'hot' | 'top') => {
    setRedditSort(sort);
    // Explicitly pass the new sort to refreshReddit
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

  const markRedditPostsAsRead = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    let changed = false;
    setRedditPosts(prev => {
      const next = prev.map(p => {
        if (idSet.has(p.id) && !p.isRead) {
          changed = true;
          return { ...p, isRead: true };
        }
        return p;
      });
      if (changed) {
        storage.saveRedditPosts(next);
      }
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

  const addSubreddit = useCallback(async (url: string) => {
    const result = await storage.addSubreddit(url);
    if (result) {
      setSubreddits(prev => [...prev, result]);
      await refreshReddit([result]);
    }
  }, [refreshReddit]);

  const markAllRedditAsRead = useCallback(() => {
    setRedditPosts(prev => {
      const next = prev.map(p => ({ ...p, isRead: true }));
      storage.saveRedditPosts(next);
      return next;
    });
  }, []);

  const enforceRetention = useCallback(async () => {
    await storage.cleanupOldRedditPosts(1);
    const loadedRedditPosts = await storage.getRedditPosts(0, PAGE_SIZE);
    setRedditPosts(loadedRedditPosts);
    redditOffset.current = loadedRedditPosts.length;
  }, []);

  // Independent triggers for Reddit (startup, 5min period, resume)
  useEffect(() => {
    const loadRefresh = async () => {
      const loadedSubreddits = await storage.getSubreddits();
      if (loadedSubreddits.length > 0) {
        refreshReddit(loadedSubreddits);
      }
    };
    loadRefresh();
  }, [refreshReddit]);

  useEffect(() => {
    const REDDIT_REFRESH_INTERVAL = 5 * 60 * 1000;
    const interval = setInterval(() => {
      if (subredditsRef.current.length > 0) {
        refreshReddit();
      }
    }, REDDIT_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refreshReddit]);

  useEffect(() => {
    const handleResume = () => {
      refreshReddit();
    };
    window.addEventListener('app-resume', handleResume);
    return () => window.removeEventListener('app-resume', handleResume);
  }, [refreshReddit]);

  return (
    <RedditContext.Provider value={{
      subreddits, redditPosts, redditSort, isLoading,
      refreshReddit, loadMoreReddit, handleRedditSortChange,
      toggleRedditRead, markRedditAsRead, toggleRedditFavorite, updateRedditPost,
      removeSubreddit, addSubreddit, markAllRedditAsRead, markRedditPostsAsRead, prefetchRedditComments, getCachedComments, redditUnreadCount,
      enforceRetention
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
