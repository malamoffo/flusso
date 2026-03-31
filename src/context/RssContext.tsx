import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { Feed, Article, Settings } from '../types';
import { storage, defaultSettings } from '../services/storage';

interface ProgressInfo {
  current: number;
  total: number;
  status?: string;
}

interface RssContextType {
  feeds: Feed[];
  articles: Article[];
  settings: Settings;
  isLoading: boolean;
  progress: ProgressInfo | null;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  unreadCount: number;
  updateInfo: any | null;
  addFeed: (url: string) => Promise<void>;
  importOpml: (file: File | { text: () => Promise<string> }) => Promise<void>;
  exportFeeds: () => Promise<string>;
  removeFeed: (id: string) => void;
  refreshFeeds: (feedsToRefresh?: Feed[], currentArticles?: Article[]) => Promise<void>;
  toggleRead: (id: string) => void;
  markAsRead: (id: string) => void;
  markArticlesAsRead: (ids: string[]) => void;
  markAllAsRead: () => void;
  toggleFavorite: (id: string) => void;
  toggleQueue: (id: string) => void;
  updateFeed: (id: string, updates: Partial<Feed>) => void;
  updateArticle: (id: string, updates: Partial<Article>) => void;
  updateSettings: (updates: Partial<Settings>) => void;
  checkUpdates: (force?: boolean) => Promise<void>;
}

const RssContext = createContext<RssContextType | undefined>(undefined);

export const RssProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [updateInfo, setUpdateInfo] = useState<any | null>(null);
  const lastRefresh = useRef(Date.now());

  const checkUpdates = useCallback(async (force = false) => {
    // Mock update check
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const loadedFeeds = await storage.getFeeds();
      const loadedArticles = await storage.getArticles();
      const loadedSettings = await storage.getSettings();
      
      setFeeds(loadedFeeds);
      setArticles(loadedArticles.sort((a, b) => b.pubDate - a.pubDate));
      setSettings(loadedSettings);
      
      return { loadedFeeds, loadedArticles, loadedSettings };
    } catch (err) {
      setError("Failed to load data");
      console.error(err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    loadData().then(data => {
      if (mounted && data && data.loadedFeeds.length > 0) {
        refreshFeeds(data.loadedFeeds, data.loadedArticles);
      }
    });
    return () => { mounted = false; };
  }, []);

  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      storage.saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const addFeed = useCallback(async (url: string) => {
    try {
      setIsLoading(true);
      setError(null);
      await storage.addFeed(url);
      await loadData();
    } catch (err) {
      setError("Failed to add feed. Please check the URL.");
      console.error(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
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
        setError("No valid feed URLs found in the OPML file.");
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
          await storage.addFeed(url);
          successCount++;
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
      setError("Failed to parse OPML file.");
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

  const markAsRead = useCallback(async (id: string) => {
    await markArticlesAsRead([id]);
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

  const updateArticle = useCallback(async (id: string, updates: Partial<Article>) => {
    setArticles(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, ...updates } : a);
      storage.saveArticles(updated);
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
    try {
      setIsLoading(true);
      const fToRefresh = feedsToRefresh || await storage.getFeeds();
      const cArticles = currentArticles || await storage.getArticles();
      
      if (fToRefresh.length === 0) {
        setIsLoading(false);
        return;
      }
      
      setProgress({ current: 0, total: fToRefresh.length });
      const results: { feed: Feed; articles: Article[] }[] = [];
      let completed = 0;
      
      const queue = [...fToRefresh];
      const workers = Array(Math.min(5, queue.length)).fill(null).map(async () => {
        while (queue.length > 0) {
          const feed = queue.shift();
          if (!feed) break;
          try {
            // Find the latest article date for this feed to only fetch newer articles
            const latestArticle = cArticles
              .filter(a => a.feedId === feed.id)
              .sort((a, b) => b.pubDate - a.pubDate)[0];
            
            // Use the feed's lastArticleDate if no articles are present (e.g. after cleanup)
            // to avoid re-fetching articles that were already deleted.
            const sinceDate = latestArticle?.pubDate || feed.lastArticleDate;
            
            const data = await storage.fetchFeedData(feed.feedUrl, sinceDate);
            if (data) results.push(data);
          } catch (e) {
            console.error(`Failed to refresh feed ${feed.feedUrl}`, e);
          } finally {
            completed++;
            setProgress(p => p ? { ...p, current: completed } : { current: completed, total: fToRefresh.length });
          }
        }
      });
      
      await Promise.all(workers);
      
      if (results.length > 0) {
        setProgress(p => p ? { ...p, status: "Saving articles..." } : null);
        await storage.saveAllFeedData(results);
      }
      
      setProgress(p => p ? { ...p, status: "Finalizing..." } : null);
      await loadData();
      lastRefresh.current = Date.now();
    } catch (e) {
      setError("Failed to refresh feeds");
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  }, []);

  const unreadCount = useMemo(() => articles.filter(a => !a.isRead).length, [articles]);

  const value = useMemo(() => ({
    feeds, articles, settings, isLoading, progress, error,
    addFeed, importOpml, toggleRead, markAsRead, markArticlesAsRead,
    toggleFavorite, toggleQueue, markAllAsRead, refreshFeeds, removeFeed,
    updateFeed, updateArticle, updateSettings, exportFeeds,
    searchQuery, setSearchQuery, unreadCount, updateInfo, checkUpdates
  }), [
    feeds, articles, settings, isLoading, progress, error,
    addFeed, importOpml, toggleRead, markAsRead, markArticlesAsRead,
    toggleFavorite, toggleQueue, markAllAsRead, refreshFeeds, removeFeed,
    updateFeed, updateArticle, updateSettings, exportFeeds,
    searchQuery, setSearchQuery, unreadCount, updateInfo, checkUpdates
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