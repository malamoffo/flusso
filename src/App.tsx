import React, { useState, useEffect, useRef, useCallback, useMemo, memo, useDeferredValue } from 'react';
import { useRss } from './context/RssContext';
import { useAudioState } from './context/AudioPlayerContext.tsx';
import { SwipeableArticle } from './components/SwipeableArticle';
import { ArticleReader } from './components/ArticleReader';
import { SettingsModal } from './components/SettingsModal';
import { PersistentPlayer } from './components/PersistentPlayer';
import { HeaderWidgets } from './components/HeaderWidgets';
import { RedditListView } from './components/RedditListView';
import { RedditPostReader } from './components/RedditPostReader';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { Loader2, Search, X, Check, Rss, Settings, Star, CheckCircle2, RefreshCw, Layers, Headphones, FileText, Inbox, MessageSquare } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { cn } from './lib/utils';
import { Article } from './types';
import { App as CapacitorApp } from '@capacitor/app';

const PAGE_SIZE = 30;

const ProgressBanner = memo(() => {
  const { progress } = useRss();
  if (!progress) return null;
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2 text-sm text-blue-800 dark:text-blue-300 flex items-center justify-between border-t border-blue-100 dark:border-blue-900/30">
      <span>Updating feeds...</span>
      <span className="font-medium">{progress.current} / {progress.total}</span>
    </div>
  );
});

