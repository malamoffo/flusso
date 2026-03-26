import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Feed, Article, Settings } from '../types';
import { storage, defaultSettings } from '../services/storage';

interface RssContextType {
  feeds: Feed[];
  articles: Article[];
  settings: Settings;
  isLoading: boolean;
  progress: { current: number; total: number; status?: string } | null;
  error: string | null;
  addFeed: (url: string) => Promise<void>;
  importOpml: (file: File) => Promise<void>;
  toggleRead: (articleId: string) => Promise<void>;
  markAsRead: (articleId: string) => Promise<void>;
  markArticlesAsRead: (articleIds: string[]) => Promise<void>;
  toggleFavorite: (articleId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshFeeds: (currentFeeds?: Feed[], currentArticles?: Article[]) => Promise<void>;
  removeFeed: (feedId: string) => Promise<void>;
  updateFeed: (feedId: string, updates: Partial<Feed>) => Promise<void>;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
  exportFeeds: () => Promise<string>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  unreadCount: number;
}

const RssContext = createContext<RssContextType | undefined>(undefined);

import { App as CapacitorApp } from '@capacitor/app';

export function RssProvider({ children }: { children: React.ReactNode }) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState<{ current: number; total: number; status?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const lastRefreshRef = React.useRef<number>(Date.now());

  useEffect(() => {
    let mounted = true;
    loadData().then((data) => {
      if (mounted && data && data.loadedFeeds.length > 0) {
        refreshFeeds(data.loadedFeeds, data.loadedArticles);
      }
    });

    // Handle background to foreground transitions
    const stateListener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        // If it's been more than 15 minutes since last refresh, refresh again
        const now = Date.now();
        if (now - lastRefreshRef.current > 15 * 60 * 1000) {
          console.log('App resumed after 15+ mins, refreshing feeds...');
          refreshFeeds();
        }
      }
    });

