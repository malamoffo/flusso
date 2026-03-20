import React, { createContext, useContext, useEffect, useState } from 'react';
import { Feed, Article, Settings } from '../types';
import { storage, defaultSettings } from '../services/storage';

interface RssContextType {
  feeds: Feed[];
  articles: Article[];
  settings: Settings;
  isLoading: boolean;
  progress: { current: number; total: number } | null;
  error: string | null;
  addFeed: (url: string) => Promise<void>;
  importOpml: (file: File) => Promise<void>;
  toggleRead: (articleId: string) => Promise<void>;
  toggleFavorite: (articleId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshFeeds: () => Promise<void>;
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
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (settings.refreshInterval > 0) {
      const intervalId = setInterval(() => {
        refreshFeeds();
      }, settings.refreshInterval * 60 * 1000);
      return () => clearInterval(intervalId);
    }
  }, [settings.refreshInterval, feeds.length]); // Re-run if interval changes or feeds change

  const loadData = async () => {
    try {
      setIsLoading(true);
      const loadedFeeds = await storage.getFeeds();
      const loadedArticles = await storage.getArticles();
      const loadedSettings = await storage.getSettings();
      setFeeds(loadedFeeds);
      setArticles(loadedArticles.sort((a, b) => b.pubDate - a.pubDate));
      setSettings(loadedSettings);
    } catch (err) {
      setError('Failed to load data');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    await storage.saveSettings(updated);
  };

  const addFeed = async (url: string) => {
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
  };

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
      setProgress({ current: 0, total: urls.length });
      
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
          await storage.addFeed(url);
          successCount++;
        } catch (e) {
          console.error(`Failed to import ${url}`, e);
          failCount++;
        }
        setProgress({ current: i + 1, total: urls.length });
        
        // Small delay to avoid slamming the server and potential rate limits
        if (i < urls.length - 1) {
          await new Promise(r => setTimeout(r, 100));
        }
      }
      
      await loadData();
      if (failCount > 0) {
        setError(`Import completed with warnings: ${successCount} feeds imported, ${failCount} failed.`);
      } else {
        setError(null); // Clear error if all succeeded
      }
    } catch (err) {
      setError('Failed to parse OPML file.');
      console.error(err);
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  };

  const toggleRead = async (articleId: string) => {
    const updatedArticles = articles.map(a => 
      a.id === articleId ? { ...a, isRead: !a.isRead, readAt: !a.isRead ? Date.now() : undefined } : a
    );
    setArticles(updatedArticles);
    await storage.saveArticles(updatedArticles);
  };

  const markAllAsRead = async () => {
    const now = Date.now();
    const updatedArticles = articles.map(a => ({ ...a, isRead: true, readAt: a.isRead ? a.readAt : now }));
    setArticles(updatedArticles);
    await storage.saveArticles(updatedArticles);
  };

  const toggleFavorite = async (articleId: string) => {
    const updatedArticles = articles.map(a => 
      a.id === articleId ? { ...a, isFavorite: !a.isFavorite } : a
    );
    setArticles(updatedArticles);
    await storage.saveArticles(updatedArticles);
  };

  const removeFeed = async (feedId: string) => {
    const updatedFeeds = feeds.filter(f => f.id !== feedId);
    const updatedArticles = articles.filter(a => a.feedId !== feedId);
    setFeeds(updatedFeeds);
    setArticles(updatedArticles);
    await storage.saveFeeds(updatedFeeds);
    await storage.saveArticles(updatedArticles);
  };

  const updateFeed = async (feedId: string, updates: Partial<Feed>) => {
    const updatedFeeds = feeds.map(f => f.id === feedId ? { ...f, ...updates } : f);
    setFeeds(updatedFeeds);
    await storage.saveFeeds(updatedFeeds);
  };

  const refreshFeeds = async () => {
    try {
      setIsLoading(true);
      const currentFeeds = await storage.getFeeds();
      const currentArticles = await storage.getArticles();
      setProgress({ current: 0, total: currentFeeds.length });
      
      const feedResults = await Promise.allSettled(currentFeeds.map(async (feed) => {
        const latestArticle = currentArticles
          .filter(a => a.feedId === feed.id)
          .sort((a, b) => b.pubDate - a.pubDate)[0];
        
        const data = await storage.fetchFeedData(feed.feedUrl, latestArticle?.pubDate);
        await storage.saveFeedData(data.feed, data.articles);
        return data;
      }));

      let completed = 0;
      for (const result of feedResults) {
        if (result.status === 'rejected') {
          console.error('Failed to refresh feed', result.reason);
        }
        completed++;
        setProgress({ current: completed, total: currentFeeds.length });
      }
      
      await loadData();
    } catch (err) {
      setError('Failed to refresh feeds');
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  };

  return (
    <RssContext.Provider value={{
      feeds, articles, settings, isLoading, progress, error,
      addFeed, importOpml, toggleRead, toggleFavorite, markAllAsRead, refreshFeeds, removeFeed, updateFeed, updateSettings,
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
