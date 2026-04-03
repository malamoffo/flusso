import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from 'react';
import { Feed, Article, Settings } from '../types';
import { storage, defaultSettings } from '../services/storage';
import packageJson from '../../package.json';
import { Capacitor } from '@capacitor/core';
import { BackgroundPlugin } from '../plugins/BackgroundPlugin';

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
  savedCount: number;
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
  removeFromSaved: (id: string) => void;
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
  const isRefreshing = useRef(false);

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

  const addFeed = useCallback(async (url: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await storage.addFeed(url);
      if (!result) {
        throw new Error("Could not fetch feed. Please check the URL and try again.");
      }
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
      
      const workers = Array(Math.min(6, queue.length)).fill(null).map(async () => {
        while (queueIndex < queue.length) {
          const feed = queue[queueIndex++];
          if (!feed) break;
          
          try {
            // Find the latest article date for this feed to only fetch newer articles
            const latestArticleDate = latestArticleDateByFeedId.get(feed.id);
            const sinceDate = latestArticleDate || feed.lastArticleDate;
            
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
                  
                  setArticles(prev => {
                    const merged = [...prev];
                    const existingLinks = new Set(merged.map(a => a.link));
                    let hasNew = false;
                    
                    for (let i = 0; i < articlesWithCorrectId.length; i++) {
                      const newArticle = articlesWithCorrectId[i];
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
      setError("Failed to refresh feeds");
    } finally {
      setIsLoading(false);
      setProgress(null);
      isRefreshing.current = false;
    }
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
    feeds, articles, settings, isLoading, progress, error,
    addFeed, importOpml, toggleRead, markAsRead, markArticlesAsRead,
    toggleFavorite, toggleQueue, removeFromSaved, markAllAsRead, refreshFeeds, removeFeed,
    updateFeed, updateArticle, updateSettings, exportFeeds,
    searchQuery, setSearchQuery, unreadCount, savedCount, updateInfo, checkUpdates
  }), [
    feeds, articles, settings, isLoading, progress, error,
    addFeed, importOpml, toggleRead, markAsRead, markArticlesAsRead,
    toggleFavorite, toggleQueue, removeFromSaved, markAllAsRead, refreshFeeds, removeFeed,
    updateFeed, updateArticle, updateSettings, exportFeeds,
    searchQuery, setSearchQuery, unreadCount, savedCount, updateInfo, checkUpdates
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