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
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const RssContext = createContext<RssContextType | undefined>(undefined);

export function RssProvider({ children }: { children: React.ReactNode }) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState<{ current: number; total: number; status?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let mounted = true;
    loadData().then((data) => {
      if (mounted && data && data.loadedFeeds.length > 0) {
        refreshFeeds(data.loadedFeeds, data.loadedArticles);
      }
    });
    return () => { mounted = false; };
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
      
      let completed = 0;
      const FEED_TIMEOUT = 25000; // 25 seconds max per feed

      const feedResults = await Promise.allSettled(feedsToUse.map(async (feed) => {
        try {
          const latestArticle = articlesToUse
            .filter(a => a.feedId === feed.id)
            .sort((a, b) => b.pubDate - a.pubDate)[0];
          
          // Add a timeout to the individual feed fetch
          const fetchPromise = storage.fetchFeedData(feed.feedUrl, latestArticle?.pubDate);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Feed fetch timeout')), FEED_TIMEOUT)
          );

          const data = await Promise.race([fetchPromise, timeoutPromise]) as { feed: Feed; articles: Article[] };
          
          completed++;
          setProgress(prev => prev ? { ...prev, current: completed } : { current: completed, total: feedsToUse.length });
          
          return data;
        } catch (error) {
          completed++;
          setProgress(prev => prev ? { ...prev, current: completed } : { current: completed, total: feedsToUse.length });
          throw error;
        }
      }));

      const successfulResults: { feed: Feed; articles: Article[] }[] = [];
      for (const result of feedResults) {
        if (result.status === 'fulfilled') {
          successfulResults.push(result.value);
        } else {
          console.error('Failed to refresh feed', result.reason);
        }
      }
      
      if (successfulResults.length > 0) {
        setProgress(prev => prev ? { ...prev, status: 'Saving articles...' } : null);
        await storage.saveAllFeedData(successfulResults);
      }
      
      setProgress(prev => prev ? { ...prev, status: 'Finalizing...' } : null);
      await loadData();
    } catch (err) {
      setError('Failed to refresh feeds');
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  }, []);

  return (
    <RssContext.Provider value={{
      feeds, articles, settings, isLoading, progress, error,
      addFeed, importOpml, toggleRead, markAsRead, markArticlesAsRead, toggleFavorite, markAllAsRead, refreshFeeds, removeFeed, updateFeed, updateSettings,
      searchQuery, setSearchQuery
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
