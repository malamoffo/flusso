import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { fetchTelegramMessages, fetchTelegramChannelInfo } from '../services/telegramParser';
import { Feed, Article, Settings, Subreddit, RedditPost, TelegramChannel, TelegramMessage } from '../types';
import { storage, defaultSettings } from '../services/storage';
import packageJson from '../../package.json';
import { Capacitor } from '@capacitor/core';
import { BackgroundPlugin } from '../plugins/BackgroundPlugin';
import DataWorker from '../workers/dataProcessor.worker?worker';

import { imagePersistence } from '../utils/imagePersistence';

interface ProgressInfo {
  current: number;
  total: number;
  status?: string;
}

interface RssContextType {
  feeds: Feed[];
  articles: Article[];
  subreddits: Subreddit[];
  redditPosts: RedditPost[];
  telegramChannels: TelegramChannel[];
  telegramMessages: Record<string, TelegramMessage[]>;
  settings: Settings;
  isLoading: boolean;
  progress: ProgressInfo | null;
  error: string | null;
  setError: (error: string | null) => void;
  errorLogs: string[];
  clearErrorLogs: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  unreadCount: number;
  savedCount: number;
  updateInfo: any | null;
  addFeedOrSubreddit: (url: string) => Promise<'article' | 'podcast' | 'reddit' | 'subreddit' | void>;
  importOpml: (file: File | { text: () => Promise<string> }) => Promise<void>;
  exportFeeds: () => Promise<string>;
  removeFeed: (id: string) => void;
  removeSubreddit: (id: string) => void;
  refreshFeeds: (feedsToRefresh?: Feed[], currentArticles?: Article[]) => Promise<void>;
  refreshReddit: (subsToRefresh?: Subreddit[], currentPosts?: RedditPost[], sort?: 'new' | 'hot' | 'top') => Promise<void>;
  loadMoreReddit: () => Promise<void>;
  redditSort: 'new' | 'hot' | 'top';
  handleRedditSortChange: (sort: 'new' | 'hot' | 'top') => Promise<void>;
  toggleRead: (id: string) => void;
  markAsRead: (id: string) => void;
  markArticlesAsRead: (ids: string[]) => void;
  markAllAsRead: () => void;
  markAllTelegramAsRead: () => void;
  toggleFavorite: (id: string) => void;
  toggleQueue: (id: string) => void;
  removeFromSaved: (id: string) => void;
  updateFeed: (id: string, updates: Partial<Feed>) => void;
  updateArticle: (id: string, updates: Partial<Article>) => void;
  updateRedditPost: (id: string, updates: Partial<RedditPost>) => void;
  toggleRedditRead: (id: string) => void;
  markRedditAsRead: (id: string) => void;
  toggleRedditFavorite: (id: string) => void;
  updateSettings: (updates: Partial<Settings>) => void;
  checkUpdates: (force?: boolean) => Promise<void>;
}

const RssContext = createContext<RssContextType | undefined>(undefined);

