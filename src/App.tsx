import React, { useState, useEffect, useRef } from 'react';
import { RssProvider, useRss } from './context/RssContext';
import { SwipeableArticle } from './components/SwipeableArticle';
import { ArticleReader } from './components/ArticleReader';
import { SettingsModal } from './components/SettingsModal';
import { Article } from './types';
import { RefreshCw, Rss, Inbox, Settings as SettingsIcon, CheckSquare, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { App as CapacitorApp } from '@capacitor/app';

function MainContent() {
  const { articles, feeds, settings, isLoading, progress, error, refreshFeeds, toggleRead, markAsRead, markAllAsRead, searchQuery, setSearchQuery } = useRss();
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'favorites'>('unread');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  // Handle Android back button
  useEffect(() => {
    const backListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (selectedArticle) {
        setSelectedArticle(null);
      } else if (isSettingsModalOpen) {
        setIsSettingsModalOpen(false);
      } else if (isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery('');
      } else if (filter !== 'all') {
        setFilter('all');
      } else {
        CapacitorApp.exitApp();
      }
    });

    return () => {
      backListener.then(l => l.remove());
    };
  }, [selectedArticle, isSettingsModalOpen, isSearchOpen, filter]);
  
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

  // Update displayArticles only on specific triggers (re-accessing section, search change, or new articles)
  useEffect(() => {
    const filterChanged = prevFilterRef.current !== filter;
    const searchChanged = prevSearchRef.current !== searchQuery;
    
    prevFilterRef.current = filter;
    prevSearchRef.current = searchQuery;

    setDisplayArticles(prev => {
      if (filterChanged || searchChanged || prev.length === 0) {
        // Full re-evaluation on filter/search change or initial load
        return articles.filter(article => {
          let matchesFilter = true;
          if (filter === 'unread') matchesFilter = !article.isRead;
          else if (filter === 'favorites') matchesFilter = article.isFavorite;
          
          let matchesSearch = true;
          if (searchQuery) {
            const query = searchQuery.toLowerCase();
            matchesSearch = article.title.toLowerCase().includes(query) || 
                            (article.contentSnippet?.toLowerCase().includes(query) ?? false) ||
                            (article.content?.toLowerCase().includes(query) ?? false);
          }
          
          return matchesFilter && matchesSearch;
        });
      } else {
        // Keep existing articles even if they no longer match the filter (e.g. marked as read)
        // But add new articles that DO match the filter.
        // Also remove articles that were deleted from `articles`.
        
        const existingIds = new Set(prev.map(a => a.id));
        const currentArticleIds = new Set(articles.map(a => a.id));
        
        // 1. Keep articles that were in `prev` AND still exist in `articles`
        let nextDisplay = prev.filter(a => currentArticleIds.has(a.id));
        
        // 2. Add new articles that match the filter
        const newMatchingArticles = articles.filter(article => {
          if (existingIds.has(article.id)) return false; // Already handled
          
          let matchesFilter = true;
          if (filter === 'unread') matchesFilter = !article.isRead;
          else if (filter === 'favorites') matchesFilter = article.isFavorite;
          
          let matchesSearch = true;
          if (searchQuery) {
            const query = searchQuery.toLowerCase();
            matchesSearch = article.title.toLowerCase().includes(query) || 
                            (article.contentSnippet?.toLowerCase().includes(query) ?? false) ||
                            (article.content?.toLowerCase().includes(query) ?? false);
          }
          
          return matchesFilter && matchesSearch;
        });
        
        // Combine and sort by date descending
        nextDisplay = [...nextDisplay, ...newMatchingArticles].sort((a, b) => b.pubDate - a.pubDate);
        
        return nextDisplay;
      }
    });
  }, [filter, searchQuery, articles, isLoading]);

  const unreadCount = articles.filter(a => !a.isRead).length;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    const touch = e.touches[0];
    const distance = touch.clientY - (e.currentTarget as any)._startY || 0;
    if (distance > 0) {
      setPullDistance(Math.min(distance * 0.5, PULL_THRESHOLD + 20));
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance >= PULL_THRESHOLD) {
      refreshFeeds();
    }
    setIsPulling(false);
    setPullDistance(0);
  };

  return (
    <div 
      className={`min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col transition-colors ${
        settings.font === 'serif' ? 'font-serif' : 
        settings.font === 'mono' ? 'font-mono' : 'font-sans'
      }`}
      onTouchStart={(e) => {
        (e.currentTarget as any)._startY = e.touches[0].clientY;
        handleTouchStart(e);
      }}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to refresh indicator */}
      <div 
        className="fixed top-0 left-0 right-0 flex justify-center pointer-events-none z-50"
        style={{ transform: `translateY(${pullDistance - 40}px)`, opacity: pullDistance / PULL_THRESHOLD }}
      >
        <div className="bg-white dark:bg-gray-800 rounded-full p-2 shadow-lg border border-gray-100 dark:border-gray-700">
          <RefreshCw className={`w-6 h-6 text-indigo-600 dark:text-indigo-400 ${pullDistance >= PULL_THRESHOLD ? 'animate-spin' : ''}`} />
        </div>
      </div>

      {/* Sticky Header Group */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 shadow-sm transition-colors">
        {/* Top App Bar */}
        <header className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/50 rounded-2xl flex items-center justify-center shadow-inner relative">
              <Rss className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white dark:border-gray-900">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">flusso</h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsSearchOpen(true)} 
              className="p-2 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-600 dark:text-gray-300"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
        </header>

        {isSearchOpen && (
          <div className="px-4 py-3 flex items-center gap-2 border-t border-gray-100 dark:border-gray-800">
            <Search className="w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search articles..."
              className="flex-1 bg-transparent text-gray-900 dark:text-white focus:outline-none"
              autoFocus
            />
            <button onClick={() => { setSearchQuery(''); setIsSearchOpen(false); }} className="p-1 text-gray-500">
              <X className="w-5 h-5" />
            </button>
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

        {/* Filter Chips */}
        <div className="px-4 py-3 flex justify-center gap-2 overflow-x-auto no-scrollbar border-t border-gray-100 dark:border-gray-800">
          <button 
            onClick={() => setFilter('all')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filter === 'all' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-100' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          >
            All Articles
          </button>
          <button 
            onClick={() => setFilter('unread')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${filter === 'unread' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-100' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          >
            Unread {unreadCount > 0 && <span className="bg-indigo-200 dark:bg-indigo-800 text-indigo-900 dark:text-indigo-100 text-xs px-1.5 rounded-md ml-1">{unreadCount}</span>}
          </button>
          <button 
            onClick={() => setFilter('favorites')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filter === 'favorites' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-100' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          >
            Favorites
          </button>
        </div>
      </div>

      {/* Article List */}
      <main className="flex-1 overflow-y-auto pb-24">
        {displayArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400 px-6 text-center">
            <Inbox className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600" />
            <p className="text-lg font-medium text-gray-900 dark:text-white mb-1">No articles found</p>
            <p className="text-sm">
              {feeds.length === 0 
                ? "You haven't added any feeds yet. Open Settings to get started." 
                : "You're all caught up!"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {displayArticles.map(displayArticle => {
              // Get the latest state of the article from the main articles array
              const article = articles.find(a => a.id === displayArticle.id) || displayArticle;
              const feed = feeds.find(f => f.id === article.feedId);
              return (
                <SwipeableArticle 
                  key={article.id} 
                  article={article} 
                  feedName={feed?.title || 'Unknown Feed'}
                  onClick={() => {
                    setSelectedArticle(article);
                    if (!article.isRead) {
                      markAsRead(article.id);
                    }
                  }}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-4 z-30 items-center">
        <button 
          onClick={() => setIsSettingsModalOpen(true)}
          className="w-12 h-12 bg-indigo-50 dark:bg-gray-800 text-indigo-700 dark:text-indigo-300 rounded-xl shadow-md flex items-center justify-center hover:bg-indigo-100 dark:hover:bg-gray-700 active:scale-95 transition-transform"
          title="Settings"
        >
          <SettingsIcon className="w-5 h-5" />
        </button>
        <button 
          onClick={() => markAllAsRead()}
          className="w-14 h-14 bg-indigo-600 dark:bg-indigo-500 text-white rounded-2xl shadow-lg flex items-center justify-center hover:bg-indigo-700 dark:hover:bg-indigo-600 active:scale-95 transition-transform"
          title="Mark all as read"
        >
          <CheckSquare className="w-6 h-6" />
        </button>
      </div>

      {/* Modals & Overlays */}
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} />
      
      <AnimatePresence>
        {selectedArticle && (
          <ArticleReader 
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
      <MainContent />
    </RssProvider>
  );
}
