import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { db } from '../services/db';
import { rssService } from '../services/rssService';
import { Feed, Article, Settings, Subreddit, RedditPost } from '../types';
import { storage, defaultSettings } from '../services/storage';
import { useSettings } from './SettingsContext';
import { useReddit } from './RedditContext';
import packageJson from '../../package.json';
import { Capacitor } from '@capacitor/core';
import { BackgroundPlugin } from '../plugins/BackgroundPlugin';
import DataWorker from '../workers/dataProcessor.worker.ts?worker';
import { contentFetcher } from '../utils/contentFetcher';

interface ProgressInfo {
  current: number;
  total: number;
  status?: string;
  bytesDownloaded?: number;
}

interface RssContextType {
  feeds: Feed[];
  articles: Article[];
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
  hasMoreArticles: boolean;
  loadMoreArticles: () => Promise<void>;
  updateInfo: any | null;
  addFeedOrSubreddit: (url: string) => Promise<'article' | 'podcast' | 'reddit' | 'subreddit' | 'telegram' | void>;
  importOpml: (file: File | { text: () => Promise<string> }, append?: boolean) => Promise<void>;
  exportFeeds: (types?: ('article' | 'podcast')[]) => Promise<string>;
  removeFeed: (id: string) => void;
  refreshFeeds: (feedsToRefresh?: Feed[]) => Promise<void>;
  toggleRead: (id: string) => void;
  markAsRead: (id: string) => void;
  markArticlesAsRead: (ids: string[]) => void;
  markAllAsRead: () => void;
  toggleFavorite: (id: string) => void;
  toggleQueue: (id: string) => void;
  removeFromSaved: (id: string) => void;
  removeArticle: (article: Article) => Promise<void>;
  addArticle: (article: Article) => Promise<void>;
  updateFeed: (id: string, updates: Partial<Feed>) => void;
  updateArticle: (id: string, updates: Partial<Article>) => void;
  checkUpdates: (force?: boolean) => Promise<void>;
  globalSearch: (query: string) => { articles: Article[], redditPosts: RedditPost[] };
}

const RssContext = createContext<RssContextType | undefined>(undefined);