export const RssProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [redditPosts, setRedditPosts] = useState<RedditPost[]>([]);
  const [telegramChannels, setTelegramChannels] = useState<TelegramChannel[]>([]);
  const [telegramMessages, setTelegramMessages] = useState<Record<string, TelegramMessage[]>>({});
  const [redditSort, setRedditSort] = useState<'new' | 'hot' | 'top'>('new');
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorLogs, setErrorLogs] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const articlesRef = useRef<Article[]>([]);
  const redditPostsRef = useRef<RedditPost[]>([]);

  useEffect(() => {
    articlesRef.current = articles;
    redditPostsRef.current = redditPosts;
  }, [articles, redditPosts]);

  const logError = useCallback((msg: string) => {
    setErrorLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  }, []);

  const clearErrorLogs = useCallback(() => {
    setErrorLogs([]);
  }, []);
  const [updateInfo, setUpdateInfo] = useState<any | null>(null);
  const lastRefresh = useRef(Date.now());
  const isRefreshing = useRef(false);
  const isRefreshingReddit = useRef(false);
  const worker = useRef<Worker>();

  useEffect(() => {
    worker.current = new DataWorker();
    return () => worker.current?.terminate();
  }, []);

  const checkUpdates = useCallback(async (force = false) => {
    try {
      // Use a proxy to avoid GitHub API rate limits or CORS issues in some environments
      const response = await fetch('https://api.github.com/repos/malamoffo/flusso/releases/latest');
      if (response.ok) {
        const data = await response.json();
        const latestVersion = data.tag_name.replace('v', '');
        const currentVersion = packageJson.version;
        
        if (latestVersion !== currentVersion) {
          setUpdateInfo({
            hasUpdate: true,
            latestRelease: {
              version: latestVersion,
              notes: data.body,
              url: data.html_url
            }
          });
        } else {
          setUpdateInfo({ hasUpdate: false });
        }
      }
    } catch (e) {
      console.error('Failed to check for updates', e);
    }
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      
      const loadedFeeds = await storage.getFeeds();
      const loadedArticles = await storage.getArticles(0, 0);
      const loadedSubreddits = await storage.getSubreddits();
      const loadedRedditPosts = await storage.getRedditPosts();
      const loadedSettings = await storage.getSettings();
      
      setFeeds(loadedFeeds);
      setArticles(loadedArticles);      
      setSubreddits(loadedSubreddits);
      setRedditPosts(loadedRedditPosts.sort((a, b) => b.createdUtc - a.createdUtc));
      setSettings(loadedSettings);
      
      return { loadedFeeds, loadedArticles, loadedSubreddits, loadedRedditPosts, loadedSettings };
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshFeeds = useCallback(async (feedsToRefresh?: Feed[], currentArticles?: Article[]) => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    try {
      setIsLoading(true);

      const fToRefresh = feedsToRefresh || await storage.getFeeds();
      const cArticles = currentArticles || await storage.getArticles(0, 0);
      
      if (fToRefresh.length === 0) {
        setIsLoading(false);
        isRefreshing.current = false;
        return;
      }
      
      setProgress({ current: 0, total: fToRefresh.length });
      const results: { feed: Feed; articles: Article[] }[] = [];
      let completed = 0;
      
      // Precompute the latest article date for each feed for O(1) lookups
      const latestArticleDateByFeedId = new Map<string, number>();
      for (const article of cArticles) {
        const currentLatest = latestArticleDateByFeedId.get(article.feedId) || 0;
        if (article.pubDate > currentLatest) {
          latestArticleDateByFeedId.set(article.feedId, article.pubDate);
        }
      }
      
      const queue = [...fToRefresh];
      let queueIndex = 0;
      const FEED_TIMEOUT = 25000; // 25 seconds max per feed total
      
      const workers = Array(Math.min(6, queue.length)).fill(null).map(async () => {
        while (queueIndex < queue.length) {
          const feed = queue[queueIndex++];
          if (!feed) break;
          
          try {
            // Find the latest article date for this feed to only fetch newer articles
            const latestArticleDate = latestArticleDateByFeedId.get(feed.id);
            
            const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
            const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
            const hardSinceDate = Date.now() - (feed.type === 'podcast' ? TWO_WEEKS : THREE_DAYS);
            
            const sinceDate = Math.max(latestArticleDate || feed.lastArticleDate || 0, hardSinceDate);
            
            // Global timeout for this specific feed fetch
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FEED_TIMEOUT);
            
            try {
              const data = await storage.fetchFeedData(feed.feedUrl, sinceDate, controller.signal);
              if (data) {
                results.push(data);
                
                // Inserisci i nuovi articoli uno alla volta nella corretta posizione cronologica
                if (data.articles && data.articles.length > 0) {
                  // Ensure articles have the correct feedId from the existing feed
                  const articlesWithCorrectId = data.articles.map(a => ({ ...a, feedId: feed.id }));
                  // Update the results array so storage.saveAllFeedData also uses the correct ID
                  data.articles = articlesWithCorrectId;
                  
                    const { merged, hasNew } = await new Promise<{ merged: Article[], hasNew: boolean }>((resolve) => {
                      const requestId = uuidv4();
                      const handler = (e: MessageEvent) => {
                        if (e.data.type === 'mergedArticles' && e.data.requestId === requestId) {
                          worker.current!.removeEventListener('message', handler);
                          resolve(e.data);
                        }
                      };
                      worker.current!.addEventListener('message', handler);
                      worker.current!.postMessage({ type: 'mergeArticles', prev: articlesRef.current, incoming: articlesWithCorrectId, requestId });
                    });

                    if (hasNew) {
                      setArticles(merged);
                    }
                }
              }
            } finally {
              clearTimeout(timeoutId);
            }
          } catch (e: any) {
            if (e.name === 'AbortError') {
              console.warn(`Skipping feed ${feed.feedUrl} due to timeout (${FEED_TIMEOUT}ms)`);
            } else {
              console.warn(`Skipping feed ${feed.feedUrl} due to error:`, e);
            }
          } finally {
            completed++;
            setProgress(p => p ? { ...p, current: completed } : { current: completed, total: fToRefresh.length });
          }
        }
      });
      
      await Promise.all(workers);
      
      if (results.length > 0) {
        setProgress(p => p ? { ...p, status: "Saving articles..." } : null);
        const { updatedFeeds } = await storage.saveAllFeedData(results, fToRefresh, cArticles);
        
        setFeeds(updatedFeeds);
      }
      
      setProgress(p => p ? { ...p, status: "Finalizing..." } : null);
      lastRefresh.current = Date.now();
    } catch (e) {
      // Failed to refresh feeds
    } finally {
      setIsLoading(false);
      setProgress(null);
      isRefreshing.current = false;
    }
  }, []);

  const refreshReddit = useCallback(async (subsToRefresh?: Subreddit[], currentPosts?: RedditPost[], sort?: 'new' | 'hot' | 'top') => {
    const currentSort = sort || redditSort;
    
    if (isRefreshingReddit.current) {
        console.warn('[RSS] Already refreshing reddit');
        return;
    }
    isRefreshingReddit.current = true;
    try {
      setIsLoading(true);
      
      // Use provided subs or current state, but if state is empty try to load from storage
      let sToRefresh = subsToRefresh || subreddits;
      if (sToRefresh.length === 0 && !subsToRefresh) {
        sToRefresh = await storage.getSubreddits();
      }

      if (sToRefresh.length === 0) {
        console.warn('[RSS] No subreddits to refresh');
        setIsLoading(false);
        isRefreshingReddit.current = false;
        return;
      }

      const sinceDate = currentSort === 'new' ? Date.now() - (3 * 24 * 60 * 60 * 1000) : undefined;

      const updatedSubs = [...sToRefresh];
      let subsChanged = false;

      await Promise.all(sToRefresh.map(async (sub, index) => {
        try {
          const posts = await storage.fetchSubredditPosts(sub.name, sinceDate, undefined, currentSort);
          if (posts.length > 0) {
            updatedSubs[index] = { ...sub, lastFetched: Date.now() };
            subsChanged = true;
            
            setRedditPosts(prev => {
              // This is now handled by the worker
              return prev;
            });
            
            const { merged, hasNew } = await new Promise<{ merged: RedditPost[], hasNew: boolean }>((resolve) => {
              const requestId = uuidv4();
              const handler = (e: MessageEvent) => {
                if (e.data.type === 'mergedRedditPosts' && e.data.requestId === requestId) {
                  worker.current!.removeEventListener('message', handler);
                  resolve(e.data);
                }
              };
              worker.current!.addEventListener('message', handler);
              worker.current!.postMessage({ type: 'mergeRedditPosts', prev: redditPostsRef.current, incoming: posts, sort: currentSort, requestId });
            });

            if (hasNew) {
              setRedditPosts(merged);
            }
          }
        } catch (e) {
          console.error(`Failed to refresh subreddit ${sub.name}`, e);
        }
      }));

      if (subsChanged) {
        setSubreddits(prev => {
          // Merge updated subs into current state
          const newSubs = [...prev];
          updatedSubs.forEach(updated => {
            const idx = newSubs.findIndex(s => s.id === updated.id);
            if (idx !== -1) {
              newSubs[idx] = updated;
            } else {
              newSubs.push(updated);
            }
          });
          storage.saveSubreddits(newSubs);
          return newSubs;
        });
      }

      if (sort) {
        setRedditPosts(prev => {
          const merged = [...prev];
          if (currentSort === 'new') {
            merged.sort((a, b) => b.createdUtc - a.createdUtc);
          } else {
            merged.sort((a, b) => (b.score || 0) - (a.score || 0));
          }
          storage.saveRedditPosts(merged);
          return merged;
        });
      }
    } catch (e) {
      logError("Failed to refresh reddit");
      console.error("Failed to refresh reddit", e);
    } finally {
      setIsLoading(false);
      isRefreshingReddit.current = false;
    }
  }, [subreddits, redditSort]);

  useEffect(() => {
    let mounted = true;
    loadData().then(data => {
      if (mounted && data) {
        // Automatic refresh removed to improve initial load performance
      }
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    // Background polling for Reddit posts (every 5 minutes)
    const redditInterval = setInterval(() => {
      if (subreddits.length > 0) {
        refreshReddit();
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(redditInterval);
  }, [refreshReddit, subreddits.length]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      if (feeds.length > 0 && settings.refreshInterval > 0) {
        const syncFeeds = feeds.map(f => ({
          id: f.id,
          url: f.feedUrl,
          title: f.title,
          lastFetched: f.lastFetched || 0
        }));
        BackgroundPlugin.setupBackgroundSync({
          feeds: syncFeeds,
          intervalMinutes: settings.refreshInterval
        }).catch(console.error);
      } else {
        BackgroundPlugin.stopBackgroundSync().catch(console.error);
      }
    }
  }, [feeds, settings.refreshInterval]);

  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      storage.saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const addFeedOrSubreddit = useCallback(async (url: string): Promise<'article' | 'podcast' | 'reddit' | 'subreddit' | void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Check if it's a subreddit
      let isSubreddit = false;
      let cleanName = url.trim();
      const lowerName = cleanName.toLowerCase();
      if (lowerName.includes('reddit.com/r/')) {
        isSubreddit = true;
      } else if (lowerName.startsWith('r/')) {
        isSubreddit = true;
      }

      if (isSubreddit) {
        const result = await storage.addSubreddit(cleanName);
        if (!result) {
          throw new Error("Could not fetch subreddit. Please check the name and try again.");
        }
        await refreshReddit([result]);
        await loadData();
        return 'subreddit';
      } else if (!url.includes('://') && !lowerName.startsWith('r/')) {
        return await addTelegramChannel(cleanName);
      } else {
        const result = await storage.addFeed(url);
        if (!result) {
          throw new Error("Could not fetch feed. Please check the URL and try again.");
        }
        await loadData();
        if (result.feed.feedUrl.includes('reddit.com')) {
          return 'reddit';
        }
        return result.feed.type as 'article' | 'podcast';
      }
    } catch (err: any) {
      const errMsg = err.message || "Failed to add feed or subreddit. Please check the URL.";
      setError(errMsg);
      logError(errMsg);
      console.error(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeSubreddit = useCallback(async (id: string) => {
    setSubreddits(prev => {
      const updated = prev.filter(s => s.id !== id);
      storage.saveSubreddits(updated);
      return updated;
    });
    setRedditPosts(prev => {
      const updated = prev.filter(p => p.subredditId !== id);
      storage.saveRedditPosts(updated);
      return updated;
    });
  }, []);

  const importOpml = async (file: File | { text: () => Promise<string> }, append = true) => {
    try {
      setIsLoading(true);
      setError(null);
      let text;
      if (typeof file.text === 'function') {
        text = await file.text();
      } else {
        text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsText(file as File);
        });
      }
      
      const urls = await storage.parseOpml(text);
      if (urls.length === 0) {
        logError("No valid feed URLs found in the OPML file.");
        return;
      }
      
      if (!append) {
        await storage.saveFeeds([]);
        await storage.saveArticles([]);
        setFeeds([]);
        setArticles([]);
      }
      
      let successCount = 0;
      let failCount = 0;
      setProgress({ current: 0, total: urls.length, status: "Starting import..." });
      
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
          setProgress({ current: i, total: urls.length, status: `Importing: ${url}` });
          const result = await storage.addFeed(url);
          if (result) {
            successCount++;
          } else {
            console.warn(`Failed to fetch feed during import: ${url}`);
            failCount++;
          }
        } catch (e) {
          console.error(`Failed to import ${url}`, e);
          failCount++;
        }
        setProgress({ current: i + 1, total: urls.length, status: `Imported ${i + 1}/${urls.length}` });
      }
      
      await loadData();
      if (failCount > 0) {
        console.warn(`Import completed with warnings: ${successCount} feeds imported, ${failCount} failed.`);
      } else {
        setError(null);
      }
    } catch (err) {
      logError("Failed to parse OPML file.");
      console.error(err);
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  };

  const toggleRead = useCallback(async (id: string) => {
    setArticles(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, isRead: !a.isRead, readAt: a.isRead ? undefined : Date.now() } : a);
      storage.saveArticles(updated);
      return updated;
    });
  }, []);

  const markArticlesAsRead = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    const now = Date.now();
    setArticles(prev => {
      let changed = false;
      const updated = prev.map(a => {
        if (idSet.has(a.id) && !a.isRead) {
          changed = true;
          return { ...a, isRead: true, readAt: now };
        }
        return a;
      });
      if (changed) storage.saveArticles(updated);
      return changed ? updated : prev;
    });
  }, []);

  const pendingReadIds = useRef<Set<string>>(new Set());
  const markAsReadTimeout = useRef<NodeJS.Timeout | null>(null);

  const markAsRead = useCallback((id: string) => {
    pendingReadIds.current.add(id);
    if (markAsReadTimeout.current) {
      clearTimeout(markAsReadTimeout.current);
    }
    markAsReadTimeout.current = setTimeout(() => {
      const idsToMark = Array.from(pendingReadIds.current);
      pendingReadIds.current.clear();
      if (idsToMark.length > 0) {
        markArticlesAsRead(idsToMark);
      }
    }, 500);
  }, [markArticlesAsRead]);

  const markAllAsRead = useCallback(async () => {
    const now = Date.now();
    setArticles(prev => {
      const updated = prev.map(a => ({ ...a, isRead: true, readAt: a.isRead ? a.readAt : now }));
      storage.saveArticles(updated);
      return updated;
    });
  }, []);

  const markAllTelegramAsRead = useCallback(async () => {
    setTelegramChannels(prev => {
      const updated = prev.map(c => ({ ...c, unreadCount: 0 }));
      storage.saveTelegramChannels(updated);
      return updated;
    });
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    setArticles(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, isFavorite: !a.isFavorite } : a);
      storage.saveArticles(updated);
      return updated;
    });
  }, []);

  const toggleQueue = useCallback(async (id: string) => {
    setArticles(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, isQueued: !a.isQueued } : a);
      storage.saveArticles(updated);
      return updated;
    });
  }, []);

  const removeFromSaved = useCallback(async (id: string) => {
    setArticles(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, isFavorite: false, isQueued: false } : a);
      storage.saveArticles(updated);
      return updated;
    });
  }, []);

  const updateArticle = useCallback(async (id: string, updates: Partial<Article>) => {
    setArticles(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, ...updates } : a);
      storage.saveArticles(updated);
      return updated;
    });
  }, []);

  const updateRedditPost = useCallback(async (id: string, updates: Partial<RedditPost>) => {
    setRedditPosts(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      storage.saveRedditPosts(updated);
      return updated;
    });
  }, []);

  const toggleRedditRead = useCallback(async (id: string) => {
    setRedditPosts(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, isRead: !p.isRead, readAt: !p.isRead ? Date.now() : undefined } : p);
      storage.saveRedditPosts(updated);
      return updated;
    });
  }, []);

  const markRedditAsRead = useCallback(async (id: string) => {
    setRedditPosts(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, isRead: true, readAt: Date.now() } : p);
      storage.saveRedditPosts(updated);
      return updated;
    });
  }, []);

  const toggleRedditFavorite = useCallback(async (id: string) => {
    setRedditPosts(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, isFavorite: !p.isFavorite } : p);
      storage.saveRedditPosts(updated);
      return updated;
    });
  }, []);

  const removeFeed = useCallback(async (id: string) => {
    setFeeds(prev => {
      const updated = prev.filter(f => f.id !== id);
      storage.saveFeeds(updated);
      return updated;
    });
    setArticles(prev => {
      const updated = prev.filter(a => a.feedId !== id);
      storage.saveArticles(updated);
      return updated;
    });
  }, []);

  const updateFeed = useCallback(async (id: string, updates: Partial<Feed>) => {
    setFeeds(prev => {
      const updated = prev.map(f => f.id === id ? { ...f, ...updates } : f);
      storage.saveFeeds(updated);
      return updated;
    });
  }, []);

  const exportFeeds = useCallback(async () => {
    return await storage.exportOpml();
  }, []);


  const loadMoreReddit = useCallback(async () => {
    try {
      setIsLoading(true);
      const sToRefresh = await storage.getSubreddits();
      const cPosts = await storage.getRedditPosts();

      if (sToRefresh.length === 0) return;

      await Promise.all(sToRefresh.map(async (sub) => {
        try {
          // Find the oldest post for this subreddit to use as 'after' token
          const subPosts = cPosts.filter(p => p.subredditId === sub.id || p.subredditName.toLowerCase() === sub.name.toLowerCase());
          let afterToken: string | undefined = undefined;
          if (subPosts.length > 0) {
            // Posts are sorted newest first, so the oldest is at the end
            const oldestPost = subPosts[subPosts.length - 1];
            afterToken = oldestPost.id;
          }

          const posts = await storage.fetchSubredditPosts(sub.name, undefined, afterToken, redditSort);
          if (posts.length > 0) {
            const { merged, hasNew } = await new Promise<{ merged: RedditPost[], hasNew: boolean }>((resolve) => {
              const handler = (e: MessageEvent) => {
                if (e.data.type === 'mergedRedditPosts') {
                  worker.current!.removeEventListener('message', handler);
                  resolve(e.data);
                }
              };
              worker.current!.addEventListener('message', handler);
              worker.current!.postMessage({ type: 'mergeRedditPosts', prev: redditPostsRef.current, incoming: posts, sort: redditSort });
            });

            if (hasNew) {
              setRedditPosts(merged);
            }
          }
        } catch (e) {
          console.error(`Failed to load more for subreddit ${sub.name}`, e);
        }
      }));
    } catch (e) {
      console.error("Failed to load more reddit posts", e);
    } finally {
      setIsLoading(false);
    }
  }, [redditSort]);

  const handleRedditSortChange = useCallback(async (sort: 'new' | 'hot' | 'top') => {
    setRedditSort(sort);
    
    // Sort existing posts
    setRedditPosts(prev => {
        const sorted = [...prev];
        if (sort === 'new') {
            sorted.sort((a, b) => b.createdUtc - a.createdUtc);
        } else {
            sorted.sort((a, b) => (b.score || 0) - (a.score || 0));
        }
        storage.saveRedditPosts(sorted);
        return sorted;
    });
    
    // Refresh new posts
    await refreshReddit(undefined, undefined, sort);
  }, [refreshReddit]);

  const cleanupTelegramMessages = useCallback((channel: TelegramChannel, messages: TelegramMessage[]) => {
    const retentionMs = settings.telegramRetentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return messages.filter(m => now - m.date < retentionMs);
  }, [settings.telegramRetentionDays]);

  const refreshTelegramChannels = useCallback(async (channelsToRefresh?: TelegramChannel[]) => {
    const channels = channelsToRefresh || telegramChannels;
    
    for (const channel of channels) {
      try {
        const [messages, info] = await Promise.all([
          fetchTelegramMessages(channel.username),
          fetchTelegramChannelInfo(channel.username)
        ]);
        
        // Update channel info if changed
        if (info.name !== channel.name || info.imageUrl !== channel.imageUrl) {
          setTelegramChannels(prev => {
            const updated = prev.map(c => c.id === channel.id ? { ...c, name: info.name, imageUrl: info.imageUrl } : c);
            storage.saveTelegramChannels(updated);
            return updated;
          });
        }

        const { merged, hasNew } = await new Promise<{ merged: TelegramMessage[], hasNew: boolean }>((resolve) => {
          const requestId = uuidv4();
          const handler = (e: MessageEvent) => {
            if (e.data.type === 'mergedTelegramMessages' && e.data.requestId === requestId) {
              worker.current!.removeEventListener('message', handler);
              resolve(e.data);
            }
          };
          worker.current!.addEventListener('message', handler);
          worker.current!.postMessage({ 
            type: 'mergeTelegramMessages', 
            prev: telegramMessages[channel.id] || [], 
            incoming: messages,
            requestId
          });
        });
        
        const cleaned = cleanupTelegramMessages(channel, merged);
        
        if (hasNew || cleaned.length !== merged.length) {
          setTelegramMessages(prev => ({ ...prev, [channel.id]: cleaned }));
          storage.saveTelegramMessages(cleaned);
        }
      } catch (e) {
        console.error(`Failed to refresh channel ${channel.name}`, e);
      }
    }
  }, [telegramChannels, telegramMessages, cleanupTelegramMessages]);

  const addTelegramChannel = useCallback(async (username: string) => {
    try {
      setError(null);
      const [messages, info] = await Promise.all([
        fetchTelegramMessages(username),
        fetchTelegramChannelInfo(username)
      ]);
      
      const channel: TelegramChannel = {
        id: uuidv4(),
        name: info.name,
        username,
        imageUrl: info.imageUrl,
        lastMessageDate: messages.length > 0 ? messages[0].date : Date.now(),
        lastChecked: Date.now(),
        unreadCount: messages.length,
        lastOpened: Date.now(),
        retentionDays: 30,
      };
      await storage.addTelegramChannel(channel);
      setTelegramChannels(prev => [...prev, channel]);
      setTelegramMessages(prev => ({ ...prev, [channel.id]: messages }));
      storage.saveTelegramMessages(messages);
      return 'telegram';
    } catch (e: any) {
      const errMsg = "Canale Telegram non trovato o non accessibile";
      setError(errMsg);
      throw new Error(errMsg);
    }
  }, []);

  const removeTelegramChannel = useCallback(async (id: string) => {
    await storage.removeTelegramChannel(id);
    setTelegramChannels(prev => prev.filter(c => c.id !== id));
    setTelegramMessages(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  /**
   * ⚡ Bolt: Consolidate article counters into a single pass O(N) iteration.
   * This avoids multiple filter().length calls (O(N) each) across the app, 
   * which is especially beneficial as the article list grows to thousands of items.
   * Expected: Reduces CPU time for derived state calculation by ~50% on every article update.
   */
  const { unreadCount, savedCount } = useMemo(() => {
    let unread = 0;
    let saved = 0;
    for (let i = 0; i < articles.length; i++) {
      const a = articles[i];
      if (!a.isRead) unread++;
      if (a.isFavorite || a.isQueued) saved++;
    }
    return { unreadCount: unread, savedCount: saved };
  }, [articles]);

  const value = useMemo(() => ({
    feeds, articles, subreddits, redditPosts, telegramChannels, telegramMessages, settings, isLoading, progress, error, setError, errorLogs, clearErrorLogs,
    addFeedOrSubreddit, addTelegramChannel, removeTelegramChannel, importOpml, toggleRead, markAsRead, markArticlesAsRead,
    toggleFavorite, toggleQueue, removeFromSaved, markAllAsRead, markAllTelegramAsRead, refreshFeeds, refreshReddit, refreshTelegramChannels, loadMoreReddit, removeFeed, removeSubreddit,
    updateFeed, updateArticle, updateRedditPost, toggleRedditRead, markRedditAsRead, toggleRedditFavorite, updateSettings, exportFeeds,
    searchQuery, setSearchQuery, unreadCount, savedCount, updateInfo, checkUpdates,
    redditSort, handleRedditSortChange
  }), [
    feeds, articles, subreddits, redditPosts, telegramChannels, telegramMessages, settings, isLoading, progress, error, setError, errorLogs, clearErrorLogs,
    addFeedOrSubreddit, addTelegramChannel, removeTelegramChannel, importOpml, toggleRead, markAsRead, markArticlesAsRead,
    toggleFavorite, toggleQueue, removeFromSaved, markAllAsRead, markAllTelegramAsRead, refreshFeeds, refreshReddit, refreshTelegramChannels, loadMoreReddit, removeFeed, removeSubreddit,
    updateFeed, updateArticle, updateRedditPost, toggleRedditRead, markRedditAsRead, toggleRedditFavorite, updateSettings, exportFeeds,
    searchQuery, setSearchQuery, unreadCount, savedCount, updateInfo, checkUpdates,
    redditSort, handleRedditSortChange
  ]);

  return (
    <RssContext.Provider value={value}>
      {children}
    </RssContext.Provider>
  );
};

export const useRss = () => {
  const context = useContext(RssContext);
  if (!context) {
    throw new Error("useRss must be used within an RssProvider");
  }
  return context;
};