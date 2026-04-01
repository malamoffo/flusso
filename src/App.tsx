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
import { twMerge } from 'tailwind-merge';
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

export default function App() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const markedArticles = useRef<Set<string>>(new Set());
  const touchStartY = useRef(0);
  const isAtTop = useRef(true);

  const {
    articles, feeds, settings, isLoading, error,
    refreshFeeds, toggleRead, markAsRead, markArticlesAsRead,
    markAllAsRead, searchQuery, setSearchQuery, unreadCount,
    toggleFavorite, toggleQueue, removeFromSaved
  } = useRss();

  const { currentTrack } = useAudioState();

  const handleVisibilityChange = useCallback((id: string, inView: boolean) => {
    if (inView) {
      markedArticles.current.add(id);
    } else {
      markedArticles.current.delete(id);
    }
  }, []);

  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined);
  const [isMarkAllReadOpen, setIsMarkAllReadOpen] = useState(false);
  
  const [filter, setFilter] = useState<'inbox' | 'saved'>('inbox');
  const [typeFilter, setTypeFilter] = useState<'all' | 'article' | 'podcast'>('all');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  
  const PULL_THRESHOLD = 80;
  const pullProgress = useMotionValue(0);
  const pullProgressTransform = useTransform(pullProgress, v => v - 40);
  const pullOpacity = useTransform(pullProgress, v => v / PULL_THRESHOLD);
  const [isPulling, setIsPulling] = useState(false);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const handleFilterChange = (newFilter: 'inbox' | 'saved') => {
    if (newFilter === filter) return;
    
    // Reset scroll and visible count immediately to avoid flickering
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      isAtTop.current = true;
    }
    
    // Batch updates
    setFilter(newFilter);
    setTypeFilter('all');
    setVisibleCount(PAGE_SIZE);
  };

  const handleTypeFilterChange = (newType: 'all' | 'article' | 'podcast') => {
    if (newType === typeFilter) return;
    
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      isAtTop.current = true;
    }
    
    setTypeFilter(newType);
    setVisibleCount(PAGE_SIZE);
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
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
        isAtTop.current = true;
      }
      setVisibleCount(PAGE_SIZE);
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

  const filteredArticles = useMemo(() => {
    return articles.filter(article => {
      if (filter === 'saved' && !article.isFavorite && !article.isQueued) return false;
      if (typeFilter !== 'all' && article.type !== typeFilter) return false;
      
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
    }).sort((a, b) => b.pubDate - a.pubDate);
  }, [articles, filter, typeFilter, searchQuery, sourceFilter, timeFilter, isSearchOpen]);

  const visibleArticles = useMemo(() => {
    return filteredArticles.slice(0, visibleCount);
  }, [filteredArticles, visibleCount]);

  const savedCount = useMemo(() => articles.filter(a => a.isFavorite || a.isQueued).length, [articles]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const scrollTop = scrollRef.current?.scrollTop || 0;
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

  useEffect(() => {
    if (!bottomRef.current || visibleArticles.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        if (visibleCount < filteredArticles.length) {
          setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filteredArticles.length));
        } else {
          const toMark = filteredArticles.filter(a => !a.isRead).map(a => a.id);
          if (toMark.length > 0) {
            console.log(`[SCROLL] Reached bottom, marking ${toMark.length} articles as read`);
            markArticlesAsRead(toMark);
          }
        }
      }
    }, { threshold: 0.1 });
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [visibleArticles, filteredArticles, visibleCount, markArticlesAsRead]);

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
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
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
          <RefreshCw className={twMerge("w-6 h-6 text-indigo-600 dark:text-indigo-400", isLoading ? "animate-spin" : "")} />
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
            className={twMerge(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
              typeFilter === 'all' ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            )}
          >
            <Layers className="w-3.5 h-3.5" /> All
          </button>
          <button
            onClick={() => handleTypeFilterChange('article')}
            className={twMerge(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
              typeFilter === 'article' ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            )}
          >
            <FileText className="w-3.5 h-3.5" /> Articles
          </button>
          <button
            onClick={() => handleTypeFilterChange('podcast')}
            className={twMerge(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
              typeFilter === 'podcast' ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
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

      <motion.main
        className={twMerge(
          "flex-1 overflow-y-auto transition-all duration-300 will-change-transform",
          currentTrack ? "pb-48" : "pb-32"
        )}
        style={{ z: 0 }}
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {filteredArticles.length === 0 ? (
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
          <div className="flex-1">
            <AnimatePresence initial={false}>
              {visibleArticles.map(article => {
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
                    onVisibilityChange={handleVisibilityChange}
                    toggleRead={toggleRead}
                    toggleFavorite={toggleFavorite}
                    toggleQueue={toggleQueue}
                    isSavedSection={filter === 'saved'}
                    filter={filter}
                    onRemove={handleRemoveArticle}
                  />
                );
              })}
            </AnimatePresence>
            <div ref={bottomRef} className="h-20 flex items-center justify-center">
              {visibleCount < filteredArticles.length && (
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              )}
            </div>
          </div>
        )}
      </motion.main>

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
            className={twMerge(
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
              <RefreshCw className={twMerge("w-5 h-5", isLoading ? "animate-spin" : "")} aria-hidden="true" />
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
                    const toMark = filteredArticles.filter(a => !a.isRead).map(a => a.id);
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
              const idx = filteredArticles.findIndex(a => a.id === selectedArticle.id);
              if (idx < filteredArticles.length - 1) {
                const next = articles.find(a => a.id === filteredArticles[idx + 1].id) || filteredArticles[idx + 1];
                setSelectedArticle(next);
                if (!next.isRead) markAsRead(next.id);
              }
            }}
            onPrev={() => {
              const idx = filteredArticles.findIndex(a => a.id === selectedArticle.id);
              if (idx > 0) {
                const prev = articles.find(a => a.id === filteredArticles[idx - 1].id) || filteredArticles[idx - 1];
                setSelectedArticle(prev);
                if (!prev.isRead) markAsRead(prev.id);
              }
            }}
            hasNext={filteredArticles.findIndex(a => a.id === selectedArticle.id) < filteredArticles.length - 1}
            hasPrev={filteredArticles.findIndex(a => a.id === selectedArticle.id) > 0}
          />
        )}
      </AnimatePresence>

      <PersistentPlayer onNavigate={(a) => setSelectedArticle(a)} />
    </div>
  );
}