    return () => { 
      mounted = false; 
      stateListener.then(l => l.remove());
    };
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
      return { loadedFeeds, loadedArticles };
    } catch (err) {
      setError('Failed to load data');
      console.error(err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = useCallback(async (newSettings: Partial<Settings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      storage.saveSettings(updated);
      return updated;
    });
  }, []);

  const addFeed = useCallback(async (url: string) => {
    try {
      setIsLoading(true);
      setError(null);
      await storage.addFeed(url);
      await loadData();
    } catch (err) {
      setError('Failed to add feed. Please check the URL.');
      console.error(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const importOpml = async (file: File) => {
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
          reader.readAsText(file);
        });
      }

      const urls = await storage.parseOpml(text);
      
      if (urls.length === 0) {
        setError('No valid feed URLs found in the OPML file.');
        return;
      }

      let successCount = 0;
      let failCount = 0;
      setProgress({ current: 0, total: urls.length, status: 'Starting import...' });
      
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
        
        if (i < urls.length - 1) {
          await new Promise(r => setTimeout(r, 100));
        }
      }
      
      await loadData();
      if (failCount > 0) {
        console.warn(`Import completed with warnings: ${successCount} feeds imported, ${failCount} failed.`);
      } else {
        setError(null);
      }
    } catch (err) {
      setError('Failed to parse OPML file.');
      console.error(err);
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  };

  const toggleRead = useCallback(async (articleId: string) => {
    setArticles(prev => {
      const updatedArticles = prev.map(a => 
        a.id === articleId ? { ...a, isRead: !a.isRead, readAt: !a.isRead ? Date.now() : undefined } : a
      );
      storage.saveArticles(updatedArticles);
      return updatedArticles;
    });
  }, []);

  const markArticlesAsRead = useCallback(async (articleIds: string[]) => {
    const idsToUpdate = new Set(articleIds);
    const now = Date.now();
    
    setArticles(prev => {
      let changed = false;
      const updatedArticles = prev.map(a => {
        if (idsToUpdate.has(a.id) && !a.isRead) {
          changed = true;
          return { ...a, isRead: true, readAt: now };
        }
        return a;
      });

      if (changed) {
        storage.saveArticles(updatedArticles);
        return updatedArticles;
      }
      return prev;
    });
  }, []);

  const markAsRead = useCallback(async (articleId: string) => {
    await markArticlesAsRead([articleId]);
  }, [markArticlesAsRead]);

  const markAllAsRead = useCallback(async () => {
    const now = Date.now();
    setArticles(prev => {
      const updatedArticles = prev.map(a => ({ ...a, isRead: true, readAt: a.isRead ? a.readAt : now }));
      storage.saveArticles(updatedArticles);
      return updatedArticles;
    });
  }, []);

  const toggleFavorite = useCallback(async (articleId: string) => {
    setArticles(prev => {
      const updatedArticles = prev.map(a => 
        a.id === articleId ? { ...a, isFavorite: !a.isFavorite } : a
      );
      storage.saveArticles(updatedArticles);
      return updatedArticles;
    });
  }, []);

  const removeFeed = useCallback(async (feedId: string) => {
    setFeeds(prev => {
      const updatedFeeds = prev.filter(f => f.id !== feedId);
      storage.saveFeeds(updatedFeeds);
      return updatedFeeds;
    });
    setArticles(prev => {
      const updatedArticles = prev.filter(a => a.feedId !== feedId);
      storage.saveArticles(updatedArticles);
      return updatedArticles;
    });
  }, []);

  const updateFeed = useCallback(async (feedId: string, updates: Partial<Feed>) => {
    setFeeds(prev => {
      const updatedFeeds = prev.map(f => f.id === feedId ? { ...f, ...updates } : f);
      storage.saveFeeds(updatedFeeds);
      return updatedFeeds;
    });
  }, []);

  const exportFeeds = useCallback(async () => {
    return await storage.exportOpml();
  }, []);

  const refreshFeeds = useCallback(async (currentFeeds?: Feed[], currentArticles?: Article[]) => {
    try {
      setIsLoading(true);
      const feedsToUse = currentFeeds || await storage.getFeeds();
      const articlesToUse = currentArticles || await storage.getArticles();
      
      if (feedsToUse.length === 0) {
        setIsLoading(false);
        return;
      }
      
      setProgress({ current: 0, total: feedsToUse.length });
      
      const FEED_TIMEOUT = 90000; // 90 seconds max per feed
      const CONCURRENCY_LIMIT = 15;

      const successfulResults: { feed: Feed; articles: Article[] }[] = [];
      let completed = 0;
      
      // Use a sliding window for concurrency
      const pool = [...feedsToUse];
      const workers = Array(Math.min(CONCURRENCY_LIMIT, pool.length)).fill(null).map(async () => {
        while (pool.length > 0) {
          const feed = pool.shift();
          if (!feed) break;
          
          try {
            const latestArticle = articlesToUse
              .filter(a => a.feedId === feed.id)
              .sort((a, b) => b.pubDate - a.pubDate)[0];
            
            const fetchPromise = storage.fetchFeedData(feed.feedUrl, latestArticle?.pubDate);
            
            let timeoutId: any;
            const timeoutPromise = new Promise((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error('Feed fetch timeout')), FEED_TIMEOUT);
            });

            // Prevent unhandled rejection
            timeoutPromise.catch(() => {});

            const data = await Promise.race([fetchPromise, timeoutPromise]) as { feed: Feed; articles: Article[] };
            clearTimeout(timeoutId);
            
            if (data) successfulResults.push(data);
          } catch (error) {
            console.error(`Failed to refresh feed ${feed.feedUrl}`, error);
          } finally {
            completed++;
            setProgress(prev => prev ? { ...prev, current: completed } : { current: completed, total: feedsToUse.length });
          }
        }
      });

      await Promise.all(workers);
      
      if (successfulResults.length > 0) {
        setProgress(prev => prev ? { ...prev, status: 'Saving articles...' } : null);
        await storage.saveAllFeedData(successfulResults);
      }
      
      setProgress(prev => prev ? { ...prev, status: 'Finalizing...' } : null);
      await loadData();
      lastRefreshRef.current = Date.now();
    } catch (err) {
      setError('Failed to refresh feeds');
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  }, []);

  const unreadCount = articles.filter(a => !a.isRead).length;

  return (
    <RssContext.Provider value={{
      feeds, articles, settings, isLoading, progress, error,
      addFeed, importOpml, toggleRead, markAsRead, markArticlesAsRead, toggleFavorite, markAllAsRead, refreshFeeds, removeFeed, updateFeed, updateSettings,
      exportFeeds, searchQuery, setSearchQuery, unreadCount
    }}>
      {children}
    </RssContext.Provider>
  );
}

export const useRss = () => {
  const context = useContext(RssContext);
  if (context === undefined) {
    throw new Error('useRss must be used within a RssProvider');
  }
  return context;
};
