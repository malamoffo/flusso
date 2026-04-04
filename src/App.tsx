import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useRss } from './context/RssContext';
import { useAudioState } from './context/AudioPlayerContext';
import { SwipeableArticle } from './components/SwipeableArticle';
import { ArticleReader } from './components/ArticleReader';
import { AddFeedModal } from './components/AddFeedModal';
import { SettingsModal } from './components/SettingsModal';
import { PersistentPlayer } from './components/PersistentPlayer';
import { HeaderWidgets } from './components/HeaderWidgets';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { Loader2, Search, X, Check, Rss, Settings, Star, CheckCircle2, Play, Pause, SkipBack, SkipForward, RefreshCw, Layers, Headphones, FileText, Inbox } from 'lucide-react';
import { cn } from './lib/utils';
import { Article } from './types';
import { App as CapacitorApp } from '@capacitor/app';

const PAGE_SIZE = 30;

const ProgressBanner = memo(() => {
  const { progress } = useRss();
  if (!progress) return null;
  return (
    <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 text-sm text-indigo-800 dark:text-indigo-300 flex items-center justify-between border-t border-indigo-100 dark:border-indigo-900/30">
      <span>Updating feeds...</span>
      <span className="font-medium">{progress.current} / {progress.total}</span>
    </div>
  );
});

