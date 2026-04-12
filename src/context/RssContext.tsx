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
  hasMoreArticles: boolean;
  loadMoreArticles: () => Promise<void>;
  updateInfo: any | null;
  addFeedOrSubreddit: (url: string) => Promise<'article' | 'podcast' | 'reddit' | 'subreddit' | 'telegram' | void>;
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
  markTelegramChannelAsRead: (id: string) => void;
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
  addTelegramChannel: (username: string) => Promise<void>;
  removeTelegramChannel: (id: string) => Promise<void>;
  refreshTelegramChannels: (channelsToRefresh?: TelegramChannel[]) => Promise<void>;
  loadTelegramMessages: (channelId: string) => Promise<void>;
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
  const [hasMoreArticles, setHasMoreArticles] = useState<boolean>(true);
  const articleOffset = useRef<number>(0);
  const PAGE_SIZE = 30;
  
  const articlesRef = useRef<Article[]>([]);
  const feedsRef = useRef<Feed[]>([]);
  const subredditsRef = useRef<Subreddit[]>([]);
  const redditPostsRef = useRef<RedditPost[]>([]);
  const telegramChannelsRef = useRef<TelegramChannel[]>([]);
  const telegramMessagesRef = useRef<Record<string, TelegramMessage[]>>({});

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    articlesRef.current = articles;
    feedsRef.current = feeds;
    subredditsRef.current = subreddits;
    redditPostsRef.current = redditPosts;
    telegramChannelsRef.current = telegramChannels;
    telegramMessagesRef.current = telegramMessages;
  }, [articles, feeds, subreddits, redditPosts, telegramChannels, telegramMessages]);

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
      const loadedTelegramChannels = await storage.getTelegramChannels();
      
      setFeeds(loadedFeeds);
      setArticles(loadedArticles);      
      setSubreddits(loadedSubreddits);
      setRedditPosts(loadedRedditPosts.sort((a, b) => b.createdUtc - a.createdUtc));
      setTelegramChannels(loadedTelegramChannels);
      setSettings(loadedSettings);
      
      return { 
        loadedFeeds, 
        loadedArticles, 
        loadedSubreddits, 
        loadedRedditPosts, 
        loadedSettings,
        loadedTelegramChannels
      };
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreArticles = useCallback(async () => {
    // This is now handled at the UI level in App.tsx for better performance
    // while keeping the full articles state for correct counts.
  }, []);

  const refreshFeeds = useCallback(async (feedsToRefresh?: Feed[], currentArticles?: Article[]) => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    try {
      setIsLoading(true);

      const fToRefresh = feedsToRefresh || await storage.getFeeds();
      const cArticles = currentArticles || await storage.getArticles(0, 0);
      
      // Update ref to ensure we have all articles for merging
      articlesRef.current = cArticles;
      
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
      const FEED_TIMEOUT = 12000; // Reduced from 15s to 12s
      const CONCURRENCY = Math.min(6, queue.length); // Reduced from 10 to 6 to prevent stalling
      
      let mergeChain = Promise.resolve();
      
      const workers = Array(CONCURRENCY).fill(null).map(async () => {
        while (true) {
          const feed = queue[queueIndex++];
          if (!feed) break;
          
          try {
            const latestArticleDate = latestArticleDateByFeedId.get(feed.id);
            const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
            const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
            const hardSinceDate = Date.now() - (feed.type === 'podcast' ? TWO_WEEKS : THREE_DAYS);
            const sinceDate = Math.max(latestArticleDate || feed.lastArticleDate || 0, hardSinceDate);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FEED_TIMEOUT);
            
            try {
              const data = await storage.fetchFeedData(feed.feedUrl, sinceDate, controller.signal);
              if (data) {
                const articlesWithCorrectId = (data.articles || []).map(a => ({ ...a, feedId: feed.id }));
                
                if (articlesWithCorrectId.length > 0) {
                  // Incremental merge during update as requested
                  await (mergeChain = mergeChain.then(async () => {
                    const { merged, hasNew } = await new Promise<{ merged: Article[], hasNew: boolean }>((resolve, reject) => {
                      const requestId = uuidv4();
                      const timeout = setTimeout(() => {
                        worker.current!.removeEventListener('message', handler);
                        reject(new Error('Worker timeout'));
                      }, 10000);

                      const handler = (e: MessageEvent) => {
                        if (e.data.type === 'mergedArticles' && e.data.requestId === requestId) {
                          clearTimeout(timeout);
                          worker.current!.removeEventListener('message', handler);
                          resolve(e.data);
                        }
                      };
                      worker.current!.addEventListener('message', handler);
                      worker.current!.postMessage({ 
                        type: 'mergeArticles', 
                        prev: articlesRef.current, 
                        incoming: articlesWithCorrectId, 
                        requestId 
                      });
                    }).catch(err => {
                      console.error('Merge failed:', err);
                      return { merged: articlesRef.current, hasNew: false };
                    });
                    
                    if (hasNew) {
                      setArticles(merged);
                      articlesRef.current = merged; // Immediate update for next merge in chain
                    }
                  }));
                }
                
                setFeeds(prev => {
                  const next = [...prev];
                  const idx = next.findIndex(f => f.id === feed.id);
                  if (idx !== -1) {
                    const existingFeed = next[idx];
                    next[idx] = {
                      ...existingFeed,
                      ...data.feed,
                      title: existingFeed.title, // Preserve user-defined title
                      id: feed.id,
                      lastFetched: Date.now(),
                      lastArticleDate: articlesWithCorrectId.length > 0 ? Math.max(...articlesWithCorrectId.map(a => a.pubDate)) : feed.lastArticleDate,
                      lastRefreshStatus: 'success'
                    };
                  }
                  feedsRef.current = next; // Update ref synchronously
                  return next;
                });
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
            
            setFeeds(prev => {
              const next = [...prev];
              const idx = next.findIndex(f => f.id === feed.id);
              if (idx !== -1) {
                next[idx] = { ...next[idx], lastRefreshStatus: 'error' };
              }
              feedsRef.current = next; // Update ref synchronously
              return next;
            });
          } finally {
            completed++;
            setProgress(p => p ? { ...p, current: completed } : { current: completed, total: fToRefresh.length });
          }
        }
      });
      
      await Promise.all(workers);
      await mergeChain; // Ensure all merges are finished

      // Save final state to storage once at the end for performance
      await storage.saveArticles(articlesRef.current);
      // Fetch latest feeds from storage to avoid overwriting newly added ones
      const currentFeedsInStorage = await storage.getFeeds();
      const updatedFeeds = currentFeedsInStorage.map(f => {
        const refreshed = feedsRef.current.find(r => r.id === f.id);
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

      const queue = [...sToRefresh];
      let queueIndex = 0;
      const CONCURRENCY = Math.min(5, queue.length);
      
      let mergeChain = Promise.resolve();
      
      const workers = Array(CONCURRENCY).fill(null).map(async () => {
        while (true) {
          const sub = queue[queueIndex++];
          if (!sub) break;
          
          try {
            const posts = await storage.fetchSubredditPosts(sub.name, sinceDate, undefined, currentSort);
            if (posts.length > 0) {
              await (mergeChain = mergeChain.then(async () => {
                const { merged } = await new Promise<{ merged: RedditPost[] }>((resolve, reject) => {
                  const requestId = uuidv4();
                  const timeout = setTimeout(() => {
                    worker.current!.removeEventListener('message', handler);
                    reject(new Error('Worker timeout'));
                  }, 10000);

                  const handler = (e: MessageEvent) => {
                    if (e.data.type === 'mergedRedditPosts' && e.data.requestId === requestId) {
                      clearTimeout(timeout);
                      worker.current!.removeEventListener('message', handler);
                      resolve(e.data);
                    }
                  };
                  worker.current!.addEventListener('message', handler);
                  worker.current!.postMessage({ 
                    type: 'mergeRedditPosts', 
                    prev: redditPostsRef.current, 
                    incoming: posts, 
                    sort: currentSort, 
                    requestId 
                  });
                }).catch(err => {
                  console.error('Reddit merge failed:', err);
                  return { merged: redditPostsRef.current };
                });
                
                setRedditPosts(merged);
                redditPostsRef.current = merged;
              }));

              setSubreddits(prev => {
                const next = [...prev];
                const idx = next.findIndex(s => s.id === sub.id);
                if (idx !== -1) {
                  next[idx] = { ...sub, lastFetched: Date.now() };
                }
                subredditsRef.current = next; // Update ref synchronously to avoid race conditions
                return next;
              });
            }
          } catch (e) {
            console.error(`Failed to refresh subreddit ${sub.name}`, e);
          }
        }
      });

      await Promise.all(workers);
      await mergeChain;

      await storage.saveRedditPosts(redditPostsRef.current);
      
      // Fetch latest subreddits from storage to avoid overwriting newly added ones
      const currentSubsInStorage = await storage.getSubreddits();
      const updatedSubs = currentSubsInStorage.map(s => {
        const refreshed = sToRefresh.find(r => r.id === s.id);
        if (refreshed) {
          return { ...s, lastFetched: Date.now() };
        }
        return s;
      });
      await storage.saveSubreddits(updatedSubs);
      setSubreddits(updatedSubs);
      subredditsRef.current = updatedSubs;
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

  const addTelegramChannel = useCallback(async (username: string) => {
    try {
      setError(null);
      const cleanUsername = username.replace('@', '').replace('https://t.me/', '').split('/')[0].trim();
      
      const existing = telegramChannels.find(c => c.username.toLowerCase() === cleanUsername.toLowerCase());
      if (existing) {
        throw new Error("Sei già iscritto a questo canale Telegram.");
      }
      
      const [messages, info] = await Promise.all([
        fetchTelegramMessages(cleanUsername),
        fetchTelegramChannelInfo(cleanUsername)
      ]);
      
      const channel: TelegramChannel = {
        id: uuidv4(),
        name: info.name,
        username: cleanUsername,
        imageUrl: info.imageUrl,
        lastMessageDate: messages.length > 0 ? messages[messages.length - 1].date : Date.now(),
        lastChecked: Date.now(),
        unreadCount: messages.length,
        lastOpened: Date.now(),
        retentionDays: 30,
      };
      await storage.addTelegramChannel(channel);
      setTelegramChannels(prev => [...prev, channel]);
      setTelegramMessages(prev => ({ ...prev, [channel.id]: messages }));
      storage.saveTelegramMessages(channel.id, messages);
      return 'telegram';
    } catch (e: any) {
      const errMsg = e.message || "Canale Telegram non trovato o non accessibile";
      setError(errMsg);
      throw new Error(errMsg);
    }
  }, []);

  const addFeedOrSubreddit = useCallback(async (url: string): Promise<'article' | 'podcast' | 'reddit' | 'subreddit' | 'telegram' | void> => {
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
      } else if (!url.includes('://') && !url.includes('.') && !url.includes(' ')) {
        // If it's a single word without dots or protocol, it could be a subreddit or telegram
        // We'll try to detect if it's meant for telegram by checking if it's a common telegram username pattern
        // but for now let's assume if it doesn't start with r/ it might be telegram.
        // Actually, let's check if it's a telegram URL
        if (lowerName.includes('t.me/')) {
          await addTelegramChannel(cleanName);
          return 'telegram';
        }
      }

      if (isSubreddit) {
        const existing = subreddits.find(s => s.name.toLowerCase() === cleanName.toLowerCase());
        if (existing) {
          throw new Error("Sei già iscritto a questo subreddit.");
        }
        const result = await storage.addSubreddit(cleanName);
        if (!result) {
          throw new Error("Impossibile trovare il subreddit. Controlla il nome.");
        }
        await refreshReddit([result]);
        await loadData();
        return 'subreddit';
      } else if (!url.includes('://') && (lowerName.includes('t.me/') || (!lowerName.startsWith('r/') && !url.includes('.')))) {
        // Likely a telegram channel if no protocol and no dots (or explicit t.me)
        await addTelegramChannel(cleanName);
        return 'telegram';
      } else {
        const result = await storage.addFeed(url);
        if (!result) {
          throw new Error("Impossibile caricare il feed. Controlla l'URL.");
        }
        await loadData();
        if (result.feed.feedUrl.includes('reddit.com')) {
          return 'reddit';
        }
        return result.feed.type as 'article' | 'podcast';
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
  }, [addTelegramChannel, refreshReddit, loadData, logError]);

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

  const markTelegramChannelAsRead = useCallback(async (id: string) => {
    setTelegramChannels(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, unreadCount: 0 } : c);
      storage.saveTelegramChannels(updated);
      return updated;
    });
  }, []);

  const loadTelegramMessages = useCallback(async (channelId: string) => {
    // If already loaded or currently loading, skip
    if (telegramMessagesRef.current[channelId] !== undefined) return;
    
    // Mark as loading by setting an empty array temporarily if needed, 
    // but better to use a specific marker if we want to distinguish.
    // For now, we'll just fetch.
    const messages = await storage.getTelegramMessages(channelId);
    setTelegramMessages(prev => {
      const next = { ...prev, [channelId]: messages };
      telegramMessagesRef.current = next;
      return next;
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

  const exportFeeds = useCallback(async (types?: ('article' | 'podcast')[]) => {
    return await storage.exportOpml(types);
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
    
    const queue = [...channels];
    let queueIndex = 0;
    const CONCURRENCY = Math.min(3, queue.length);
    
    let mergeChain = Promise.resolve();
    
    const workers = Array(CONCURRENCY).fill(null).map(async () => {
      while (true) {
        const channel = queue[queueIndex++];
        if (!channel) break;
        
        try {
          const currentMessages = telegramMessagesRef.current[channel.id] || [];
          const sinceDate = currentMessages.length > 0 ? currentMessages[currentMessages.length - 1].date : undefined;

          const [messages, info] = await Promise.all([
            fetchTelegramMessages(channel.username, sinceDate),
            fetchTelegramChannelInfo(channel.username)
          ]);
          
          if (messages.length > 0) {
            await (mergeChain = mergeChain.then(async () => {
              const { merged } = await new Promise<{ merged: TelegramMessage[] }>((resolve, reject) => {
                const requestId = uuidv4();
                const timeout = setTimeout(() => {
                  worker.current!.removeEventListener('message', handler);
                  reject(new Error('Worker timeout'));
                }, 10000);

                const handler = (e: MessageEvent) => {
                  if (e.data.type === 'mergedTelegramMessages' && e.data.requestId === requestId) {
                    clearTimeout(timeout);
                    worker.current!.removeEventListener('message', handler);
                    resolve(e.data);
                  }
                };
                worker.current!.addEventListener('message', handler);
                worker.current!.postMessage({ 
                  type: 'mergeTelegramMessages', 
                  prev: telegramMessagesRef.current[channel.id] || [], 
                  incoming: messages,
                  requestId
                });
              }).catch(err => {
                console.error('Telegram merge failed:', err);
                return { merged: telegramMessagesRef.current[channel.id] || [] };
              });
              
              const cleaned = cleanupTelegramMessages(channel, merged);
              setTelegramMessages(prev => {
                const next = { ...prev, [channel.id]: cleaned };
                telegramMessagesRef.current = next;
                return next;
              });
              await storage.saveTelegramMessages(channel.id, cleaned);
            }));
          }

          setTelegramChannels(prev => {
            const next = [...prev];
            const idx = next.findIndex(c => c.id === channel.id);
            if (idx !== -1) {
              next[idx] = { 
                ...channel, 
                name: info.name, 
                imageUrl: info.imageUrl,
                lastChecked: Date.now(),
                lastMessageDate: messages.length > 0 ? messages[messages.length - 1].date : channel.lastMessageDate,
                unreadCount: (channel.unreadCount || 0) + messages.length
              };
            }
            return next;
          });
        } catch (e) {
          console.error(`Failed to refresh channel ${channel.name}`, e);
        }
      }
    });

    await Promise.all(workers);
    await mergeChain;
    await storage.saveTelegramChannels(telegramChannelsRef.current);
  }, [telegramChannels, telegramMessages, cleanupTelegramMessages]);

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
    toggleFavorite, toggleQueue, removeFromSaved, markAllAsRead, markAllTelegramAsRead, markTelegramChannelAsRead, refreshFeeds, refreshReddit, refreshTelegramChannels, loadMoreReddit, removeFeed, removeSubreddit,
    updateFeed, updateArticle, updateRedditPost, toggleRedditRead, markRedditAsRead, toggleRedditFavorite, updateSettings, exportFeeds,
    searchQuery, setSearchQuery, unreadCount, savedCount, hasMoreArticles, loadMoreArticles, updateInfo, checkUpdates,
    redditSort, handleRedditSortChange,
    loadTelegramMessages
  }), [
    feeds, articles, subreddits, redditPosts, telegramChannels, telegramMessages, settings, isLoading, progress, error, setError, errorLogs, clearErrorLogs,
    addFeedOrSubreddit, addTelegramChannel, removeTelegramChannel, importOpml, toggleRead, markAsRead, markArticlesAsRead,
    toggleFavorite, toggleQueue, removeFromSaved, markAllAsRead, markAllTelegramAsRead, markTelegramChannelAsRead, refreshFeeds, refreshReddit, refreshTelegramChannels, loadMoreReddit, removeFeed, removeSubreddit,
    updateFeed, updateArticle, updateRedditPost, toggleRedditRead, markRedditAsRead, toggleRedditFavorite, updateSettings, exportFeeds,
    searchQuery, setSearchQuery, unreadCount, savedCount, hasMoreArticles, loadMoreArticles, updateInfo, checkUpdates,
    redditSort, handleRedditSortChange,
    loadTelegramMessages
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