export const RssProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const { settings } = useSettings();
  const { subreddits, redditPosts, refreshReddit } = useReddit();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorLogs, setErrorLogs] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [hasMoreArticles, setHasMoreArticles] = useState<boolean>(true);
  
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [savedCount, setSavedCount] = useState<number>(0);

  // Update counts asynchronously from the database to include items outside the RAM window
  const updateCounts = useCallback(async () => {
    // Get all unread articles from DB
    const allUnread = await db.articles.filter(a => !a.isRead).toArray();
    
    // Filter out saved podcasts
    const unread = allUnread.filter(a => !(a.type === 'podcast' && a.isFavorite)).length;
    
    const saved = await storage.getSavedCount();
    const reddit = await db.redditPosts.filter(p => !!p.isFavorite).count();
    
    setUnreadCount(unread);
    setSavedCount(saved + reddit);
  }, []);

  useEffect(() => {
    updateCounts();
  }, [articles, redditPosts, updateCounts]);

  const articleOffset = useRef<number>(0);
  const PAGE_SIZE = 50;
  
  const articlesRef = useRef<Article[]>([]);
  const feedsRef = useRef<Feed[]>([]);
  const redditPostsRef = useRef<RedditPost[]>([]);

  useEffect(() => {
    articlesRef.current = articles;
    feedsRef.current = feeds;
    redditPostsRef.current = redditPosts;
  }, [articles, feeds, redditPosts]);

  const logError = useCallback((msg: string) => {
    setErrorLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  }, []);

  const clearErrorLogs = useCallback(() => {
    setErrorLogs([]);
  }, []);
  const [updateInfo, setUpdateInfo] = useState<any | null>(null);
  const lastRefresh = useRef(Date.now());
  const isRefreshing = useRef(false);
  const worker = useRef<Worker | undefined>(undefined);

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

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const loadedFeeds = await storage.getFeeds();
      
      // Cleanup old articles based on retention settings, throttled to once per day
      const lastCleanupTime = parseInt((await storage.get('lastCleanupTime')) || '0', 10);
      const ONE_DAY = 24 * 60 * 60 * 1000;
      if (Date.now() - lastCleanupTime > ONE_DAY) {
        await storage.cleanUpOldArticles(settings.articleRetentionDays, settings.podcastRetentionDays);
        await storage.set('lastCleanupTime', Date.now().toString());
      }

      const [loadedArticles, favorites] = await Promise.all([
        storage.getArticles(0, PAGE_SIZE),
        storage.getFavorites()
      ]);
      
      const allArticles = [...loadedArticles];
      favorites.forEach(fav => {
        if (!allArticles.find(a => a.id === fav.id)) {
          allArticles.push(fav);
        }
      });
      
      setFeeds(loadedFeeds);
      setArticles(allArticles);
      articleOffset.current = loadedArticles.length;
      setHasMoreArticles(loadedArticles.length === PAGE_SIZE);
      
      return { 
        loadedFeeds, 
        loadedArticles
      };
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [settings.articleRetentionDays, settings.podcastRetentionDays]);

  const loadMoreArticles = useCallback(async () => {
    if (!hasMoreArticles || isLoading) return;
    
    try {
      const moreArticles = await storage.getArticles(articleOffset.current, PAGE_SIZE);
      if (moreArticles.length > 0) {
        setArticles(prev => {
          const existingIds = new Set(prev.map(a => a.id));
          const newArticles = moreArticles.filter(a => !existingIds.has(a.id));
          return [...prev, ...newArticles];
        });
        articleOffset.current += moreArticles.length;
      }
      setHasMoreArticles(moreArticles.length === PAGE_SIZE);
    } catch (err) {
      console.error('Failed to load more articles:', err);
    }
  }, [hasMoreArticles, isLoading]);

  const refreshFeeds = useCallback(async (feedsToRefresh?: Feed[]) => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    try {
      const fToRefresh = feedsToRefresh || await storage.getFeeds();
      
      if (!worker.current) {
        throw new Error('Worker not initialized');
      }

      const { finalArticles, finalFeeds } = await rssService.refreshFeeds(
        fToRefresh,
        worker.current,
        setProgress,
        setFeeds,
        setArticles,
        setIsLoading
      );

      // Save final state to storage, merging with existing DB state to preserve flags
      const existingArticlesMap = new Map((await db.articles.toArray()).map(a => [a.id, a]));
      const articlesToSave = finalArticles.map(newArt => {
        const existing = existingArticlesMap.get(newArt.id);
        if (existing) {
          // Preserve critical flags
          return {
            ...newArt,
            isFavorite: existing.isFavorite,
            isQueued: existing.isQueued,
            // Keep read status if already read, otherwise use new status
            isRead: existing.isRead || newArt.isRead,
            readAt: existing.isRead ? existing.readAt : newArt.readAt
          };
        }
        return newArt;
      });
      await storage.saveArticles(articlesToSave);
      
      // Update local state to match DB
      setArticles(prev => {
        const newArticlesMap = new Map(articlesToSave.map(a => [a.id, a]));
        return prev.map(a => newArticlesMap.has(a.id) ? newArticlesMap.get(a.id)! : a);
      });
      
      // Fetch latest feeds from storage to avoid overwriting newly added ones
      const currentFeedsInStorage = await storage.getFeeds();
      const updatedFeeds = currentFeedsInStorage.map(f => {
        const refreshed = finalFeeds.find(r => r.id === f.id);
        if (refreshed) {
          return refreshed;
        }
        return f;
      });
      await storage.saveFeeds(updatedFeeds);
      setFeeds(updatedFeeds);
      feedsRef.current = updatedFeeds;
      
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
    if (Capacitor.isNativePlatform()) {
      if (feeds.length > 0 && settings.autoCheckUpdates && settings.refreshInterval > 0) {
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
  }, [feeds, settings.refreshInterval, settings.autoCheckUpdates]);

  // Web-based auto refresh
  useEffect(() => {
    if (!settings.autoCheckUpdates || settings.refreshInterval <= 0 || Capacitor.isNativePlatform()) return;
    
    const interval = setInterval(() => {
      refreshFeeds();
    }, settings.refreshInterval * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [settings.autoCheckUpdates, settings.refreshInterval, refreshFeeds]);

  // Listen for app-resume to trigger refresh if needed
  useEffect(() => {
    const handleResume = () => {
      const now = Date.now();
      const elapsedMinutes = (now - lastRefresh.current) / (1000 * 60);
      
      // Force refresh if more than half of the interval has passed on resume
      // or if we just want to be reactive.
      if (settings.autoCheckUpdates && settings.refreshInterval > 0) {
        if (elapsedMinutes >= settings.refreshInterval) {
          refreshFeeds();
        }
      }
      
      // Also check for app updates every time we resume
      checkUpdates();
    };

    window.addEventListener('app-resume', handleResume);
    return () => window.removeEventListener('app-resume', handleResume);
  }, [settings.autoCheckUpdates, settings.refreshInterval, refreshFeeds, checkUpdates]);

  const addFeedOrSubreddit = useCallback(async (url: string): Promise<'article' | 'podcast' | 'reddit' | 'subreddit' | 'telegram' | void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const cleanUrl = url.trim();
      const lowerUrl = cleanUrl.toLowerCase();
      
      // 1. Check if it's a subreddit
      if (lowerUrl.startsWith('r/') || lowerUrl.includes('reddit.com/r/')) {
        const existing = subreddits.find(s => s.name.toLowerCase() === cleanUrl.toLowerCase());
        if (existing) {
          throw new Error("Sei già iscritto a questo subreddit.");
        }
        const result = await storage.addSubreddit(cleanUrl);
        if (!result) {
          throw new Error("Impossibile trovare il subreddit. Controlla il nome.");
        }
        await refreshReddit([result]);
        await loadData();
        return 'subreddit';
      } 
      
      // 2. Check if it's an RSS feed (starts with http/https)
      if (lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://')) {
        // Force type to 'article' as requested (podcasts are added via search)
        const result = await storage.addFeed(cleanUrl, 'article');
        if (!result) {
          throw new Error("Impossibile caricare il feed. Controlla l'URL.");
        }
        await loadData();
        try {
          const parsedFeedUrl = new URL(result.feed.feedUrl);
          const host = parsedFeedUrl.hostname.toLowerCase();
          if (host === 'reddit.com' || host.endsWith('.reddit.com')) {
            return 'reddit';
          }
        } catch {
          // If feedUrl is not a valid absolute URL, fall back to article classification.
        }       
        return 'article';
      }

      // 3. Otherwise, treat as Telegram channel
      try {
        // We need to access addTelegramChannel from TelegramContext
        // But RssContext doesn't have it directly. 
        // However, the user wants this logic in the "add" flow.
        // I will return a special type and let the caller handle it if needed,
        // but better to implement it here if possible or in the Modal.
        // Actually, RssContext is where addFeedOrSubreddit lives.
        // I'll assume the caller of addFeedOrSubreddit in AddFeedModal will handle the 'telegram' return.
        return 'telegram';
      } catch (tgErr: any) {
        throw new Error(tgErr.message || "Impossibile aggiungere il canale Telegram. Verifica il nome.");
      }
    } catch (err: any) {
      const errMsg = err.message || "Errore durante l'aggiunta. Riprova.";
      setError(errMsg);
      logError(errMsg);
      console.error(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [refreshReddit, subreddits, loadData, logError]);

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
            failCount++;
          }
        } catch (e) {
          console.error(`Failed to import ${url}`, e);
          failCount++;
        }
        setProgress({ current: i + 1, total: urls.length, status: `Imported ${i + 1}/${urls.length}` });
      }
      
      await loadData();
      setError(null);
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
      const article = updated.find(a => a.id === id);
      if (article) {
        storage.saveArticles([article]); // Save only the changed article
      }
      return updated;
    });
  }, []);

  const markArticlesAsRead = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    const now = Date.now();
    setArticles(prev => {
      let changedCount = 0;
      const updated = prev.map(a => {
        if (idSet.has(a.id) && !a.isRead) {
          changedCount++;
          return { ...a, isRead: true, readAt: now };
        }
        return a;
      });
      if (changedCount > 0) {
        const changedArticles = updated.filter(a => idSet.has(a.id));
        storage.saveArticles(changedArticles);
      }
      return changedCount > 0 ? updated : prev;
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
    // For "Mark all as read", we should update the DB directly for all articles
    // and then update the local state
    await storage.markAllArticlesAsRead();
    setArticles(prev => prev.map(a => ({ ...a, isRead: true, readAt: a.isRead ? a.readAt : now })));
  }, []);

  const globalSearch = useCallback((query: string) => {
    const lowerQuery = query.toLowerCase();
    const foundArticles = articlesRef.current.filter(a => 
      a.title.toLowerCase().includes(lowerQuery) || 
      (a.contentSnippet?.toLowerCase().includes(lowerQuery) ?? false) ||
      (a.content?.toLowerCase().includes(lowerQuery) ?? false)
    );
    
    const foundRedditPosts = redditPostsRef.current.filter(p => 
      p.title.toLowerCase().includes(lowerQuery) || 
      (p.selftextHtml?.toLowerCase().includes(lowerQuery) ?? false)
    );
    
    return { articles: foundArticles, redditPosts: foundRedditPosts };
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    // Update DB first
    const article = await db.articles.get(id);
    if (article) {
      const updatedArticle = { ...article, isFavorite: !article.isFavorite };
      await storage.saveArticles([updatedArticle]);
      
      // Update local state if present
      setArticles(prev => prev.map(a => a.id === id ? updatedArticle : a));
    }
  }, []);

  const toggleQueue = useCallback(async (id: string) => {
    const article = await db.articles.get(id);
    if (article) {
      const updatedArticle = { ...article, isQueued: !article.isQueued };
      await storage.saveArticles([updatedArticle]);
      
      setArticles(prev => prev.map(a => a.id === id ? updatedArticle : a));
    }
  }, []);

  const removeFromSaved = useCallback(async (id: string) => {
    const article = await db.articles.get(id);
    if (article) {
      const updatedArticle = { ...article, isFavorite: false, isQueued: false };
      await storage.saveArticles([updatedArticle]);
      
      setArticles(prev => prev.map(a => a.id === id ? updatedArticle : a));
    }
  }, []);

  const updateArticle = useCallback(async (id: string, updates: Partial<Article>) => {
    const article = await db.articles.get(id);
    if (article) {
      const updatedArticle = { ...article, ...updates };
      await storage.saveArticles([updatedArticle]);
      
      setArticles(prev => prev.map(a => a.id === id ? updatedArticle : a));
    }
  }, []);

  const removeArticle = useCallback(async (article: Article) => {
    setArticles(prev => prev.filter(a => a.id !== article.id));
    await storage.deleteArticle(article.id);
    
    if (article.type === 'podcast') {
      let updatedFeed: Feed | undefined;
      setFeeds(prev => {
        const updated = prev.map(f => {
          if (f.id === article.feedId) {
            updatedFeed = {
              ...f,
              lastArticleDate: Math.max(f.lastArticleDate || 0, article.pubDate)
            };
            return updatedFeed;
          }
          return f;
        });
        return updated;
      });
      if (updatedFeed) {
        await storage.saveFeeds([updatedFeed]);
      }
    }
  }, []);

  const addArticle = useCallback(async (article: Article) => {
    setArticles(prev => [...prev, article].sort((a,b) => b.pubDate - a.pubDate));
    await storage.saveArticles([article]);
  }, []);

  const removeFeed = useCallback(async (id: string) => {
    await storage.removeFeed(id);
    setFeeds(prev => prev.filter(f => f.id !== id));
    setArticles(prev => prev.filter(a => a.feedId !== id));
  }, []);

  const updateFeed = useCallback(async (id: string, updates: Partial<Feed>) => {
    let updatedFeed: Feed | undefined;
    setFeeds(prev => {
      const updated = prev.map(f => {
        if (f.id === id) {
          updatedFeed = { ...f, ...updates };
          return updatedFeed;
        }
        return f;
      });
      return updated;
    });
    if (updatedFeed) {
      await storage.saveFeeds([updatedFeed]);
    }
  }, []);

  const exportFeeds = useCallback(async (types?: ('article' | 'podcast')[]) => {
    return await storage.exportOpml(types);
  }, []);


  const prefetch = useCallback(async (article: Article) => {
    if (article.type === 'article' && !article.content) {
      contentFetcher.enqueue(article.id, article.link);
    }
  }, []);

  const value = useMemo(() => ({
    feeds, articles, isLoading, progress, error, setError, errorLogs, clearErrorLogs,
    addFeedOrSubreddit, importOpml, toggleRead, markAsRead, markArticlesAsRead,
    toggleFavorite, toggleQueue, removeFromSaved, markAllAsRead, refreshFeeds, removeFeed,
    removeArticle, addArticle,
    updateFeed, updateArticle, exportFeeds,
    searchQuery, setSearchQuery, unreadCount, savedCount, hasMoreArticles, loadMoreArticles, updateInfo, checkUpdates,
    globalSearch, prefetch
  }), [
    feeds, articles, isLoading, progress, error, setError, errorLogs, clearErrorLogs,
    addFeedOrSubreddit, importOpml, toggleRead, markAsRead, markArticlesAsRead,
    toggleFavorite, toggleQueue, removeFromSaved, markAllAsRead, refreshFeeds, removeFeed,
    removeArticle, addArticle,
    updateFeed, updateArticle, exportFeeds,
    searchQuery, setSearchQuery, unreadCount, savedCount, hasMoreArticles, loadMoreArticles, updateInfo, checkUpdates,
    globalSearch, prefetch
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