const ArticleListView = memo(({
  isActive,
  articles,
  visibleCount,
  scrollRef,
  bottomRef,
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
  setIsSettingsOpen
}: any) => {
  const visibleArticles = useMemo(() => articles.slice(0, visibleCount), [articles, visibleCount]);

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
      {articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400 px-6 text-center">
          <CheckCircle2 className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600" />
          <p className="text-lg font-medium text-gray-900 dark:text-white mb-1">No articles found</p>
          <div className="text-sm">
            {feeds.length === 0 ? (
              <div className="space-y-4">
                <p>You haven't added any feeds yet.</p>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setSettingsTab('subscriptions'); setIsSettingsOpen(true); }}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
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
        <div className="flex-1 max-w-3xl mx-auto">
          <AnimatePresence initial={false}>
            {visibleArticles.map((article: Article) => {
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
          <div ref={bottomRef} className="h-20 flex items-center justify-center">
            {visibleCount < articles.length && (
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
  const inboxBottomRef = useRef<HTMLDivElement>(null);
  const savedBottomRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const isAtTop = useRef(true);

  const {
    articles, feeds, settings, isLoading, error,
    refreshFeeds, toggleRead, markAsRead, markArticlesAsRead,
    markAllAsRead, searchQuery, setSearchQuery, unreadCount, savedCount,
    toggleFavorite, toggleQueue, removeFromSaved
  } = useRss();

  const { currentTrack } = useAudioState();

  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined);
  const [isMarkAllReadOpen, setIsMarkAllReadOpen] = useState(false);
  
  const [filter, setFilter] = useState<'inbox' | 'saved'>('inbox');
  const [inboxTypeFilter, setInboxTypeFilter] = useState<'all' | 'unread' | 'article' | 'podcast'>('all');
  const [savedTypeFilter, setSavedTypeFilter] = useState<'all' | 'article' | 'podcast'>('all');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  
  const PULL_THRESHOLD = 80;
  const pullProgress = useMotionValue(0);
  const pullProgressTransform = useTransform(pullProgress, v => v - 40);
  const pullOpacity = useTransform(pullProgress, v => v / PULL_THRESHOLD);
  const [isPulling, setIsPulling] = useState(false);

  const [visibleCountInbox, setVisibleCountInbox] = useState(PAGE_SIZE);
  const [visibleCountSaved, setVisibleCountSaved] = useState(PAGE_SIZE);

  const handleFilterChange = (newFilter: 'inbox' | 'saved') => {
    if (newFilter === filter) return;
    
    // Batch updates
    setFilter(newFilter);
  };

  const handleTypeFilterChange = (newType: 'all' | 'unread' | 'article' | 'podcast') => {
    if (filter === 'inbox') {
      if (newType === inboxTypeFilter) return;
      if (inboxScrollRef.current) inboxScrollRef.current.scrollTop = 0;
      setInboxTypeFilter(newType as any);
      setVisibleCountInbox(PAGE_SIZE);
    } else {
      if (newType === savedTypeFilter) return;
      if (savedScrollRef.current) savedScrollRef.current.scrollTop = 0;
      setSavedTypeFilter(newType as any);
      setVisibleCountSaved(PAGE_SIZE);
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
      setVisibleCountInbox(PAGE_SIZE);
      setVisibleCountSaved(PAGE_SIZE);
    }
  }, [isSearchOpen, searchQuery, sourceFilter, timeFilter]);

  useEffect(() => {
    const handleBackButton = async ({ canGoBack }: any) => {
      if (selectedArticle) {
        setSelectedArticle(null);
      } else if (isSettingsOpen) {
        setIsSettingsOpen(false);
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
  }, [selectedArticle, isSettingsOpen, isSearchOpen, filter, sourceFilter, timeFilter, setSearchQuery]);

  const baseFilteredArticlesInbox = useMemo(() => {
    return articles.filter(article => {
      if (inboxTypeFilter === 'unread') {
        if (article.isRead) return false;
      } else if (inboxTypeFilter !== 'all' && article.type !== inboxTypeFilter) {
        return false;
      }
      
      if (isSearchOpen) {
        if (sourceFilter !== 'all' && article.feedId !== sourceFilter) return false;
        if (timeFilter !== 'all') {
          const pubDate = new Date(article.pubDate);
          const diffDays = Math.ceil(Math.abs(new Date().getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24));
          if (timeFilter === 'today' && diffDays > 1) return false;
          if (timeFilter === 'week' && diffDays > 7) return false;
          if (timeFilter === 'month' && diffDays > 30) return false;
        }
      }
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return article.title.toLowerCase().includes(query) || 
               (article.contentSnippet?.toLowerCase().includes(query) ?? false) ||
               (article.content?.toLowerCase().includes(query) ?? false);
      }
      
      return true;
    });
  }, [articles, inboxTypeFilter, searchQuery, sourceFilter, timeFilter, isSearchOpen]);

  const baseFilteredArticlesSaved = useMemo(() => {
    return articles.filter(article => {
      if (savedTypeFilter !== 'all' && article.type !== savedTypeFilter) {
        return false;
      }
      
      if (isSearchOpen) {
        if (sourceFilter !== 'all' && article.feedId !== sourceFilter) return false;
        if (timeFilter !== 'all') {
          const pubDate = new Date(article.pubDate);
          const diffDays = Math.ceil(Math.abs(new Date().getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24));
          if (timeFilter === 'today' && diffDays > 1) return false;
          if (timeFilter === 'week' && diffDays > 7) return false;
          if (timeFilter === 'month' && diffDays > 30) return false;
        }
      }
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return article.title.toLowerCase().includes(query) || 
               (article.contentSnippet?.toLowerCase().includes(query) ?? false) ||
               (article.content?.toLowerCase().includes(query) ?? false);
      }
      
      return true;
    });
  }, [articles, savedTypeFilter, searchQuery, sourceFilter, timeFilter, isSearchOpen]);

  const inboxArticles = baseFilteredArticlesInbox;
  const savedArticles = useMemo(() => baseFilteredArticlesSaved.filter(a => a.isFavorite || a.isQueued), [baseFilteredArticlesSaved]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const activeScrollRef = filter === 'inbox' ? inboxScrollRef : savedScrollRef;
    const scrollTop = activeScrollRef.current?.scrollTop || 0;
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
      refreshFeeds();
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

  useEffect(() => {
    if (!inboxBottomRef.current || !inboxScrollRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        if (visibleCountInbox < inboxArticlesRef.current.length) {
          setVisibleCountInbox(prev => Math.min(prev + PAGE_SIZE, inboxArticlesRef.current.length));
        }
      }
    }, { root: inboxScrollRef.current, rootMargin: '100px', threshold: 0.1 });
    observer.observe(inboxBottomRef.current);
    return () => observer.disconnect();
  }, [visibleCountInbox]);

  useEffect(() => {
    if (!savedBottomRef.current || !savedScrollRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        if (visibleCountSaved < savedArticlesRef.current.length) {
          setVisibleCountSaved(prev => Math.min(prev + PAGE_SIZE, savedArticlesRef.current.length));
        }
      }
    }, { root: savedScrollRef.current, rootMargin: '100px', threshold: 0.1 });
    observer.observe(savedBottomRef.current);
    return () => observer.disconnect();
  }, [visibleCountSaved]);

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
      const allVisible = visibleCountInbox >= inboxArticlesRef.current.length;

      if (isAtBottom && allVisible) {
        const hasUnread = inboxArticlesRef.current.some(a => !a.isRead);
        if (hasUnread && !inboxTimerRef.current) {
          console.log('[SCROLL] Starting 5s timer for inbox mark as read');
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
          console.log('[SCROLL] Clearing inbox timer (not at bottom)');
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
  }, [filter, visibleCountInbox, markArticlesAsRead]);

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
      const allVisible = visibleCountSaved >= savedArticlesRef.current.length;

      if (isAtBottom && allVisible) {
        const hasUnread = savedArticlesRef.current.some(a => !a.isRead);
        if (hasUnread && !savedTimerRef.current) {
          console.log('[SCROLL] Starting 5s timer for saved mark as read');
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
          console.log('[SCROLL] Clearing saved timer (not at bottom)');
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
  }, [filter, visibleCountSaved, markArticlesAsRead]);

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
    const activeScrollRef = filter === 'inbox' ? inboxScrollRef : savedScrollRef;
    if (activeScrollRef.current) {
      activeScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      isAtTop.current = true;
    }
  };

  return (
    <div 
      className="h-[100dvh] overflow-hidden flex flex-col transition-colors bg-black font-sans"
      style={{ '--theme-color': settings.themeColor } as React.CSSProperties}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to refresh indicator */}
      <motion.div 
        className="fixed top-0 left-0 right-0 flex justify-center pointer-events-none z-50 will-change-transform"
        style={{ y: pullProgressTransform, opacity: pullOpacity, z: 0 }}
      >
        <div className="rounded-full p-2 shadow-lg border transition-colors bg-gray-900 border-gray-800">
          <RefreshCw className={cn("w-6 h-6 text-indigo-600 dark:text-indigo-400", isLoading ? "animate-spin" : "")} />
        </div>
      </motion.div>

      <div className="sticky top-0 z-20 shadow-sm transition-colors bg-black">
        <header className="px-4 py-3 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer active:opacity-70 transition-opacity"
            onClick={scrollToTop}
          >
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/50 rounded-2xl flex items-center justify-center shadow-inner relative">
              <Rss className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex items-baseline gap-4">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">flusso</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HeaderWidgets />
            <button 
              onClick={() => setIsSearchOpen(true)}
              className="p-2 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-600 dark:text-gray-300"
              aria-label="Open search"
            >
              <Search className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => handleTypeFilterChange('all')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
              (filter === 'inbox' ? inboxTypeFilter : savedTypeFilter) === 'all' ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            )}
          >
            <Layers className="w-3.5 h-3.5" /> All
          </button>
          {filter === 'inbox' && (
            <button
              onClick={() => handleTypeFilterChange('unread')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                inboxTypeFilter === 'unread' ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              )}
            >
              <Inbox className="w-3.5 h-3.5" /> Unread
            </button>
          )}
          <button
            onClick={() => handleTypeFilterChange('article')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
              (filter === 'inbox' ? inboxTypeFilter : savedTypeFilter) === 'article' ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            )}
          >
            <FileText className="w-3.5 h-3.5" /> Articles
          </button>
          <button
            onClick={() => handleTypeFilterChange('podcast')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
              (filter === 'inbox' ? inboxTypeFilter : savedTypeFilter) === 'podcast' ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            )}
          >
            <Headphones className="w-3.5 h-3.5" /> Podcasts
          </button>
        </div>

        {isSearchOpen && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-gray-400" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search articles..."
                className="flex-1 bg-transparent text-gray-900 dark:text-white focus:outline-none"
                aria-label="Search articles"
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
                {feeds.map(f => (
                  <option key={f.id} value={f.id}>{f.title}</option>
                ))}
              </select>
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
          visibleCount={visibleCountInbox}
          scrollRef={inboxScrollRef}
          bottomRef={inboxBottomRef}
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
        />
        <ArticleListView
          isActive={filter === 'saved'}
          articles={savedArticles}
          visibleCount={visibleCountSaved}
          scrollRef={savedScrollRef}
          bottomRef={savedBottomRef}
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
          onClick={() => setIsSettingsOpen(true)}
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
        {selectedArticle && (
          <ArticleReader
            article={selectedArticle}
            onClose={() => setSelectedArticle(null)}
            onSelectArticle={(a) => setSelectedArticle(a)}
            onNext={() => {
              const activeArticles = filter === 'inbox' ? inboxArticles : savedArticles;
              const idx = activeArticles.findIndex(a => a.id === selectedArticle.id);
              if (idx < activeArticles.length - 1) {
                const next = articles.find(a => a.id === activeArticles[idx + 1].id) || activeArticles[idx + 1];
                setSelectedArticle(next);
                if (!next.isRead) markAsRead(next.id);
              }
            }}
            onPrev={() => {
              const activeArticles = filter === 'inbox' ? inboxArticles : savedArticles;
              const idx = activeArticles.findIndex(a => a.id === selectedArticle.id);
              if (idx > 0) {
                const prev = articles.find(a => a.id === activeArticles[idx - 1].id) || activeArticles[idx - 1];
                setSelectedArticle(prev);
                if (!prev.isRead) markAsRead(prev.id);
              }
            }}
            hasNext={(filter === 'inbox' ? inboxArticles : savedArticles).findIndex(a => a.id === selectedArticle.id) < (filter === 'inbox' ? inboxArticles : savedArticles).length - 1}
            hasPrev={(filter === 'inbox' ? inboxArticles : savedArticles).findIndex(a => a.id === selectedArticle.id) > 0}
          />
        )}
      </AnimatePresence>

      <PersistentPlayer onNavigate={(a) => setSelectedArticle(a)} />
    </div>
  );
}