const ArticleListView = memo(({
  isActive,
  articles,
  scrollRef,
  handleScroll,
  currentTrack,
  feedsMap,
  settings,
  handleArticleClick,
  markAsRead,
  toggleRead,
  toggleFavorite,
  toggleQueue,
  handleRemoveArticle,
  isSavedSection,
  feeds,
  setSettingsTab,
  setIsSettingsOpen,
  hasMoreArticles,
  isLoading,
  loadMoreArticles
}: any) => {
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: '200px',
  });

  useEffect(() => {
    if (inView && hasMoreArticles && !isLoading) {
      loadMoreArticles();
    }
  }, [inView, hasMoreArticles, isLoading, loadMoreArticles]);

  return (
    <motion.main
      className={cn(
        "absolute inset-0 overflow-y-auto transition-all duration-300 will-change-transform",
        currentTrack ? "pb-48" : "pb-32",
        isActive ? "z-10 opacity-100 pointer-events-auto" : "z-0 opacity-0 pointer-events-none"
      )}
      ref={scrollRef}
      onScroll={handleScroll}
      initial={false}
    >
      {articles.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400 px-6 text-center">
          <CheckCircle2 className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-lg font-medium text-gray-900 dark:text-white mb-1">No articles found</p>
          <div className="text-sm">
            {feeds.length === 0 ? (
              <div className="space-y-4">
                <p>You haven't added any feeds yet.</p>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setSettingsTab(undefined); setIsSettingsOpen(true); }}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all"
                >
                  <Rss className="w-5 h-5" aria-hidden="true" /> Add your first feed
                </motion.button>
              </div>
            ) : (
              <p>You're all caught up!</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 max-w-3xl mx-auto px-1 py-1">
          <AnimatePresence initial={false}>
            {articles.map((article: Article) => {
              const feed = feedsMap.get(article.feedId);
              return (
                <SwipeableArticle
                  key={article.id}
                  article={article}
                  feedName={feed?.title || 'Unknown Feed'}
                  feedImageUrl={feed?.imageUrl}
                  settings={settings}
                  onClick={handleArticleClick}
                  onMarkAsRead={markAsRead}
                  toggleRead={toggleRead}
                  toggleFavorite={toggleFavorite}
                  toggleQueue={toggleQueue}
                  isSavedSection={isSavedSection}
                  filter={isSavedSection ? 'saved' : 'inbox'}
                  onRemove={handleRemoveArticle}
                />
              );
            })}
          </AnimatePresence>
          
          <div ref={ref} className="h-20 flex items-center justify-center">
            {(hasMoreArticles || isLoading) && (
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            )}
          </div>
        </div>
      )}
    </motion.main>
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
    articles, feeds, subreddits, redditPosts, settings, isLoading, error,
    refreshFeeds, refreshReddit, loadMoreReddit, toggleRead, markAsRead, markArticlesAsRead,
    markAllAsRead, searchQuery, setSearchQuery, unreadCount, savedCount,
    toggleFavorite, toggleQueue, removeFromSaved, loadMoreArticles, hasMoreArticles,
    markRedditAsRead, toggleRedditRead, toggleRedditFavorite,
    redditSort, handleRedditSortChange
  } = useRss();

  const sortedSubreddits = useMemo(() => 
    [...subreddits].sort((a, b) => a.name.localeCompare(b.name)),
    [subreddits]
  );
  
  const sortedFeeds = useMemo(() => 
    [...feeds].sort((a, b) => a.title.localeCompare(b.title)),
    [feeds]
  );

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const { currentTrack } = useAudioState();

  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedRedditPost, setSelectedRedditPost] = useState<any | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined);
  const [isMarkAllReadOpen, setIsMarkAllReadOpen] = useState(false);
  
  const [filter, setFilter] = useState<'inbox' | 'saved' | 'reddit'>('inbox');
  const [inboxTypeFilter, setInboxTypeFilter] = useState<'all' | 'article' | 'podcast'>('all');
  const [inboxUnreadOnly, setInboxUnreadOnly] = useState(false);
  const [savedTypeFilter, setSavedTypeFilter] = useState<'all' | 'article' | 'podcast'>('all');
  const [savedUnreadOnly, setSavedUnreadOnly] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  
  const PULL_THRESHOLD = 80;
  const pullProgress = useMotionValue(0);
  const pullProgressTransform = useTransform(pullProgress, v => v - 40);
  const pullOpacity = useTransform(pullProgress, v => v / PULL_THRESHOLD);
  const [isPulling, setIsPulling] = useState(false);

  const handleFilterChange = (newFilter: 'inbox' | 'saved' | 'reddit') => {
    if (newFilter === filter) return;
    
    // Batch updates
    setFilter(newFilter);
  };

  const handleTypeFilterChange = (newType: 'unread' | 'article' | 'podcast') => {
    if (filter === 'inbox') {
      if (newType === 'unread') {
        setInboxUnreadOnly(!inboxUnreadOnly);
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
      if (selectedArticle) {
        setSelectedArticle(null);
      } else if (selectedRedditPost) {
        setSelectedRedditPost(null);
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
  }, [selectedArticle, selectedRedditPost, isSettingsOpen, isSearchOpen, filter, sourceFilter, timeFilter, setSearchQuery]);

  /**
   * ⚡ Bolt: Consolidated single-pass filtering for Inbox and Saved views.
   * Reduces traversals from O(3N) to O(N) and uses useDeferredValue to keep the UI responsive.
   * Pre-calculates constants and avoids redundant object creation in the loop.
   */
  const { inboxArticles, savedArticles } = useMemo(() => {
    const inbox: Article[] = [];
    const saved: Article[] = [];
    
    const now = Date.now();
    const query = deferredSearchQuery.toLowerCase();
    const DAY_MS = 1000 * 60 * 60 * 24;
    const timeThresholds: Record<string, number> = {
      today: now - DAY_MS,
      week: now - (DAY_MS * 7),
      month: now - (DAY_MS * 30),
    };

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      
      // Common filters (Search & Metadata)
      if (isSearchOpen) {
        if (sourceFilter !== 'all' && article.feedId !== sourceFilter) continue;
        if (timeFilter !== 'all') {
          const threshold = timeThresholds[timeFilter];
          // Robustly handle string or number pubDate
          const pubTime = typeof article.pubDate === 'string' ? new Date(article.pubDate).getTime() : article.pubDate;
          if (threshold && pubTime < threshold) continue;
        }
      }
      
      if (query) {
        const matchesQuery = article.title.toLowerCase().includes(query) || 
                            (article.contentSnippet?.toLowerCase().includes(query) ?? false) ||
                            (article.content?.toLowerCase().includes(query) ?? false);
        if (!matchesQuery) continue;
      }

      // Inbox specific filtering
      let matchesInbox = true;
      if (inboxUnreadOnly && article.isRead) matchesInbox = false;
      if (inboxTypeFilter !== 'all' && article.type !== inboxTypeFilter) matchesInbox = false;
      if (matchesInbox) inbox.push(article);

      // Saved specific filtering
      if (article.isFavorite || article.isQueued) {
        let matchesSaved = true;
        if (savedUnreadOnly && article.isRead) matchesSaved = false;
        if (savedTypeFilter !== 'all' && article.type !== savedTypeFilter) matchesSaved = false;
        if (matchesSaved) saved.push(article);
      }
    }

    return { inboxArticles: inbox, savedArticles: saved };
  }, [articles, inboxTypeFilter, inboxUnreadOnly, savedTypeFilter, savedUnreadOnly, deferredSearchQuery, sourceFilter, timeFilter, isSearchOpen]);

  /**
   * ⚡ Bolt: Optimize article navigation by pre-calculating the active list and current index.
   * This avoids repeated O(N) findIndex calls on every render and navigation event.
   */
  const activeArticles = useMemo(() => (filter === 'inbox' ? inboxArticles : savedArticles), [filter, inboxArticles, savedArticles]);
  const activeIndex = useMemo(() => {
    if (!selectedArticle) return -1;
    return activeArticles.findIndex(a => a.id === selectedArticle.id);
  }, [selectedArticle, activeArticles]);

  const handleTouchStart = (e: React.TouchEvent) => {
    let activeScrollRef;
    if (filter === 'inbox') activeScrollRef = inboxScrollRef;
    else if (filter === 'saved') activeScrollRef = savedScrollRef;
    else if (filter === 'reddit') activeScrollRef = redditScrollRef;
    
    const scrollTop = activeScrollRef?.current?.scrollTop || 0;
    isAtTop.current = scrollTop <= 0;
    touchStartY.current = e.touches[0].clientY;
    if (isAtTop.current && !isSettingsOpen) {
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || !isAtTop.current) return;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (deltaY < 0) {
      setIsPulling(false);
      pullProgress.set(0);
      return;
    }
    if (deltaY > 0) {
      pullProgress.set(Math.min(deltaY * 0.4, PULL_THRESHOLD + 30));
    }
  };

  const handleTouchEnd = () => {
    if (isPulling && pullProgress.get() >= PULL_THRESHOLD) {
      if (filter !== 'reddit') {
        refreshFeeds();
      }
    } else {
      animate(pullProgress, 0, { duration: 0.2 });
    }
    setIsPulling(false);
  };

  useEffect(() => {
    if (!isLoading) {
      animate(pullProgress, 0, { duration: 0.2 });
    }
  }, [isLoading, pullProgress]);

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
            const toMark = inboxArticlesRef.current.filter(a => !a.isRead).map(a => a.id);
            if (toMark.length > 0) {
              markArticlesAsRead(toMark);
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

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    isAtTop.current = scrollTop <= 0;
  };

  const handleArticleClick = useCallback((article: Article) => {
    setSelectedArticle(article);
    if (!article.isRead) {
      markAsRead(article.id);
    }
  }, [markAsRead]);

  const handleRemoveArticle = useCallback((id: string) => {
    removeFromSaved(id);
  }, [removeFromSaved]);

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
      {/* Pull to refresh indicator - REMOVED */}

      <div className="sticky top-0 z-20 shadow-sm transition-colors bg-black">
        <header className="px-4 py-3 flex items-center justify-between">
           <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={scrollToTop}
            className="flex items-center gap-3 active:opacity-70 transition-opacity focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg px-1 outline-none"
            aria-label="Scroll to top"
          >
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner relative transition-colors" style={{ backgroundColor: filter === 'reddit' ? 'rgba(147, 51, 234, 0.1)' : 'rgba(37, 99, 235, 0.1)' }}>
              <Rss className={cn("w-6 h-6 transition-colors", filter === 'reddit' ? "text-purple-600 dark:text-purple-400" : "text-blue-600 dark:text-blue-400")} />
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
              Trending
            </button>
            <button
              onClick={() => handleRedditSortChange('top')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                redditSort === 'top' ? "bg-purple-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              )}
            >
              Top
            </button>
          </div>
        )}

        {filter !== 'reddit' && (
          <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => handleTypeFilterChange('unread')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                (filter === 'inbox' ? inboxUnreadOnly : savedUnreadOnly) ? "bg-blue-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              )}
            >
              {(filter === 'inbox' ? inboxUnreadOnly : savedUnreadOnly) ? (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Unread</>
              ) : (
                  <><Layers className="w-3.5 h-3.5" /> All</>
              )}
            </button>
            
            <button
              onClick={() => handleTypeFilterChange('article')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                (filter === 'inbox' ? inboxTypeFilter === 'article' : savedTypeFilter === 'article') ? "bg-blue-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              )}
            >
              <FileText className="w-3.5 h-3.5" /> Articles
            </button>
            
            <button
              onClick={() => handleTypeFilterChange('podcast')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                (filter === 'inbox' ? inboxTypeFilter === 'podcast' : savedTypeFilter === 'podcast') ? "bg-blue-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
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
                placeholder={filter === 'reddit' ? "Search Reddit posts..." : "Search articles..."}
                className="flex-1 bg-transparent text-gray-900 dark:text-white focus:outline-none"
                aria-label={filter === 'reddit' ? "Search Reddit posts" : "Search articles"}
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
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full px-3 py-1.5 border-none focus:ring-0 outline-none whitespace-nowrap"
              >
                <option value="all">All Sources</option>
                {filter === 'reddit' ? (
                  <>
                    {sortedSubreddits.map(s => (
                      <option key={s.id} value={s.id}>r/{s.name}</option>
                    ))}
                    {sortedFeeds.filter(f => f.feedUrl.includes('reddit.com')).map(f => (
                      <option key={f.id} value={f.id}>{f.title}</option>
                    ))}
                  </>
                ) : (
                  sortedFeeds.filter(f => !f.feedUrl.includes('reddit.com')).map(f => (
                    <option key={f.id} value={f.id}>{f.title}</option>
                  ))
                )}
              </select>
              {filter !== 'reddit' && (
                <select
                  value={timeFilter}
                  onChange={(e) => setTimeFilter(e.target.value)}
                  className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full px-3 py-1.5 border-none focus:ring-0 outline-none whitespace-nowrap"
                >
                  <option value="all">Any Time</option>
                  <option value="today">Past 24 Hours</option>
                  <option value="week">Past Week</option>
                  <option value="month">Past Month</option>
                </select>
              )}
            </div>
          </div>
        )}

        <ProgressBanner />
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-800 dark:text-red-300 border-t border-red-100 dark:border-red-900/30">
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 relative overflow-hidden">
        <ArticleListView
          isActive={filter === 'inbox'}
          articles={inboxArticles}
          scrollRef={inboxScrollRef}
          handleScroll={handleScroll}
          currentTrack={currentTrack}
          feedsMap={feedsMap}
          settings={settings}
          handleArticleClick={handleArticleClick}
          markAsRead={markAsRead}
          toggleRead={toggleRead}
          toggleFavorite={toggleFavorite}
          toggleQueue={toggleQueue}
          handleRemoveArticle={handleRemoveArticle}
          isSavedSection={false}
          feeds={feeds}
          setSettingsTab={setSettingsTab}
          setIsSettingsOpen={setIsSettingsOpen}
          hasMoreArticles={hasMoreArticles}
          isLoading={isLoading}
          loadMoreArticles={loadMoreArticles}
        />
        <ArticleListView
          isActive={filter === 'saved'}
          articles={savedArticles}
          scrollRef={savedScrollRef}
          handleScroll={handleScroll}
          currentTrack={currentTrack}
          feedsMap={feedsMap}
          settings={settings}
          handleArticleClick={handleArticleClick}
          markAsRead={markAsRead}
          toggleRead={toggleRead}
          toggleFavorite={toggleFavorite}
          toggleQueue={toggleQueue}
          handleRemoveArticle={handleRemoveArticle}
          isSavedSection={true}
          feeds={feeds}
          setSettingsTab={setSettingsTab}
          setIsSettingsOpen={setIsSettingsOpen}
          hasMoreArticles={hasMoreArticles}
          isLoading={isLoading}
          loadMoreArticles={loadMoreArticles}
        />

        <RedditListView
          isActive={filter === 'reddit'}
          posts={redditPosts}
          onPostClick={setSelectedRedditPost}
          isLoading={isLoading}
          refreshReddit={refreshReddit}
          loadMoreReddit={loadMoreReddit}
          settings={settings}
          onMarkAsRead={markRedditAsRead}
          toggleRead={toggleRedditRead}
          toggleFavorite={toggleRedditFavorite}
          scrollRef={redditScrollRef}
          handleScroll={handleScroll}
        />
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-800 flex justify-around pt-3 pb-5 px-3 z-20 transition-colors bg-black">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => handleFilterChange('saved')}
          className={`${filter === 'saved' ? "text-yellow-500" : "text-gray-500"} relative`}
          aria-label="Saved articles"
          aria-pressed={filter === 'saved'}
        >
          <Star className="w-6 h-6" aria-hidden="true" />
          {savedCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-black">
              {savedCount > 99 ? '99+' : savedCount}
            </span>
          )}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => handleFilterChange('inbox')}
          className={`${filter === 'inbox' ? "text-[var(--theme-color)]" : "text-gray-500"} relative`}
          aria-label="Inbox"
          aria-pressed={filter === 'inbox'}
        >
          <Inbox className="w-6 h-6" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-black">
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
        {filter === 'inbox' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 20 }}
            className={cn(
              "fixed right-6 flex flex-col gap-4 z-30 items-center transition-all duration-300",
              currentTrack ? "bottom-44" : "bottom-28"
            )}
          >
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => refreshFeeds()}
              className="w-10 h-10 bg-gray-800 text-indigo-400 rounded-xl shadow-lg flex items-center justify-center hover:bg-gray-700 active:scale-95 transition-transform"
              title="Refresh feeds"
              aria-label="Refresh feeds"
            >
              <RefreshCw className={cn("w-5 h-5", isLoading ? "animate-spin" : "")} aria-hidden="true" />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsMarkAllReadOpen(true)}
              className="w-14 h-14 bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl shadow-lg flex items-center justify-center hover:bg-indigo-700 dark:hover:bg-indigo-600 active:scale-95 transition-transform"
              title="Mark all as read"
              aria-label="Mark all as read"
            >
              <Check className="w-6 h-6" aria-hidden="true" />
            </motion.button>
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
                    const activeArticles = filter === 'inbox' ? inboxArticles : savedArticles;
                    const toMark = activeArticles.filter(a => !a.isRead).map(a => a.id);
                    if (toMark.length > 0) {
                      markArticlesAsRead(toMark);
                    }
                    setIsMarkAllReadOpen(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl font-medium bg-indigo-600 text-white"
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
              onClose={() => setSelectedRedditPost(null)}
              onNext={hasNextReddit ? () => setSelectedRedditPost(redditPosts[activeRedditIndex + 1]) : undefined}
              onPrev={hasPrevReddit ? () => setSelectedRedditPost(redditPosts[activeRedditIndex - 1]) : undefined}
              hasNext={hasNextReddit}
              hasPrev={hasPrevReddit}
            />
          );
        })()}
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
                  if (!next.isRead) markAsRead(next.id);
                }
              }}
              onPrev={() => {
                if (hasPrev) {
                  const prev = activeArticles[activeIndex - 1];
                  setSelectedArticle(prev);
                  if (!prev.isRead) markAsRead(prev.id);
                }
              }}
              hasNext={hasNext}
              hasPrev={hasPrev}
            />
          );
        })()}
      </AnimatePresence>

      <PersistentPlayer onNavigate={(a) => setSelectedArticle(a)} />
    </div>
  );
}