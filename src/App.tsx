import React, { useState, useEffect, useRef, useCallback, useMemo, memo, useDeferredValue, RefObject } from 'react';
import { useRss } from './context/RssContext';
import { useTelegram } from './context/TelegramContext';
import { useSettings } from './context/SettingsContext';
import { useReddit } from './context/RedditContext';
import { useAudioState } from './context/AudioPlayerContext.tsx';
import { useAudioStore } from './store/audioStore';
import { useFeedFiltering } from './hooks/useFeedFiltering';
import { usePagination } from './hooks/usePagination';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { FeedList } from './components/App/FeedList';
import { SwipeableArticleItem } from './components/SwipeableArticleItem';
import { SwipeableRedditPost } from './components/SwipeableRedditPost';
import { ArticleReader } from './components/ArticleReader';
import { SettingsModal } from './components/SettingsModal';
import { storage } from './services/storage';
import { PersistentPlayer } from './components/PersistentPlayer';
import { HeaderWidgets } from './components/HeaderWidgets';
import { RedditListView } from './components/RedditListView';
import { RedditPostReader } from './components/RedditPostReader';
import { TelegramListView } from './components/TelegramListView';
import { TelegramThreadView } from './components/TelegramThreadView';
import { TelegramChannel, TelegramMessage } from './types';
import { ImageViewer } from './components/ImageViewer';
import { ErrorNotification } from './components/ErrorNotification';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { Loader2, Search, X, Check, Rss, Settings, Star, CheckCircle2, RefreshCw, Layers, Headphones, FileText, Inbox, MessageSquare, ChevronDown, Flame } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { cn } from './lib/utils';
import { Article, Feed } from './types';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const PAGE_SIZE = 30;

const ProgressBanner = memo(() => {
  const { progress } = useRss();
  if (!progress) return null;
  
  const mbDownloaded = progress.bytesDownloaded ? (progress.bytesDownloaded / (1024 * 1024)).toFixed(2) : '0.00';
  
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2 text-sm text-blue-800 dark:text-blue-300 flex items-center justify-between border-t border-blue-100 dark:border-blue-900/30">
      <span>Updating feeds...</span>
      <div className="flex items-center gap-3">
        {progress.bytesDownloaded !== undefined && (
          <span className="text-xs opacity-75">{mbDownloaded} MB</span>
        )}
        <span className="font-medium">{progress.current} / {progress.total}</span>
      </div>
    </div>
  );
});


