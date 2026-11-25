import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef, useMemo } from 'react';
import { Subreddit, RedditPost } from '../types';
import { storage } from '../services/storage';
import DataWorker from '../workers/dataProcessor.worker.ts?worker';
import { useSettings } from './SettingsContext';
import { generateMockDataIfNeeded } from '../utils/mockDataGenerator';

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
  const redditSortRef = useRef<'new' | 'hot' | 'top'>('new');
  const sortCacheRef = useRef<Partial<Record<'new' | 'hot' | 'top', { posts: RedditPost[]; cursors: Record<string, string>; fetchedAt: number }>>>({});
  const workerRequestId = useRef<number>(0);
  const worker = useRef<Worker | undefined>(undefined);
  const commentCache = useRef<Map<string, any[]>>(new Map());
  const prefetchQueue = useRef<Set<string>>(new Set());
  const refreshAbortHelper = useRef<AbortController | null>(null);
  const loadMoreAbortHelper = useRef<AbortController | null>(null);

  const sortPostsList = useCallback((list: RedditPost[], sort: 'new' | 'hot' | 'top'): RedditPost[] => {
    const seen = new Set<string>();
    const unique: RedditPost[] = [];
    for (const item of list) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        unique.push(item);
      }
    }
    unique.sort((a, b) => {
      if (sort === 'new') return b.createdUtc - a.createdUtc;
      const scoreDiff = (b.score || 0) - (a.score || 0);
      return scoreDiff !== 0 ? scoreDiff : b.createdUtc - a.createdUtc;
    });
    return unique;
  }, []);

  useEffect(() => {
    setRedditUnreadCount(redditPosts.filter(p => !p.isRead).length);
  }, [redditPosts]);

  useEffect(() => {
    worker.current = new DataWorker();
    return () => {
      worker.current?.terminate();
      if (refreshAbortHelper.current) refreshAbortHelper.current.abort();
      if (loadMoreAbortHelper.current) loadMoreAbortHelper.current.abort();
    };
  }, []);

  useEffect(() => {
    subredditsRef.current = subreddits;
    redditPostsRef.current = redditPosts;
  }, [subreddits, redditPosts]);

  useEffect(() => {
    redditSortRef.current = redditSort;
  }, [redditSort]);

  useEffect(() => {
    const loadData = async () => {
      // Generate mock data if running in dev/web environment and DB is empty
      await generateMockDataIfNeeded();
      
      await storage.cleanupOldRedditPosts(settings.redditRetentionDays || 3);
      const loadedSubreddits = await storage.getSubreddits();
      const loadedRedditPosts = await storage.getRedditPosts(0, PAGE_SIZE);
      setRedditPosts(loadedRedditPosts);
      setSubreddits(loadedSubreddits);
      redditOffset.current = loadedRedditPosts.length;
    };
    loadData();
  }, [settings.redditRetentionDays]);

  const prefetchRedditComments = useCallback(async (permalink: string) => {
    // Prefetch disabled
  }, []);

  const getCachedComments = useCallback((permalink: string) => {
    return commentCache.current.get(permalink) || null;
  }, []);

  const refreshReddit = useCallback(async (subsToRefresh?: Subreddit[], currentPosts?: RedditPost[], sort?: 'new' | 'hot' | 'top') => {
    if (refreshAbortHelper.current) {
      refreshAbortHelper.current.abort();
    }
    const controller = new AbortController();
    refreshAbortHelper.current = controller;

    const targetSubs = subsToRefresh || subredditsRef.current;
    const targetSort = sort || redditSortRef.current;
    
    // Reset cursors on refresh
    if (!subsToRefresh) {
      paginationCursors.current = {};
    }

    if (targetSubs.length === 0) {
      if (refreshAbortHelper.current === controller) {
        refreshAbortHelper.current = null;
      }
      return;
    }

    setIsLoading(true);
    try {
      const results: RedditPost[][] = [];
      const BATCH_SIZE = 3;

      for (let i = 0; i < targetSubs.length; i += BATCH_SIZE) {
        if (controller.signal.aborted) break;
        const batch = targetSubs.slice(i, i + BATCH_SIZE);

        const settled = await Promise.allSettled(
          batch.map(async (sub) => {
            const result = await storage.fetchRedditPosts(sub.name, targetSort, undefined, controller.signal);
            return { subName: sub.name, result };
          })
        );

        if (controller.signal.aborted) break;

        for (const outcome of settled) {
          if (outcome.status === 'fulfilled') {
            const { subName, result } = outcome.value;
            if (result.after) {
              paginationCursors.current[subName] = result.after;
            }
            if (result.posts && result.posts.length > 0) {
              results.push(result.posts);
            }
          } else if (outcome.reason?.name !== 'AbortError') {
            console.error('Failed to refresh subreddit batch item', outcome.reason);
          }
        }

        if (i + BATCH_SIZE < targetSubs.length && !controller.signal.aborted) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }

      if (controller.signal.aborted) return;
      const posts: RedditPost[] = results.flat();

      if (worker.current) {
        const reqId = ++workerRequestId.current;
        const handler = (e: MessageEvent) => {
          if (e.data.type === 'mergedRedditPosts' && e.data.requestId === reqId) {
            worker.current?.removeEventListener('message', handler);
            controller.signal.removeEventListener('abort', abortHandler);
            if (controller.signal.aborted) {
              return;
            }

            const merged: RedditPost[] = e.data.merged;
            
            const retentionDays = settings.redditRetentionDays || 3;
            const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
            const now = Date.now();
            
            let filtered = merged.filter(p => {
              if (p.isFavorite) return true;
              const postUtc = (p.createdUtc || 0) < 10000000000 ? (p.createdUtc || 0) * 1000 : (p.createdUtc || 0);
              const isWithinRetention = (now - postUtc) < retentionMs;
              const hasComments = p.numComments >= 0;
              return isWithinRetention && hasComments;
            });

            if (filtered.length < 5 && merged.length > 0) {
              filtered = sortPostsList(merged, targetSort).slice(0, 5);
            } else {
              filtered = sortPostsList(filtered, targetSort);
            }

            // Only commit to state if user is still on this sort (or it's a targeted sub refresh)
            if (redditSortRef.current === targetSort || subsToRefresh) {
              setRedditPosts(filtered);
            }
            sortCacheRef.current[targetSort] = {
              posts: filtered,
              cursors: { ...paginationCursors.current },
              fetchedAt: Date.now()
            };
            storage.saveRedditPosts(filtered);
          }
        };
        const abortHandler = () => {
          worker.current?.removeEventListener('message', handler);
        };
        controller.signal.addEventListener('abort', abortHandler, { once: true });
        worker.current.addEventListener('message', handler);
        worker.current.postMessage({
          type: 'mergeRedditPosts',
          prev: redditPostsRef.current,
          incoming: posts,
          sort: targetSort,
          requestId: reqId
        });
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Error refreshing Reddit:', e);
      }
    } finally {
      if (refreshAbortHelper.current === controller) {
        refreshAbortHelper.current = null;
        setIsLoading(false);
      }
    }
  }, [settings.redditRetentionDays, sortPostsList]);

  const loadMoreReddit = useCallback(async () => {
    // 1. Try to load more from local storage first
    const moreLocalPosts = await storage.getRedditPosts(redditOffset.current, PAGE_SIZE);
    
    if (moreLocalPosts.length > 0) {
      setRedditPosts(prev => sortPostsList([...prev, ...moreLocalPosts], redditSortRef.current));
      redditOffset.current += moreLocalPosts.length;
      return;
    }

    // 2. If no more local posts, fetch from API
    const targetSubs = subredditsRef.current;
    if (targetSubs.length === 0) return;

    if (loadMoreAbortHelper.current) {
      loadMoreAbortHelper.current.abort();
    }
    const controller = new AbortController();
    loadMoreAbortHelper.current = controller;

    setIsLoading(true);
    try {
      const oldestPost = redditPostsRef.current[redditPostsRef.current.length - 1];
      const retentionDays = settings.redditRetentionDays || 3;
      const targetDateBoundary = oldestPost ? oldestPost.createdUtc - (retentionDays * 24 * 60 * 60 * 1000) : Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
      
      let allNewPosts: RedditPost[] = [];
      let reachedBoundary = false;
      let attempts = 0;
      const MAX_ATTEMPTS = 3; // Limit to avoid infinite loops if it's very quiet

      while (!reachedBoundary && attempts < MAX_ATTEMPTS) {
        if (controller.signal.aborted) break;
        attempts++;
        const batch: RedditPost[] = [];
        const activeSubs = targetSubs.filter(sub => paginationCursors.current[sub.name] !== 'end');
        const BATCH_SIZE = 3;

        for (let i = 0; i < activeSubs.length; i += BATCH_SIZE) {
          if (controller.signal.aborted) break;
          const chunk = activeSubs.slice(i, i + BATCH_SIZE);

          const settled = await Promise.allSettled(
            chunk.map(async (sub) => {
              const cursor = paginationCursors.current[sub.name];
              const result = await storage.fetchRedditPosts(sub.name, redditSortRef.current, cursor, controller.signal);
              return { subName: sub.name, result };
            })
          );

          if (controller.signal.aborted) break;

          for (const outcome of settled) {
            if (outcome.status === 'fulfilled') {
              const { subName, result } = outcome.value;
              paginationCursors.current[subName] = result.after ? result.after : 'end';
              if (result.posts && result.posts.length > 0) {
                batch.push(...result.posts);
              }
            } else if (outcome.reason?.name !== 'AbortError') {
              console.error('Failed to load more for subreddit batch item', outcome.reason);
            }
          }

          if (i + BATCH_SIZE < activeSubs.length && !controller.signal.aborted) {
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        }
        
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
      
      if (controller.signal.aborted) return;

      if (allNewPosts.length > 0) {
        setRedditPosts(prev => {
          const unique = sortPostsList([...prev, ...allNewPosts], redditSortRef.current);
          storage.saveRedditPosts(allNewPosts);
          return unique;
        });
        redditOffset.current += allNewPosts.length;
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Error loading more Reddit:', e);
      }
    } finally {
      if (loadMoreAbortHelper.current === controller) {
        loadMoreAbortHelper.current = null;
      }
      setIsLoading(false);
    }
  }, [settings.redditRetentionDays, sortPostsList]);

  const handleRedditSortChange = useCallback(async (sort: 'new' | 'hot' | 'top') => {
    redditSortRef.current = sort;
    setRedditSort(sort);

    const SORT_CACHE_TTL_MS = 60_000;
    const cached = sortCacheRef.current[sort];
    if (cached && (Date.now() - cached.fetchedAt) < SORT_CACHE_TTL_MS && cached.posts.length > 0) {
      if (refreshAbortHelper.current) {
        refreshAbortHelper.current.abort();
        refreshAbortHelper.current = null;
        setIsLoading(false);
      }
      // Sync latest read/favorite/score state from active posts
      const currentMap = new Map<string, RedditPost>(redditPostsRef.current.map(p => [p.id, p]));
      const synced = cached.posts.map(p => {
        const live = currentMap.get(p.id);
        return live
          ? {
              ...p,
              isRead: live.isRead,
              isFavorite: live.isFavorite,
              score: Math.max(p.score || 0, live.score || 0),
              numComments: Math.max(p.numComments || 0, live.numComments || 0)
            }
          : p;
      });
      paginationCursors.current = { ...cached.cursors };
      setRedditPosts(sortPostsList(synced, sort));
      return;
    }

    // Optimistic instant local re-sort so UI responds immediately before network completes
    if (redditPostsRef.current.length > 0) {
      setRedditPosts(sortPostsList(redditPostsRef.current, sort));
    }

    await refreshReddit(undefined, undefined, sort);
  }, [refreshReddit, sortPostsList]);

  const toggleRedditRead = useCallback(async (id: string) => {
    let nextVal: 0 | 1 = 1;
    setRedditPosts(prev => {
      return prev.map(p => {
        if (p.id === id) {
          nextVal = p.isRead ? 0 : 1;
          return { ...p, isRead: nextVal };
        }
        return p;
      });
    });
    await storage.updateRedditPost(id, { isRead: nextVal });
  }, []);

  const markRedditAsRead = useCallback(async (id: string) => {
    setRedditPosts(prev => prev.map(p => p.id === id ? { ...p, isRead: 1 } : p));
    await storage.updateRedditPost(id, { isRead: 1 });
  }, []);

  const markRedditPostsAsRead = useCallback(async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    setRedditPosts(prev => prev.map(p => (idSet.has(p.id) && !p.isRead ? { ...p, isRead: 1 } : p)));
    await storage.markRedditPostsAsRead(ids);
  }, []);

  const toggleRedditFavorite = useCallback(async (id: string) => {
    let nextVal: 0 | 1 = 1;
    setRedditPosts(prev => {
      return prev.map(p => {
        if (p.id === id) {
          nextVal = p.isFavorite ? 0 : 1;
          return { ...p, isFavorite: nextVal };
        }
        return p;
      });
    });
    await storage.updateRedditPost(id, { isFavorite: nextVal });
  }, []);

  const updateRedditPost = useCallback(async (id: string, updates: Partial<RedditPost>) => {
    setRedditPosts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    await storage.updateRedditPost(id, updates);
  }, []);

  const removeSubreddit = useCallback(async (id: string) => {
    const sub = subreddits.find(s => s.id === id);
    if (!sub) return;

    sortCacheRef.current = {};
    setSubreddits(prev => prev.filter(s => s.id !== id));
    setRedditPosts(prev => prev.filter(p => (p.subredditName || '').toLowerCase() !== sub.name.toLowerCase()));
    
    await storage.removeSubreddit(id);
  }, [subreddits]);

  const addSubreddit = useCallback(async (url: string) => {
    const result = await storage.addSubreddit(url);
    if (result) {
      sortCacheRef.current = {};
      setSubreddits(prev => [...prev, result]);
      await refreshReddit([result]);
    }
  }, [refreshReddit]);

  const markAllRedditAsRead = useCallback(() => {
    setRedditPosts(prev => {
      const next = prev.map(p => ({ ...p, isRead: 1 }));
      storage.saveRedditPosts(next);
      return next;
    });
  }, []);

  const enforceRetention = useCallback(async () => {
    sortCacheRef.current = {};
    await storage.cleanupOldRedditPosts(settings.redditRetentionDays || 3);
    const limit = Math.max(PAGE_SIZE, redditPostsRef.current.length, redditOffset.current);
    const loadedRedditPosts = await storage.getRedditPosts(0, limit);
    setRedditPosts(loadedRedditPosts);
    redditOffset.current = loadedRedditPosts.length;
  }, [settings.redditRetentionDays]);

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

  const value = useMemo(() => ({
    subreddits, redditPosts, redditSort, isLoading,
    refreshReddit, loadMoreReddit, handleRedditSortChange,
    toggleRedditRead, markRedditAsRead, toggleRedditFavorite, updateRedditPost,
    removeSubreddit, addSubreddit, markAllRedditAsRead, markRedditPostsAsRead, prefetchRedditComments, getCachedComments, redditUnreadCount,
    enforceRetention
  }), [
    subreddits, redditPosts, redditSort, isLoading,
    refreshReddit, loadMoreReddit, handleRedditSortChange,
    toggleRedditRead, markRedditAsRead, toggleRedditFavorite, updateRedditPost,
    removeSubreddit, addSubreddit, markAllRedditAsRead, markRedditPostsAsRead, prefetchRedditComments, getCachedComments, redditUnreadCount,
    enforceRetention
  ]);

  return (
    <RedditContext.Provider value={value}>
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
