import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

import { RssProvider, useRss } from './context/RssContext';
import { SwipeableArticle } from './components/SwipeableArticle';
import { ArticleReader } from './components/ArticleReader';
import { SettingsModal } from './components/SettingsModal';
import { HeaderWidgets } from './components/HeaderWidgets';
import { Article } from './types';
import { RefreshCw, Rss, Inbox, Settings as SettingsIcon, CheckSquare, Search, X, LayoutGrid, Star, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './lib/utils';

import { App as CapacitorApp } from '@capacitor/app';

function MainContent() {
  const mainRef = useRef<HTMLElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const visibleArticlesRef = useRef<Set<string>>(new Set());
  const markReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startYRef = useRef<number>(0);
  const isAtTopRef = useRef<boolean>(true);

  const { articles, feeds, settings, isLoading, progress, error, refreshFeeds, toggleRead, markAsRead, markArticlesAsRead, markAllAsRead, searchQuery, setSearchQuery, unreadCount, toggleFavorite } = useRss();

  // ⚡ Bolt: Memoize handleVisibilityChange to keep reference stable for SwipeableArticle
  const handleVisibilityChange = useCallback((id: string, inView: boolean) => {
    if (inView) {
      visibleArticlesRef.current.add(id);
    } else {
      visibleArticlesRef.current.delete(id);
    }
    
    // Reset timer whenever visibility changes (scrolling or items appearing/disappearing)
    if (markReadTimeoutRef.current) {
      clearTimeout(markReadTimeoutRef.current);
    }
    
    markReadTimeoutRef.current = setTimeout(() => {
      const visibleIds = Array.from(visibleArticlesRef.current);
      if (visibleIds.length > 0) {
        markArticlesAsRead(visibleIds);
      }
    }, 5000);
  }, [markArticlesAsRead]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (markReadTimeoutRef.current) {
        clearTimeout(markReadTimeoutRef.current);
      }
    };
  }, []);

  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'settings' | 'subscriptions' | 'about' | undefined>(undefined);
  const [isMarkAllConfirmOpen, setIsMarkAllConfirmOpen] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread' | 'favorites'>('unread');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchSourceFilter, setSearchSourceFilter] = useState('all');
  const [searchDateRange, setSearchDateRange] = useState('all');
  
  // Scroll to top when filter changes
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
      isAtTopRef.current = true;
    }
  }, [filter]);
  
  // Handle Android back button
  useEffect(() => {
    const backListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (selectedArticle) {
        setSelectedArticle(null);
      } else if (isSettingsModalOpen) {
        setIsSettingsModalOpen(false);
        setFilter('all');
        setSearchQuery('');
        setIsSearchOpen(false);
      } else if (isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery('');
        setSearchSourceFilter('all');
        setSearchDateRange('all');
      } else if (filter !== 'all') {
        setFilter('all');
      } else {
        CapacitorApp.exitApp();
      }
    });

    return () => {
      backListener.then(l => l.remove());
    };
  }, [selectedArticle, isSettingsModalOpen, isSearchOpen, filter, searchSourceFilter, searchDateRange, setSearchQuery]);
  
  // State for articles currently being displayed to allow deferred removal of read items
  const [displayArticles, setDisplayArticles] = useState<Article[]>([]);
  
  // Pull to refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const PULL_THRESHOLD = 80;

  useEffect(() => {
    const isDark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('pure-black', isDark && settings.pureBlack);
  }, [settings.theme, settings.pureBlack]);

  const prevFilterRef = useRef(filter);
  const prevSearchRef = useRef(searchQuery);
  const prevSourceFilterRef = useRef(searchSourceFilter);
  const prevDateRangeRef = useRef(searchDateRange);
  const prevIsLoadingRef = useRef(isLoading);
  const prevForceRefreshRef = useRef(forceRefresh);

  // Update displayArticles only on specific triggers (re-accessing section, search change, refresh completion, or new articles)
  useEffect(() => {
    const filterChanged = prevFilterRef.current !== filter;
    const searchChanged = prevSearchRef.current !== searchQuery;
    const sourceFilterChanged = prevSourceFilterRef.current !== searchSourceFilter;
    const dateRangeChanged = prevDateRangeRef.current !== searchDateRange;
    const refreshFinished = prevIsLoadingRef.current === true && isLoading === false;
    const forceRefreshTriggered = prevForceRefreshRef.current !== forceRefresh;
    
    prevFilterRef.current = filter;
    prevSearchRef.current = searchQuery;
    prevSourceFilterRef.current = searchSourceFilter;
    prevDateRangeRef.current = searchDateRange;
    prevIsLoadingRef.current = isLoading;
    prevForceRefreshRef.current = forceRefresh;

    setDisplayArticles(prev => {
      if (filterChanged || searchChanged || sourceFilterChanged || dateRangeChanged || refreshFinished || forceRefreshTriggered || prev.length === 0) {
        // Full re-evaluation on filter/search change, refresh completion, or initial load
        return articles.filter(article => {
          if (filter === 'unread' && article.isRead) return false;
          if (filter === 'favorites' && !article.isFavorite) return false;
          
          if (isSearchOpen) {
            if (searchSourceFilter !== 'all' && article.feedId !== searchSourceFilter) return false;
            
            if (searchDateRange !== 'all') {
              const articleDate = new Date(article.pubDate);
              const now = new Date();
              const diffTime = Math.abs(now.getTime() - articleDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              
              if (searchDateRange === 'today' && diffDays > 1) return false;
              if (searchDateRange === 'week' && diffDays > 7) return false;
              if (searchDateRange === 'month' && diffDays > 30) return false;
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
      } else {
        // Keep existing articles even if they no longer match the filter (e.g. marked as read)
        // But add new articles that DO match the filter.
        // Also remove articles that were deleted from `articles`.
        
        const currentArticleIds = new Set(articles.map(a => a.id));
        const existingIds = new Set(prev.map(a => a.id));
        const articlesMap = new Map(articles.map(a => [a.id, a]));
        
        // 1. Keep articles that were in `prev` AND still exist in `articles`
        // We also update them with the latest state from `articles`
        const nextDisplay = prev
          .filter(a => currentArticleIds.has(a.id))
          .map(a => articlesMap.get(a.id) || a);
        
        // 2. Add new articles that match the filter
        const newMatchingArticles = articles.filter(article => {
          if (existingIds.has(article.id)) return false;
          
          if (filter === 'unread' && article.isRead) return false;
          if (filter === 'favorites' && !article.isFavorite) return false;
          
          if (isSearchOpen) {
            if (searchSourceFilter !== 'all' && article.feedId !== searchSourceFilter) return false;
            
            if (searchDateRange !== 'all') {
              const articleDate = new Date(article.pubDate);
              const now = new Date();
              const diffTime = Math.abs(now.getTime() - articleDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              
              if (searchDateRange === 'today' && diffDays > 1) return false;
              if (searchDateRange === 'week' && diffDays > 7) return false;
              if (searchDateRange === 'month' && diffDays > 30) return false;
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
        
        if (newMatchingArticles.length === 0 && nextDisplay.length === prev.length) {
          // No changes needed if no new matching articles and no deletions
          // (We still might have updated states, but React handles that if we return same array reference? 
          // No, we should return a new array if states updated. But wait, we did a map above.)
          return nextDisplay;
        }
        
        // Combine and sort by date descending
        return [...nextDisplay, ...newMatchingArticles].sort((a, b) => b.pubDate - a.pubDate);
      }
    });
  }, [filter, searchQuery, searchSourceFilter, searchDateRange, isSearchOpen, articles, isLoading, forceRefresh]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const scrollTop = mainRef.current?.scrollTop || 0;
    isAtTopRef.current = scrollTop <= 0;
    startYRef.current = e.touches[0].clientY;
    
    if (isAtTopRef.current && !isSettingsModalOpen) {
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || !isAtTopRef.current) return;
    
    const touch = e.touches[0];
    const distance = touch.clientY - startYRef.current;
    
    // If user moves up (scrolling down), cancel pulling
    if (distance < 0) {
      setIsPulling(false);
      setPullDistance(0);
      return;
    }
    
    // Apply resistance
    if (distance > 0) {
      setPullDistance(Math.min(distance * 0.4, PULL_THRESHOLD + 30));
    }
  };

  const handleTouchEnd = () => {
    if (isPulling && pullDistance >= PULL_THRESHOLD) {
      refreshFeeds();
    }
    setIsPulling(false);
    setPullDistance(0);
  };

  // Mark all as read when reaching the bottom
  useEffect(() => {
    if (!bottomRef.current || displayArticles.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        const unreadIds = displayArticles.filter(a => !a.isRead).map(a => a.id);
        if (unreadIds.length > 0) {
          console.log(`[SCROLL] Reached bottom, marking ${unreadIds.length} articles as read`);
          markArticlesAsRead(unreadIds);
        }
      }
    }, { threshold: 0.1 });

    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [displayArticles, markArticlesAsRead]);

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    // We still keep handleScroll for other potential needs, 
    // but the bottom detection is now handled by IntersectionObserver
    const scrollTop = e.currentTarget.scrollTop;
    isAtTopRef.current = scrollTop <= 0;
  };

  // ⚡ Bolt: Memoize handleSelectArticle to keep reference stable for SwipeableArticle
  const handleSelectArticle = useCallback((article: Article) => {
    setSelectedArticle(article);
    if (!article.isRead) {
      markAsRead(article.id);
    }
  }, [markAsRead, setSelectedArticle]);

  // ⚡ Bolt: Use a Map for O(1) feed lookups instead of O(F) find inside article loop
  const feedMap = useMemo(() => new Map(feeds.map(f => [f.id, f])), [feeds]);

  return (
    <div 
      className={`h-[100dvh] overflow-hidden flex flex-col transition-colors ${
        settings.theme === 'dark' && settings.pureBlack ? 'bg-black' : 'bg-gray-50 dark:bg-gray-950'
      } font-sans`}
      style={{ '--theme-color': settings.themeColor } as React.CSSProperties}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to refresh indicator */}
      <div 
        className="fixed top-0 left-0 right-0 flex justify-center pointer-events-none z-50"
        style={{ transform: `translateY(${pullDistance - 40}px)`, opacity: pullDistance / PULL_THRESHOLD }}
      >
        <div className={`rounded-full p-2 shadow-lg border transition-colors ${
          settings.theme === 'dark' && settings.pureBlack ? 'bg-gray-900 border-gray-800' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'
        }`}>
          <RefreshCw className={`w-6 h-6 text-indigo-600 dark:text-indigo-400 ${pullDistance >= PULL_THRESHOLD ? 'animate-spin' : ''}`} />
        </div>
      </div>

      {/* Sticky Header Group */}
      <div className={`sticky top-0 z-20 shadow-sm transition-colors ${
        settings.theme === 'dark' && settings.pureBlack ? 'bg-black' : 'bg-white dark:bg-gray-900'
      }`}>
        {/* Top App Bar */}
        <header className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
                onClick={() => { setSearchQuery(''); setIsSearchOpen(false); setSearchSourceFilter('all'); setSearchDateRange('all'); }}
                className="p-1 text-gray-500"
                aria-label="Close search"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <select
                value={searchSourceFilter}
                onChange={(e) => setSearchSourceFilter(e.target.value)}
                className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full px-3 py-1.5 border-none focus:ring-0 outline-none whitespace-nowrap"
              >
                <option value="all">All Sources</option>
                {feeds.map(feed => (
                  <option key={feed.id} value={feed.id}>{feed.title}</option>
                ))}
              </select>
              <select
                value={searchDateRange}
                onChange={(e) => setSearchDateRange(e.target.value)}
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

        {/* Progress Indicator */}
        {progress && (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 text-sm text-indigo-800 dark:text-indigo-300 flex items-center justify-between border-t border-indigo-100 dark:border-indigo-900/30">
            <span>Updating feeds...</span>
            <span className="font-medium">{progress.current} / {progress.total}</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-red-800 dark:text-red-300 border-t border-red-100 dark:border-red-900/30">
            {error}
          </div>
        )}
      </div>

      {/* Article List */}
      <main 
        className="flex-1 overflow-y-auto pb-32" 
        ref={mainRef}
        onScroll={handleScroll}
      >
        {displayArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400 px-6 text-center">
            <Inbox className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600" />
            <p className="text-lg font-medium text-gray-900 dark:text-white mb-1">No articles found</p>
            <div className="text-sm">
              {feeds.length === 0 ? (
                <div className="space-y-4">
                  <p>You haven't added any feeds yet.</p>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setSettingsInitialTab('subscriptions');
                      setIsSettingsModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
                  >
                    <Plus className="w-5 h-5" aria-hidden="true" />
                    Add your first feed
                  </motion.button>
                </div>
              ) : (
                <p>You're all caught up!</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1">
            {displayArticles.map((article) => {
              const feed = feedMap.get(article.feedId);
              return (
                <SwipeableArticle 
                  key={article.id} 
                  article={article} 
                  feedName={feed?.title || 'Unknown Feed'}
                  settings={settings}
                  onClick={handleSelectArticle}
                  onMarkAsRead={markAsRead}
                  onVisibilityChange={handleVisibilityChange}
                  toggleRead={toggleRead}
                  toggleFavorite={toggleFavorite}
                />
              );
            })}
            <div ref={bottomRef} className="h-20" />
          </div>
        )}
      </main>


      {/* Bottom Navigation Bar */}
      <div className={`fixed bottom-0 left-0 right-0 border-t border-gray-100 dark:border-gray-800 flex justify-around pt-3 pb-5 px-3 z-20 transition-colors ${
        settings.theme === 'dark' && settings.pureBlack ? 'bg-black' : 'bg-white dark:bg-gray-900'
      }`}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setFilter('all')}
          className={filter === 'all' ? 'text-[var(--theme-color)]' : 'text-gray-500'}
          aria-label="All articles"
          aria-pressed={filter === 'all'}
        >
          <LayoutGrid className="w-6 h-6" aria-hidden="true" />
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setFilter('unread')}
          className={`${filter === 'unread' ? 'text-[var(--theme-color)]' : 'text-gray-500'} relative`}
          aria-label="Unread articles"
          aria-pressed={filter === 'unread'}
        >
          <Inbox className="w-6 h-6" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white dark:border-gray-900">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setFilter('favorites')}
          className={filter === 'favorites' ? 'text-[var(--theme-color)]' : 'text-gray-500'}
          aria-label="Favorite articles"
          aria-pressed={filter === 'favorites'}
        >
          <Star className="w-6 h-6" aria-hidden="true" />
        </motion.button>
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-28 right-6 flex flex-col gap-4 z-30 items-center">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsSettingsModalOpen(true)}
          className="w-12 h-12 bg-indigo-50 dark:bg-gray-800 text-indigo-700 dark:text-indigo-300 rounded-xl shadow-md flex items-center justify-center hover:bg-indigo-100 dark:hover:bg-gray-700 active:scale-95 transition-transform"
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon className="w-5 h-5" aria-hidden="true" />
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsMarkAllConfirmOpen(true)}
          className="w-14 h-14 bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl shadow-lg flex items-center justify-center hover:bg-indigo-700 dark:hover:bg-indigo-600 active:scale-95 transition-transform"
          title="Mark all as read"
          aria-label="Mark all as read"
        >
          <CheckSquare className="w-6 h-6" aria-hidden="true" />
        </motion.button>
      </div>

      {/* Modals & Overlays */}
      <AnimatePresence>
        {isMarkAllConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "w-full max-w-sm p-6 rounded-2xl shadow-2xl bg-white dark:bg-gray-900",
                settings.pureBlack && "bg-black"
              )}
            >
              <h3 className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">Mark all as read?</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">This will mark all articles in the current view as read.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsMarkAllConfirmOpen(false)}
                  className="flex-1 py-2.5 rounded-xl font-medium bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    markAllAsRead();
                    setForceRefresh(prev => prev + 1);
                    setIsMarkAllConfirmOpen(false);
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
        isOpen={isSettingsModalOpen}
        initialTab={settingsInitialTab}
        onClose={() => {
          setIsSettingsModalOpen(false);
          setSettingsInitialTab(undefined);
          setFilter('all');
          setSearchQuery('');
          setIsSearchOpen(false);
        }}
      />
      
      <AnimatePresence>
        {selectedArticle && (
          <ArticleReader 
            key={selectedArticle.id}
            article={selectedArticle} 
            onClose={() => setSelectedArticle(null)} 
            onNext={() => {
              const idx = displayArticles.findIndex(a => a.id === selectedArticle.id);
              if (idx < displayArticles.length - 1) {
                const nextArticle = articles.find(a => a.id === displayArticles[idx + 1].id) || displayArticles[idx + 1];
                setSelectedArticle(nextArticle);
                if (!nextArticle.isRead) markAsRead(nextArticle.id);
              }
            }}
            onPrev={() => {
              const idx = displayArticles.findIndex(a => a.id === selectedArticle.id);
              if (idx > 0) {
                const prevArticle = articles.find(a => a.id === displayArticles[idx - 1].id) || displayArticles[idx - 1];
                setSelectedArticle(prevArticle);
                if (!prevArticle.isRead) markAsRead(prevArticle.id);
              }
            }}
            hasNext={displayArticles.findIndex(a => a.id === selectedArticle.id) < displayArticles.length - 1}
            hasPrev={displayArticles.findIndex(a => a.id === selectedArticle.id) > 0}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <RssProvider>
      {/* ⚡ Bolt: RssProvider handles context performance (stable value, memoized derivations) */}
      <MainContent />
    </RssProvider>
  );
}