export default function App() {
  const inboxScrollRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef<HTMLDivElement>(null);
  const redditScrollRef = useRef<HTMLDivElement>(null);
  const inboxBottomRef = useRef<HTMLDivElement>(null);
  const savedBottomRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const isAtTop = useRef(true);

  const {
    articles, feeds, isLoading, error, setError,
    refreshFeeds, toggleRead, markAsRead, markArticlesAsRead,
    markAllAsRead, searchQuery, setSearchQuery, unreadCount, savedCount,
    toggleFavorite, toggleQueue, removeFromSaved, removeArticle, addArticle
  } = useRss();

  const {
    telegramChannels, telegramMessages, refreshTelegramChannels,
    markAllTelegramAsRead, markTelegramChannelAsRead, loadTelegramMessages,
    loadMoreTelegramMessages, enforceRetention: enforceTelegramRetention
  } = useTelegram();

  const { settings } = useSettings();

  const {
    isLoading: isRedditLoading,
    subreddits, redditPosts, redditSort, handleRedditSortChange,
    refreshReddit, loadMoreReddit, markRedditAsRead, toggleRedditRead, toggleRedditFavorite,
    redditUnreadCount, markAllRedditAsRead, enforceRetention: enforceRedditRetention
  } = useReddit();

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const sortedSubreddits = useMemo(() => 
    [...subreddits].sort((a, b) => a.name.localeCompare(b.name)),
    [subreddits]
  );
  
  const sortedFeeds = useMemo(() => 
    [...feeds].sort((a, b) => a.title.localeCompare(b.title)),
    [feeds]
  );

  const currentTrack = useAudioStore(state => state.currentTrack);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedRedditPost, setSelectedRedditPost] = useState<any | null>(null);
  const [selectedTelegramChannel, setSelectedTelegramChannel] = useState<TelegramChannel | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [undoPodcastRemoval, setUndoPodcastRemoval] = useState<{ article: Article, feed: Feed } | null>(null);
  
  useEffect(() => {
    if (undoPodcastRemoval) {
      const timer = setTimeout(() => {
        setUndoPodcastRemoval(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [undoPodcastRemoval]);

  const removePodcastAndSetUndo = async (article: Article) => {
    const feed = feeds.find(f => f.id === article.feedId);
    if (feed) {
      setUndoPodcastRemoval({ article, feed });
      await removeArticle(article);
    }
  };
  
  const handleUndoPodcastRemoval = async () => {
    if (undoPodcastRemoval) {
      await addArticle(undoPodcastRemoval.article);
      setUndoPodcastRemoval(null);
    }
  };
  
  const [settingsTab, setSettingsTab] = useState<'main' | 'subscriptions' | 'about' | 'general' | undefined>(undefined);
  const [isMarkAllReadOpen, setIsMarkAllReadOpen] = useState(false);
  const [temporarilyVisibleUnreadIds, setTemporarilyVisibleUnreadIds] = useState<Set<string>>(new Set());
  const [visibleInboxArticleIds, setVisibleInboxArticleIds] = useState<Set<string>>(new Set());
  const visibleInboxArticleIdsRef = useRef<Set<string>>(new Set());
  
  const handleVisibilityChange = useCallback((id: string, isVisible: boolean) => {
    setVisibleInboxArticleIds(prev => {
      const next = new Set(prev);
      if (isVisible) next.add(id);
      else next.delete(id);
      visibleInboxArticleIdsRef.current = next; // Sync the ref
      return next;
    });
  }, []);
  
  const [filter, setFilter] = useState<'inbox' | 'saved' | 'reddit' | 'telegram'>('inbox');
  const scrollPositions = useRef<Record<string, number>>({});
  const activeSectionRef = useRef<React.RefObject<HTMLDivElement> | null>(null);

  useEffect(() => {
    // Save current scroll position before filter changes
    if (activeSectionRef.current?.current) {
      scrollPositions.current[filter] = activeSectionRef.current.current.scrollTop;
    }
  }, [filter]);

  useEffect(() => {
    // Restore scroll position after filter changes
    if (activeSectionRef.current?.current) {
      activeSectionRef.current.current.scrollTop = scrollPositions.current[filter] || 0;
    }
  }, [filter]);

  const getActiveScrollRef = useCallback(() => {
    switch (filter) {
      case 'inbox': return inboxScrollRef;
      case 'saved': return savedScrollRef;
      case 'reddit': return redditScrollRef;
      default: return null;
    }
  }, [filter]);

  useEffect(() => {
    activeSectionRef.current = getActiveScrollRef() as any;
  }, [filter, getActiveScrollRef]);
  
  const [inboxTypeFilter, setInboxTypeFilter] = useState<'all' | 'article' | 'podcast'>('all');
  const [inboxUnreadOnly, setInboxUnreadOnly] = useState(false);
  const [savedTypeFilter, setSavedTypeFilter] = useState<'all' | 'article' | 'podcast'>('all');
  const [savedUnreadOnly, setSavedUnreadOnly] = useState(false);
  const [telegramFilter, setTelegramFilter] = useState<'all' | 'unread'>('all');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');

  const filteredRedditPosts = useMemo(() => {
    const query = deferredSearchQuery.toLowerCase();
    const filtered = redditPosts.filter(post => {
      if (query) {
        const matchesQuery = post.title.toLowerCase().includes(query) || 
                            (post.subredditName?.toLowerCase().includes(query) ?? false) ||
                            (post.selftextHtml?.toLowerCase().includes(query) ?? false);
        if (!matchesQuery) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (redditSort === 'new') return b.createdUtc - a.createdUtc;
      // Hot and Top are both score based in this simple implementation, 
      // but Reddit API handles trending/hot specifically.
      if (redditSort === 'hot' || redditSort === 'top') return b.score - a.score;
      return b.createdUtc - a.createdUtc;
    });
  }, [redditPosts, deferredSearchQuery, redditSort]);

  const sortedTelegramChannels = useMemo(() => {
    const query = deferredSearchQuery.toLowerCase();
    return [...telegramChannels]
      .sort((a, b) => (b.lastMessageDate || 0) - (a.lastMessageDate || 0))
      .filter(channel => {
        if (query) {
          const matchesQuery = channel.name.toLowerCase().includes(query) || 
                              (channel.username?.toLowerCase().includes(query) ?? false);
          if (!matchesQuery) return false;
        }
        return true;
      });
  }, [telegramChannels, deferredSearchQuery]);
  
  useEffect(() => {
    resetPagination();
  }, [filter, deferredSearchQuery, inboxUnreadOnly, savedUnreadOnly, inboxTypeFilter, savedTypeFilter, sourceFilter, timeFilter]);

  useEffect(() => {
    if (filter === 'reddit' && subreddits.length > 0) {
      refreshReddit();
    } else if (filter === 'telegram' && telegramChannels.length > 0) {
      refreshTelegramChannels();
    }
  }, [filter]);

  useEffect(() => {
    if (selectedTelegramChannel) {
      const channelMessages = telegramMessages[selectedTelegramChannel.id];
      if (!channelMessages || channelMessages.length === 0) {
        refreshTelegramChannels([selectedTelegramChannel]);
      }
    }
  }, [selectedTelegramChannel?.id, telegramMessages]);

  const {
    pullProgressTransform,
    pullOpacity,
    isPulling,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  } = usePullToRefresh({
    onRefresh: refreshFeeds,
    isLoading,
    isDisabled: isSettingsOpen || filter === 'reddit' || filter === 'telegram' || filter === 'saved',
    scrollRefs: {
      inbox: inboxScrollRef as RefObject<HTMLDivElement>,
      saved: savedScrollRef as RefObject<HTMLDivElement>,
      reddit: redditScrollRef as RefObject<HTMLDivElement>
    },
    activeScrollRefKey: filter
  });

  useEffect(() => {
    setSourceFilter('all');
    setTimeFilter('all');

    // Clean up readers and enforce retention when switching tabs
    if (selectedRedditPost) {
      setSelectedRedditPost(null);
      enforceRedditRetention();
    }
    if (selectedTelegramChannel) {
      setSelectedTelegramChannel(null);
      enforceTelegramRetention();
    }
    if (selectedArticle) {
      setSelectedArticle(null);
    }

    // Reset temporary visibility when changing tabs
    setTemporarilyVisibleUnreadIds(new Set());
  }, [filter]);

  const handleFilterChange = (newFilter: 'inbox' | 'saved' | 'reddit' | 'telegram') => {
    if (newFilter === filter) return;
    
    // Batch updates
    setFilter(newFilter);
  };

  const handleTypeFilterChange = (newType: 'unread' | 'article' | 'podcast') => {
    if (filter === 'inbox') {
      if (newType === 'unread') {
        const nextValue = !inboxUnreadOnly;
        setInboxUnreadOnly(nextValue);
        // Clear temporary visibility when explicitly disabling the unread filter
        if (!nextValue) {
          setTemporarilyVisibleUnreadIds(new Set());
        }
      } else {
        const nextType = inboxTypeFilter === newType ? 'all' : newType;
        setInboxTypeFilter(nextType);
      }
      if (inboxScrollRef.current) inboxScrollRef.current.scrollTop = 0;
    } else {
      if (newType === 'unread') {
        setSavedUnreadOnly(!savedUnreadOnly);
      } else {
        const nextType = savedTypeFilter === newType ? 'all' : newType;
        setSavedTypeFilter(nextType);
      }
      if (savedScrollRef.current) savedScrollRef.current.scrollTop = 0;
    }
    isAtTop.current = true;
  };

  useEffect(() => {
    if (selectedArticle) {
      const updated = articles.find(a => a.id === selectedArticle.id);
      if (updated && updated !== selectedArticle) {
        setSelectedArticle(updated);
      }
    }
  }, [articles, selectedArticle]);

  useEffect(() => {
    if (isSearchOpen || searchQuery || sourceFilter !== 'all' || timeFilter !== 'all') {
      if (inboxScrollRef.current) inboxScrollRef.current.scrollTop = 0;
      if (savedScrollRef.current) savedScrollRef.current.scrollTop = 0;
      isAtTop.current = true;
    }
  }, [isSearchOpen, searchQuery, sourceFilter, timeFilter]);

  useEffect(() => {
    const handleBackButton = async ({ canGoBack }: any) => {
      if (selectedTelegramChannel) {
        setSelectedTelegramChannel(null);
        enforceTelegramRetention();
      } else if (selectedArticle) {
        setSelectedArticle(null);
      } else if (selectedRedditPost) {
        setSelectedRedditPost(null);
        enforceRedditRetention();
      } else if (selectedTelegramChannel) {
        setSelectedTelegramChannel(null);
        enforceTelegramRetention();
      } else if (isSettingsOpen) {
        setIsSettingsOpen(false);
        setSettingsTab(undefined);
        handleFilterChange('inbox');
        setSearchQuery('');
        setIsSearchOpen(false);
      } else if (isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery('');
        setSourceFilter('all');
        setTimeFilter('all');
      } else if (filter !== 'inbox') {
        handleFilterChange('inbox');
      } else {
        CapacitorApp.exitApp();
      }
    };
    
    let listener: any;
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform()) {
      CapacitorApp.addListener('backButton', handleBackButton).then(l => {
        listener = l;
      });
    }
    
    return () => {
      if (listener) listener.remove();
    };
  }, [selectedArticle, selectedRedditPost, selectedTelegramChannel, isSettingsOpen, isSearchOpen, filter, sourceFilter, timeFilter, setSearchQuery, enforceTelegramRetention, enforceRedditRetention]);

  const markAsReadWithPersistence = useCallback((id: string) => {
    markAsRead(id);
    if (filter === 'inbox' && inboxUnreadOnly) {
      setTemporarilyVisibleUnreadIds(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
  }, [markAsRead, filter, inboxUnreadOnly]);

  const markArticlesAsReadWithPersistence = useCallback((ids: string[]) => {
    markArticlesAsRead(ids);
    if (filter === 'inbox' && inboxUnreadOnly) {
      setTemporarilyVisibleUnreadIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.add(id));
        return next;
      });
    }
  }, [markArticlesAsRead, filter, inboxUnreadOnly]);

  const { inboxArticles, savedArticles } = useFeedFiltering({
    articles,
    inboxTypeFilter,
    inboxUnreadOnly,
    savedTypeFilter,
    savedUnreadOnly,
    deferredSearchQuery,
    sourceFilter,
    timeFilter,
    isSearchOpen,
    temporarilyVisibleUnreadIds
  });

  const { visibleCount, loadMore: loadMoreArticles, hasMore: hasMoreArticles, reset: resetPagination } = usePagination(filter === 'inbox' ? inboxArticles.length : savedArticles.length);

  /**
   * ⚡ Bolt: Optimize article navigation by pre-calculating the active list and current index.
   * This avoids repeated O(N) findIndex calls on every render and navigation event.
   */
  const activeArticles = useMemo(() => (filter === 'inbox' ? inboxArticles : savedArticles), [filter, inboxArticles, savedArticles]);
  
  const visibleArticles = useMemo(() => activeArticles.slice(0, visibleCount), [activeArticles, visibleCount]);

  const activeIndex = useMemo(() => {
    if (!selectedArticle) return -1;
    return activeArticles.findIndex(a => a.id === selectedArticle.id);
  }, [selectedArticle, activeArticles]);


  const inboxArticlesRef = useRef(inboxArticles);
  useEffect(() => { inboxArticlesRef.current = inboxArticles; }, [inboxArticles]);

  const savedArticlesRef = useRef(savedArticles);
  useEffect(() => { savedArticlesRef.current = savedArticles; }, [savedArticles]);

  const inboxTimerRef = useRef<NodeJS.Timeout | null>(null);
  const savedTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle marking as read when scrolling to bottom
  useEffect(() => {
    const inboxContainer = inboxScrollRef.current;
    if (!inboxContainer) return;
    
    const checkAtBottom = () => {
      if (filter !== 'inbox') {
        if (inboxTimerRef.current) {
          clearTimeout(inboxTimerRef.current);
          inboxTimerRef.current = null;
        }
        return;
      }

      const isAtBottom = inboxContainer.scrollHeight - inboxContainer.scrollTop <= inboxContainer.clientHeight + 50;
      const allVisible = !hasMoreArticles;

      if (isAtBottom && allVisible) {
        const hasUnread = inboxArticlesRef.current.some(a => !a.isRead);
        if (hasUnread && !inboxTimerRef.current) {
          inboxTimerRef.current = setTimeout(() => {
            const toMark = inboxArticlesRef.current.filter(a => !a.isRead && visibleInboxArticleIdsRef.current.has(a.id)).map(a => a.id);
            if (toMark.length > 0) {
              markArticlesAsReadWithPersistence(toMark);
            }
            inboxTimerRef.current = null;
          }, 5000);
        }
      } else {
        if (inboxTimerRef.current) {
          clearTimeout(inboxTimerRef.current);
          inboxTimerRef.current = null;
        }
      }
    };
    
    inboxContainer.addEventListener('scroll', checkAtBottom);
    // Also check immediately in case the list is already at the bottom
    checkAtBottom();
    
    return () => {
      inboxContainer.removeEventListener('scroll', checkAtBottom);
      if (inboxTimerRef.current) clearTimeout(inboxTimerRef.current);
    };
  }, [filter, hasMoreArticles, markArticlesAsRead]);

  useEffect(() => {
    const handleBackButton = async () => {
      if (selectedTelegramChannel) {
        setSelectedTelegramChannel(null);
        return true;
      }
      return false;
    };

    const setupListener = async () => {
      const listener = await CapacitorApp.addListener('backButton', handleBackButton);
      return listener;
    };
    
    let listener: any;
    setupListener().then(l => listener = l);
    
    return () => {
      if (listener) listener.remove();
    };
  }, [selectedTelegramChannel]);

  useEffect(() => {
    const savedContainer = savedScrollRef.current;
    if (!savedContainer) return;
    
    const checkAtBottom = () => {
      if (filter !== 'saved') {
        if (savedTimerRef.current) {
          clearTimeout(savedTimerRef.current);
          savedTimerRef.current = null;
        }
        return;
      }

      const isAtBottom = savedContainer.scrollHeight - savedContainer.scrollTop <= savedContainer.clientHeight + 50;
      const allVisible = !hasMoreArticles;

      if (isAtBottom && allVisible) {
        const hasUnread = savedArticlesRef.current.some(a => !a.isRead);
        if (hasUnread && !savedTimerRef.current) {
          savedTimerRef.current = setTimeout(() => {
            const toMark = savedArticlesRef.current.filter(a => !a.isRead).map(a => a.id);
            if (toMark.length > 0) {
              markArticlesAsRead(toMark);
            }
            savedTimerRef.current = null;
          }, 5000);
        }
      } else {
        if (savedTimerRef.current) {
          clearTimeout(savedTimerRef.current);
          savedTimerRef.current = null;
        }
      }
    };
    
    savedContainer.addEventListener('scroll', checkAtBottom);
    // Also check immediately in case the list is already at the bottom
    checkAtBottom();
    
    return () => {
      savedContainer.removeEventListener('scroll', checkAtBottom);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, [filter, hasMoreArticles, markArticlesAsRead]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>, filterType: 'inbox' | 'saved' | 'reddit') => {
    const container = e.currentTarget;
    isAtTop.current = container.scrollTop <= 0;

    // Throttle the bottom check
    requestAnimationFrame(() => {
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
      const allVisible = !hasMoreArticles;

      if (isAtBottom && allVisible) {
        const articlesRef = filterType === 'inbox' ? inboxArticlesRef : savedArticlesRef;
        const timerRef = filterType === 'inbox' ? inboxTimerRef : savedTimerRef;

        const hasUnread = articlesRef.current.some(a => !a.isRead && (filterType !== 'inbox' || visibleInboxArticleIdsRef.current.has(a.id)));
        if (hasUnread && !timerRef.current) {
          timerRef.current = setTimeout(() => {
            const toMark = articlesRef.current.filter(a => !a.isRead && (filterType !== 'inbox' || visibleInboxArticleIdsRef.current.has(a.id))).map(a => a.id);
            if (toMark.length > 0) {
              markArticlesAsReadWithPersistence(toMark);
            }
            timerRef.current = null;
          }, 5000);
        }
      } else {
        const timerRef = filterType === 'inbox' ? inboxTimerRef : savedTimerRef;
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    });
  }, [hasMoreArticles, markArticlesAsRead, inboxUnreadOnly]);

  const handleArticleClick = useCallback((article: Article) => {
    setSelectedArticle(article);
    if (!article.isRead) {
      markAsReadWithPersistence(article.id);
    }
  }, [markAsReadWithPersistence]);

  const handleRemoveArticle = useCallback((id: string) => {
    const article = articles.find(a => a.id === id);
    if (article?.type === 'podcast') {
      removePodcastAndSetUndo(article);
    } else {
      removeFromSaved(id);
    }
  }, [articles, removePodcastAndSetUndo, removeFromSaved]);

  const feedsMap = useMemo(() => new Map(feeds.map(f => [f.id, f])), [feeds]);

  const scrollToTop = () => {
    let activeScrollRef;
    if (filter === 'inbox') activeScrollRef = inboxScrollRef;
    else if (filter === 'saved') activeScrollRef = savedScrollRef;
    else if (filter === 'reddit') activeScrollRef = redditScrollRef;

    if (activeScrollRef?.current) {
      activeScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      isAtTop.current = true;
    }
  };

  const themeColorRgb = useMemo(() => {
    const hex = settings.themeColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  }, [settings.themeColor]);

  return (
    <div 
      className="h-[100dvh] overflow-hidden flex flex-col transition-colors bg-black font-sans"
      style={{ 
        '--theme-color': settings.themeColor,
        '--theme-color-rgb': themeColorRgb
      } as React.CSSProperties}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {filter !== 'reddit' && filter !== 'telegram' && (
        <motion.div 
          className="absolute top-0 left-0 right-0 flex justify-center py-2 pointer-events-none z-30"
          style={{ y: pullProgressTransform, opacity: pullOpacity }}
        >
          <div className="bg-gray-900 rounded-full p-2 shadow-lg border border-gray-800">
            <RefreshCw className={cn("w-5 h-5 text-blue-500", isLoading ? "animate-spin" : "")} />
          </div>
        </motion.div>
      )}

      <div className="sticky top-0 z-20 shadow-sm transition-colors bg-black">
        <header className="px-4 py-3 flex items-center justify-between">
           <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={scrollToTop}
            className="flex items-center gap-3 active:opacity-70 transition-opacity focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg px-1 outline-none"
            aria-label="Scroll to top"
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner relative transition-colors" style={{ backgroundColor: filter === 'reddit' ? 'rgba(147, 51, 234, 0.1)' : filter === 'telegram' ? 'rgba(34, 197, 94, 0.1)' : filter === 'saved' ? 'rgba(234, 179, 8, 0.1)' : 'rgba(37, 99, 235, 0.1)' }}>
              <Rss className={cn("w-6 h-6 transition-colors", filter === 'reddit' ? "text-purple-600 dark:text-purple-400" : filter === 'telegram' ? "text-green-600 dark:text-green-400" : filter === 'saved' ? "text-yellow-600 dark:text-yellow-400" : "text-blue-600 dark:text-blue-400")} />
            </div>
            <div className="flex items-baseline gap-4">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">flusso</h1>
            </div>
          </motion.button>
          <div className="flex items-center gap-2">
            <HeaderWidgets />
            <button 
              onClick={() => setIsSearchOpen(true)}
              className={cn(
                "p-2 rounded-full transition-colors text-gray-600 dark:text-gray-300",
                filter === 'reddit' ? "hover:bg-purple-50 dark:hover:bg-purple-900/30" : "hover:bg-blue-50 dark:hover:bg-blue-900/30"
              )}
              aria-label="Open search"
            >
              <Search className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        {filter === 'reddit' && (
          <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => handleRedditSortChange('new')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                redditSort === 'new' ? "bg-purple-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              )}
            >
              New
            </button>
            <button
              onClick={() => handleRedditSortChange('hot')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                redditSort === 'hot' ? "bg-purple-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              )}
            >
              <Flame className="w-3.5 h-3.5" /> Trending
            </button>
          </div>
        )}

        {filter === 'telegram' && (
          <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setTelegramFilter(telegramFilter === 'unread' ? 'all' : 'unread')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                telegramFilter === 'unread' ? "bg-green-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              )}
            >
              {telegramFilter === 'unread' ? (
                <><Check className="w-3.5 h-3.5" /> Unread</>
              ) : (
                <><MessageSquare className="w-3.5 h-3.5" /> All</>
              )}
            </button>
          </div>
        )}

        {filter === 'inbox' && (
          <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => handleTypeFilterChange('unread')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                inboxUnreadOnly 
                  ? "bg-blue-600 text-white shadow-sm" 
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              )}
            >
              {inboxUnreadOnly ? (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Unread</>
              ) : (
                  <><Layers className="w-3.5 h-3.5" /> All</>
              )}
            </button>
            
            <button
              onClick={() => handleTypeFilterChange('article')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                inboxTypeFilter === 'article' 
                  ? "bg-blue-600 text-white shadow-sm" 
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              )}
            >
              <FileText className="w-3.5 h-3.5" /> Articles
            </button>
            
            <button
              onClick={() => handleTypeFilterChange('podcast')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                inboxTypeFilter === 'podcast' 
                  ? "bg-blue-600 text-white shadow-sm" 
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              )}
            >
              <Headphones className="w-3.5 h-3.5" /> Podcasts
            </button>
          </div>
        )}

        {isSearchOpen && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-gray-400" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={filter === 'reddit' ? "Search Reddit posts..." : filter === 'telegram' ? "Search channels..." : "Search articles..."}
                className="flex-1 bg-transparent text-gray-900 dark:text-white focus:outline-none"
                aria-label={filter === 'reddit' ? "Search Reddit posts" : filter === 'telegram' ? "Search channels" : "Search articles"}
                autoFocus
              />
              <button 
                onClick={() => {
                  setSearchQuery('');
                  setIsSearchOpen(false);
                  setSourceFilter('all');
                  setTimeFilter('all');
                }}
                className="p-1 text-gray-500"
                aria-label="Close search"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {filter !== 'reddit' && filter !== 'telegram' && (
                  <>
                    <div className="relative">
                      <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        className="appearance-none text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full pl-3 pr-8 py-1.5 border-none focus:ring-0 outline-none whitespace-nowrap"
                      >
                        <option value="all">All Sources</option>
                        {sortedFeeds.filter(f => !f.feedUrl.includes('reddit.com')).map(f => (
                          <option key={f.id} value={f.id}>{f.title}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none z-10" />
                    </div>
                    <div className="relative">
                      <select
                        value={timeFilter}
                        onChange={(e) => setTimeFilter(e.target.value)}
                        className="appearance-none text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full pl-3 pr-8 py-1.5 border-none focus:ring-0 outline-none whitespace-nowrap"
                      >
                        <option value="all">Any Time</option>
                        <option value="today">Past 24 Hours</option>
                        <option value="week">Past Week</option>
                        <option value="month">Past Month</option>
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none z-10" />
                    </div>
                  </>
                )}
            </div>
          </div>
        )}

        <ProgressBanner />
        <ErrorNotification error={error} onClear={() => setError(null)} />
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div 
          ref={inboxScrollRef}
          onScroll={(e) => handleScroll(e, 'inbox')}
          className={cn(
            "absolute inset-0 overflow-y-auto pb-24 scroll-smooth bg-black transition-all duration-300 will-change-transform",
            filter === 'inbox' ? "z-10 opacity-100 pointer-events-auto" : "z-0 opacity-0 pointer-events-none"
          )}
        >
          <FeedList
            articles={inboxArticles.slice(0, visibleCount)}
            feedsMap={feedsMap}
            settings={settings}
            handleArticleClick={handleArticleClick}
            markAsRead={markAsRead}
            toggleRead={toggleRead}
            toggleFavorite={toggleFavorite}
            toggleQueue={toggleQueue}
            handleRemoveArticle={handleRemoveArticle}
            onVisibilityChange={filter === 'inbox' ? handleVisibilityChange : undefined}
            isSavedSection={false}
            isActive={filter === 'inbox'}
            hasMoreArticles={hasMoreArticles}
            isLoading={isLoading}
            loadMoreArticles={loadMoreArticles}
          />
        </div>

        <div 
          ref={savedScrollRef}
          onScroll={(e) => handleScroll(e, 'saved')}
          className={cn(
            "absolute inset-0 overflow-y-auto pb-24 scroll-smooth bg-black transition-all duration-300 will-change-transform",
            filter === 'saved' ? "z-10 opacity-100 pointer-events-auto" : "z-0 opacity-0 pointer-events-none"
          )}
        >
          <div className="flex-1 max-w-3xl mx-auto px-2 py-2 space-y-2">
            <AnimatePresence initial={false}>
              {savedArticles
                .map(a => ({ ...a, itemType: 'article' as const }))
                .sort((a, b) => {
                  const timeA = (a as any).pubDate;
                  const timeB = (b as any).pubDate;
                  return timeB - timeA;
                })
                .slice(0, visibleCount)
                .map(item => (
                  <SwipeableArticleItem
                    key={item.id}
                    article={item as any}
                    feedName={feedsMap.get((item as any).feedId)?.title || 'Unknown'}
                    feedImageUrl={feedsMap.get((item as any).feedId)?.imageUrl}
                    settings={settings}
                    onClick={handleArticleClick}
                    onMarkAsRead={markAsRead}
                    toggleRead={toggleRead}
                    toggleFavorite={toggleFavorite}
                    toggleQueue={toggleQueue}
                    onRemove={handleRemoveArticle}
                    isSavedSection={true}
                    filter={filter}
                  />
                ))}
            </AnimatePresence>
            {savedCount === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500 px-6 text-center">
                <Star className="w-16 h-16 mb-4 text-yellow-500/40 shadow-[0_0_20px_rgba(234,179,8,0.2)]" />
                <p className="text-lg font-medium text-white mb-1">No favorites yet</p>
                <p className="text-sm">Swipe right on an article or podcast to save it for later.</p>
              </div>
            )}
            <div className="h-20 flex items-center justify-center">
              {hasMoreArticles && (
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              )}
            </div>
          </div>
        </div>

        <RedditListView
          isActive={filter === 'reddit'}
          posts={filteredRedditPosts}
          onPostClick={(post) => {
            setSelectedRedditPost(post);
            if (!post.isRead) markRedditAsRead(post.id);
          }}
          onImageClick={setSelectedImage}
          isLoading={isRedditLoading}
          refreshReddit={refreshReddit}
          loadMoreReddit={loadMoreReddit}
          settings={settings}
          onMarkAsRead={markRedditAsRead}
          toggleRead={toggleRedditRead}
          toggleFavorite={toggleRedditFavorite}
          scrollRef={redditScrollRef}
          handleScroll={(e) => handleScroll(e, 'reddit')}
        />
        <TelegramListView
          isActive={filter === 'telegram'}
          channels={sortedTelegramChannels}
          onChannelClick={(channel) => {
            setSelectedTelegramChannel(channel);
            markTelegramChannelAsRead(channel.id);
            loadTelegramMessages(channel.id);
          }}
          filter={telegramFilter}
        />
      </div>

      {selectedImage && (
        <ImageViewer imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
      )}
      
      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-800 flex justify-around pt-3 pb-5 px-3 z-20 transition-colors bg-black">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => handleFilterChange('saved')}
          className={`${filter === 'saved' ? "text-yellow-500" : "text-gray-500"} relative`}
          aria-label="Saved articles"
          aria-pressed={filter === 'saved'}
        >
          <Star className={cn("w-6 h-6", filter === 'saved' && "shadow-[0_0_15px_rgba(234,179,8,0.5)]")} aria-hidden="true" />
          {savedCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-black">
              {savedCount > 99 ? '99+' : savedCount}
            </span>
          )}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => handleFilterChange('inbox')}
          className={`${filter === 'inbox' ? "text-blue-500" : "text-gray-500"} relative`}
          aria-label="Inbox"
          aria-pressed={filter === 'inbox'}
        >
          <Inbox className={cn("w-6 h-6", filter === 'inbox' && "shadow-[0_0_15px_rgba(59,130,246,0.5)]")} aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-black">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => handleFilterChange('reddit')}
          className={`${filter === 'reddit' ? "text-purple-500" : "text-gray-500"} relative`}
          aria-label="Reddit"
          aria-pressed={filter === 'reddit'}
        >
          <MessageSquare className={cn("w-6 h-6", filter === 'reddit' && "shadow-[0_0_15px_rgba(168,85,247,0.5)]")} aria-hidden="true" />
          {redditUnreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-black">
              {redditUnreadCount > 99 ? '99+' : redditUnreadCount}
            </span>
          )}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => handleFilterChange('telegram')}
          className={`${filter === 'telegram' ? "text-green-500" : "text-gray-500"} relative`}
          aria-label="Telegram"
          aria-pressed={filter === 'telegram'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("w-6 h-6", filter === 'telegram' && "shadow-[0_0_15px_rgba(34,197,94,0.5)]")} aria-hidden="true">
            <path d="M21.5 2L2 11.5l6.5 2.5 2 6.5L14 17l5.5 4.5L21.5 2z"></path>
            <path d="M21.5 2L8.5 14"></path>
          </svg>
          {telegramChannels.reduce((sum, c) => sum + (c.unreadCount || 0), 0) > 0 && (
            <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-black">
              {telegramChannels.reduce((sum, c) => sum + (c.unreadCount || 0), 0) > 99 ? '99+' : telegramChannels.reduce((sum, c) => sum + (c.unreadCount || 0), 0)}
            </span>
          )}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            setSettingsTab(undefined);
            setIsSettingsOpen(true);
          }}
          className="text-gray-500"
          aria-label="Settings"
        >
          <Settings className="w-6 h-6" aria-hidden="true" />
        </motion.button>
      </div>

      <AnimatePresence>
        {(filter === 'inbox' || filter === 'saved' || filter === 'reddit' || filter === 'telegram') && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 20 }}
            className={cn(
              "fixed right-6 flex flex-col gap-4 z-30 items-center transition-all duration-300",
              currentTrack ? "bottom-44" : "bottom-28"
            )}
          >
            {filter === 'inbox' && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  refreshFeeds();
                }}
                className={cn(
                  "w-10 h-10 bg-gray-800 rounded-full shadow-lg flex items-center justify-center hover:bg-gray-700 active:scale-95 transition-transform",
                  "text-indigo-400"
                )}
                title="Refresh"
                aria-label="Refresh"
              >
                <RefreshCw className={cn("w-5 h-5", isLoading ? "animate-spin" : "")} aria-hidden="true" />
              </motion.button>
            )}
            
            {filter !== 'saved' && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsMarkAllReadOpen(true)}
                className={cn(
                  "w-14 h-14 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all duration-300",
                  filter === 'reddit' ? "bg-purple-600 hover:bg-purple-700 shadow-purple-500/20" : 
                  filter === 'telegram' ? "bg-green-600 hover:bg-green-700 shadow-green-500/20" : 
                  "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                )}
                title="Mark all as read"
                aria-label="Mark all as read"
              >
                <Check className="w-6 h-6" aria-hidden="true" />
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMarkAllReadOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm p-6 rounded-2xl shadow-2xl bg-black"
            >
              <h3 className="text-lg font-bold mb-2 text-gray-100">Mark all as read?</h3>
              <p className="text-gray-400 mb-6">This will mark all articles in the current view as read.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsMarkAllReadOpen(false)}
                  className="flex-1 py-2.5 rounded-xl font-medium bg-gray-800 text-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (filter === 'inbox') {
                      // Get all articles that match the current search & source filters
                      // ignoring the inboxTypeFilter and inboxUnreadOnly 
                      const toMark = articles.filter(a => {
                        if (a.isRead) return false;
                        
                        if (isSearchOpen) {
                          if (sourceFilter !== 'all' && a.feedId !== sourceFilter) return false;
                          if (timeFilter !== 'all') {
                            const now = Date.now();
                            const DAY_MS = 1000 * 60 * 60 * 24;
                            let threshold = 0;
                            if (timeFilter === 'today') threshold = now - DAY_MS;
                            if (timeFilter === 'week') threshold = now - (DAY_MS * 7);
                            if (timeFilter === 'month') threshold = now - (DAY_MS * 30);
                            
                            const pubTime = typeof a.pubDate === 'string' ? new Date(a.pubDate).getTime() : a.pubDate;
                            if (threshold > 0 && pubTime < threshold) return false;
                          }
                        }
                        
                        if (searchQuery) {
                          const lowerQuery = searchQuery.toLowerCase();
                          const matchesQuery = a.title.toLowerCase().includes(lowerQuery) || 
                                              (a.contentSnippet?.toLowerCase().includes(lowerQuery) ?? false) ||
                                              (a.content?.toLowerCase().includes(lowerQuery) ?? false);
                          if (!matchesQuery) return false;
                        }
                        
                        return true;
                      }).map(a => a.id);
                      
                      if (toMark.length > 0) {
                        markArticlesAsReadWithPersistence(toMark);
                      }
                    } else if (filter === 'saved') {
                      const toMark = savedArticles.filter(a => !a.isRead).map(a => a.id);
                      if (toMark.length > 0) {
                        markArticlesAsRead(toMark);
                      }
                    } else if (filter === 'reddit') {
                      // Mark all reddit posts as read
                      redditPosts.forEach(p => {
                        if (!p.isRead) markRedditAsRead(p.id);
                      });
                    } else if (filter === 'telegram') {
                      await markAllTelegramAsRead();
                    }
                    setIsMarkAllReadOpen(false);
                  }}
                  className={cn(
                    "flex-1 py-2.5 rounded-full font-medium text-white transition-colors",
                    filter === 'reddit' ? "bg-purple-600 hover:bg-purple-700" : 
                    filter === 'telegram' ? "bg-green-600 hover:bg-green-700" : 
                    filter === 'saved' ? "bg-yellow-600 hover:bg-yellow-700" : 
                    "bg-blue-600 hover:bg-blue-700"
                  )}
                >
                  Mark All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      <SettingsModal 
        isOpen={isSettingsOpen} 
        initialTab={settingsTab}
        onClose={() => {
          setIsSettingsOpen(false);
          setSettingsTab(undefined);
          handleFilterChange('inbox');
          setSearchQuery('');
          setIsSearchOpen(false);
        }} 
      />

      <AnimatePresence>
        {selectedRedditPost && (() => {
          const activeRedditIndex = redditPosts.findIndex(p => p.id === selectedRedditPost.id);
          const hasNextReddit = activeRedditIndex !== -1 && activeRedditIndex < redditPosts.length - 1;
          const hasPrevReddit = activeRedditIndex > 0;

          return (
            <RedditPostReader
              post={selectedRedditPost}
              onClose={() => {
                setSelectedRedditPost(null);
                enforceRedditRetention();
              }}
              onNext={hasNextReddit ? () => {
                const next = redditPosts[activeRedditIndex + 1];
                setSelectedRedditPost(next);
                if (!next.isRead) markRedditAsRead(next.id);
              } : undefined}
              onPrev={hasPrevReddit ? () => {
                const prev = redditPosts[activeRedditIndex - 1];
                setSelectedRedditPost(prev);
                if (!prev.isRead) markRedditAsRead(prev.id);
              } : undefined}
              hasNext={hasNextReddit}
              hasPrev={hasPrevReddit}
            />
          );
        })()}
        {selectedTelegramChannel && (
          <TelegramThreadView
            channel={selectedTelegramChannel}
            messages={telegramMessages[selectedTelegramChannel.id]}
            onClose={() => {
              setSelectedTelegramChannel(null);
              enforceTelegramRetention();
            }}
            onRefresh={() => refreshTelegramChannels([selectedTelegramChannel])}
            onLoadMore={() => loadMoreTelegramMessages(selectedTelegramChannel.id)}
          />
        )}
      </AnimatePresence>

       <AnimatePresence>
        {selectedArticle && (() => {
          const hasNext = activeIndex !== -1 && activeIndex < activeArticles.length - 1;
          const hasPrev = activeIndex > 0;
          
          return (
            <ArticleReader
              article={selectedArticle}
              onClose={() => setSelectedArticle(null)}
              onSelectArticle={(a) => setSelectedArticle(a)}
              onNext={() => {
                if (hasNext) {
                  const next = activeArticles[activeIndex + 1];
                  setSelectedArticle(next);
                  if (!next.isRead) markAsReadWithPersistence(next.id);
                }
              }}
              onPrev={() => {
                if (hasPrev) {
                  const prev = activeArticles[activeIndex - 1];
                  setSelectedArticle(prev);
                  if (!prev.isRead) markAsReadWithPersistence(prev.id);
                }
              }}
              hasNext={hasNext}
              hasPrev={hasPrev}
            />
          );
        })()}
      </AnimatePresence>

      <PersistentPlayer onNavigate={(a) => setSelectedArticle(a)} />
      
      <AnimatePresence>
        {undoPodcastRemoval && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-24 left-4 right-4 bg-indigo-600 text-white p-4 rounded-xl flex items-center justify-between z-[100] shadow-lg"
          >
            <span>Podcast removed</span>
            <button
              onClick={handleUndoPodcastRemoval}
              className="font-bold underline"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}