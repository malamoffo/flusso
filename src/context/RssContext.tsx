import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { Feed, Article, Settings, Subreddit, RedditPost } from '../types';
import { storage, defaultSettings } from '../services/storage';
import packageJson from '../../package.json';
import { Capacitor } from '@capacitor/core';
import { BackgroundPlugin } from '../plugins/BackgroundPlugin';

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
  settings: Settings;
  isLoading: boolean;
  progress: ProgressInfo | null;
  error: string | null;
  errorLogs: string[];
  clearErrorLogs: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  unreadCount: number;
  savedCount: number;
  updateInfo: any | null;
  addFeedOrSubreddit: (url: string) => Promise<void>;
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
  const [redditSort, setRedditSort] = useState<'new' | 'hot' | 'top'>('new');
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorLogs, setErrorLogs] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");

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
      const loadedArticles = await storage.getArticles();
      const loadedSubreddits = await storage.getSubreddits();
      logError(`Loaded subreddits: ${loadedSubreddits.length}`);
      const loadedRedditPosts = await storage.getRedditPosts();
      const loadedSettings = await storage.getSettings();
      
      setFeeds(loadedFeeds);
      setArticles(loadedArticles.sort((a, b) => b.pubDate - a.pubDate));
      setSubreddits(loadedSubreddits);
      setRedditPosts(loadedRedditPosts.sort((a, b) => b.createdUtc - a.createdUtc));
      setSettings(loadedSettings);
      
      return { loadedFeeds, loadedArticles, loadedSubreddits, loadedRedditPosts, loadedSettings };
    } catch (err) {
      logError("Failed to load data");
      console.error(err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    loadData().then(data => {
      if (mounted && data) {
        const promises = [];
        if (data.loadedFeeds.length > 0) {
          promises.push(refreshFeeds(data.loadedFeeds, data.loadedArticles));
        }
        if (data.loadedSubreddits && data.loadedSubreddits.length > 0) {
          promises.push(refreshReddit(data.loadedSubreddits, data.loadedRedditPosts));
        }
        Promise.all(promises).catch(console.error);
      }
    });
    return () => { mounted = false; };
  }, []);

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

  const addFeedOrSubreddit = useCallback(async (url: string) => {
    try {
      setIsLoading(true);
      
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
      } else {
        const result = await storage.addFeed(url);
        if (!result) {
          throw new Error("Could not fetch feed. Please check the URL and try again.");
        }
      }
      await loadData();
    } catch (err) {
      logError("Failed to add feed or subreddit. Please check the URL.");
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

  const refreshFeeds = useCallback(async (feedsToRefresh?: Feed[], currentArticles?: Article[]) => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    try {
      setIsLoading(true);

      const fToRefresh = feedsToRefresh || await storage.getFeeds();
      const cArticles = currentArticles || await storage.getArticles();
      
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
      
      const allNewArticles: Article[] = [];
      
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
                  
                  allNewArticles.push(...articlesWithCorrectId);
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
      
      if (allNewArticles.length > 0) {
        setArticles(prev => {
          const merged = [...prev];
          const existingLinks = new Set(merged.map(a => a.link));
          let hasNew = false;
          
          for (const newArticle of allNewArticles) {
            // Check for duplicate link using Set for O(1) lookup
            if (!existingLinks.has(newArticle.link)) {
              hasNew = true;
              existingLinks.add(newArticle.link);
              
              // Ottimizzazione: se è più recente del primo, inserisci in testa
              if (merged.length === 0 || newArticle.pubDate >= merged[0].pubDate) {
                merged.unshift(newArticle);
                continue;
              }

              // Ricerca Binaria per trovare la posizione corretta (O(log n))
              // Partendo dal "più recente" (inizio lista) in modo efficiente
              let low = 0;
              let high = merged.length;
              while (low < high) {
                const mid = (low + high) >>> 1;
                if (merged[mid].pubDate > newArticle.pubDate) {
                  low = mid + 1;
                } else {
                  high = mid;
                }
              }
              merged.splice(low, 0, newArticle);
            }
          }
          
          return hasNew ? merged : prev;
        });
      }
      
      if (results.length > 0) {
        setProgress(p => p ? { ...p, status: "Saving articles..." } : null);
        const { updatedFeeds } = await storage.saveAllFeedData(results, fToRefresh, cArticles);
        
        setFeeds(updatedFeeds);
      }
      
      setProgress(p => p ? { ...p, status: "Finalizing..." } : null);
      lastRefresh.current = Date.now();
    } catch (e) {
      logError("Failed to refresh feeds");
    } finally {
      setIsLoading(false);
      setProgress(null);
      isRefreshing.current = false;
    }
  }, []);

  const refreshReddit = useCallback(async (subsToRefresh?: Subreddit[], currentPosts?: RedditPost[], sort?: 'new' | 'hot' | 'top') => {
    logError(`refreshReddit called, subs: ${subsToRefresh?.length || 'undefined'}`);
    if (isRefreshingReddit.current) {
        console.warn('[RSS] Already refreshing reddit');
        return;
    }
    isRefreshingReddit.current = true;
    try {
      setIsLoading(true);
      const sToRefresh = subsToRefresh || subreddits;
      const cPosts = currentPosts !== undefined ? currentPosts : redditPosts;

      if (sToRefresh.length === 0) {
        console.warn('[RSS] No subreddits to refresh');
        setIsLoading(false);
        isRefreshingReddit.current = false;
        return;
      }

      const currentSort = sort || redditSort;
      const results: RedditPost[] = [];
      // For 'new' sort, we only want recent posts. For 'top' or 'hot', we want what Reddit gives us.
      const sinceDate = currentSort === 'new' ? Date.now() - (3 * 24 * 60 * 60 * 1000) : undefined;

      // Fetch sequentially or in parallel (parallel is fine for Reddit JSON)
      await Promise.all(sToRefresh.map(async (sub) => {
        try {
          const posts = await storage.fetchSubredditPosts(sub.name, sinceDate, undefined, currentSort);
          results.push(...posts);
          
          // Update lastFetched
          setSubreddits(prev => {
            const updated = prev.map(s => s.id === sub.id ? { ...s, lastFetched: Date.now() } : s);
            storage.saveSubreddits(updated);
            return updated;
          });
        } catch (e) {
          console.error(`Failed to refresh subreddit ${sub.name}`, e);
        }
      }));

      setRedditPosts(prev => {
        // If sort is provided, it's a sort change, so we should replace existing posts
        const base = sort ? [] : prev;
        const merged = [...base];
        const existingIds = new Set(merged.map(p => p.id));
        let hasNew = false;

        for (const newPost of results) {
          if (!existingIds.has(newPost.id)) {
            hasNew = true;
            existingIds.add(newPost.id);
            merged.push(newPost);
          }
        }

        if (hasNew || sort) {
          if (currentSort === 'new') {
            merged.sort((a, b) => b.createdUtc - a.createdUtc);
          } else {
            merged.sort((a, b) => (b.score || 0) - (a.score || 0));
          }
          storage.saveRedditPosts(merged);
          return merged;
        }
        return prev;
      });
    } catch (e) {
      console.error("Failed to refresh reddit", e);
    } finally {
      setIsLoading(false);
      isRefreshingReddit.current = false;
    }
  }, [subreddits, redditPosts, redditSort]);

  const loadMoreReddit = useCallback(async () => {
    try {
      setIsLoading(true);
      const sToRefresh = await storage.getSubreddits();
      const cPosts = await storage.getRedditPosts();

      if (sToRefresh.length === 0) return;

      const results: RedditPost[] = [];

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
          results.push(...posts);
        } catch (e) {
          console.error(`Failed to load more for subreddit ${sub.name}`, e);
        }
      }));

      if (results.length > 0) {
        setRedditPosts(prev => {
          const merged = [...prev];
          const existingIds = new Set(merged.map(p => p.id));
          let hasNew = false;

          for (const newPost of results) {
            if (!existingIds.has(newPost.id)) {
              hasNew = true;
              existingIds.add(newPost.id);
              merged.push(newPost);
            }
          }

          if (hasNew) {
            if (redditSort === 'new') {
              merged.sort((a, b) => b.createdUtc - a.createdUtc);
            } else {
              merged.sort((a, b) => (b.score || 0) - (a.score || 0));
            }
            storage.saveRedditPosts(merged);
            return merged;
          }
          return prev;
        });
      }
    } catch (e) {
      console.error("Failed to load more reddit posts", e);
    } finally {
      setIsLoading(false);
    }
  }, [redditSort]);

  const handleRedditSortChange = useCallback(async (sort: 'new' | 'hot' | 'top') => {
    setRedditSort(sort);
    // Clear current posts to show fresh sorted ones
    setRedditPosts([]);
    await refreshReddit(undefined, [], sort);
  }, [refreshReddit]);

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
    feeds, articles, subreddits, redditPosts, settings, isLoading, progress, error, errorLogs, clearErrorLogs,
    addFeedOrSubreddit, importOpml, toggleRead, markAsRead, markArticlesAsRead,
    toggleFavorite, toggleQueue, removeFromSaved, markAllAsRead, refreshFeeds, refreshReddit, loadMoreReddit, removeFeed, removeSubreddit,
    updateFeed, updateArticle, updateRedditPost, toggleRedditRead, markRedditAsRead, toggleRedditFavorite, updateSettings, exportFeeds,
    searchQuery, setSearchQuery, unreadCount, savedCount, updateInfo, checkUpdates,
    redditSort, handleRedditSortChange
  }), [
    feeds, articles, subreddits, redditPosts, settings, isLoading, progress, error, errorLogs, clearErrorLogs,
    addFeedOrSubreddit, importOpml, toggleRead, markAsRead, markArticlesAsRead,
    toggleFavorite, toggleQueue, removeFromSaved, markAllAsRead, refreshFeeds, refreshReddit, loadMoreReddit, removeFeed, removeSubreddit,
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