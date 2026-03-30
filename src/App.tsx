import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

import { RssProvider, useRss } from './context/RssContext';
import { AudioPlayerProvider, useAudioState } from './context/AudioPlayerContext';
import { SwipeableArticle } from './components/SwipeableArticle';
import { ArticleReader } from './components/ArticleReader';
import { SettingsModal } from './components/SettingsModal';
import { HeaderWidgets } from './components/HeaderWidgets';
import { PersistentPlayer } from './components/PersistentPlayer';
import { Article } from './types';
import { RefreshCw, Rss, Inbox, Settings as SettingsIcon, CheckSquare, Search, X, LayoutGrid, Star, Plus, FileText, Headphones, ListPlus, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './lib/utils';

import { App as CapacitorApp } from '@capacitor/app';

interface ArticleListProps {
  filter: 'inbox' | 'saved';
  articles: Article[];
  feeds: any[];
  settings: any;
  currentTrack: any;
  searchQuery: string;
  isSearchOpen: boolean;
  searchSourceFilter: string;
  searchDateRange: string;
  isLoading: boolean;
  forceRefresh: number;
  onSelectArticle: (article: Article) => void;
  markAsRead: (id: string) => void;
  markArticlesAsRead: (ids: string[]) => void;
  toggleFavorite: (id: string) => void;
  toggleQueue: (id: string) => void;
  setIsSettingsModalOpen: (open: boolean) => void;
  setSettingsInitialTab: (tab: any) => void;
  refreshFeeds: () => void;
  handleVisibilityChange: (id: string, inView: boolean) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}

const ArticleList = React.memo(({
  filter, articles, feeds, settings, currentTrack, searchQuery, isSearchOpen,
  searchSourceFilter, searchDateRange, isLoading, forceRefresh,
  onSelectArticle, markAsRead, markArticlesAsRead, toggleFavorite, toggleQueue,
  setIsSettingsModalOpen, setSettingsInitialTab, refreshFeeds, handleVisibilityChange, bottomRef
}: ArticleListProps) => {
  const [displayArticles, setDisplayArticles] = useState<Article[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const prevFilterRef = useRef(filter);
  const prevTypeFilterRef = useRef('all'); // simplified for this component
  const prevSearchRef = useRef(searchQuery);
  const prevSourceFilterRef = useRef(searchSourceFilter);
  const prevDateRangeRef = useRef(searchDateRange);
  const prevIsLoadingRef = useRef(isLoading);
  const prevForceRefreshRef = useRef(forceRefresh);

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
        return articles.filter(article => {
          if (filter === 'saved' && !article.isFavorite && !article.isQueued) return false;
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
                   (article.contentSnippet?.toLowerCase().includes(query) ?? false);
          }
          return true;
        });
      } else {
        const currentArticleIds = new Set(articles.map(a => a.id));
        const articlesMap = new Map(articles.map(a => [a.id, a]));
        return prev
          .filter(a => currentArticleIds.has(a.id))
          .map(a => articlesMap.get(a.id) || a);
      }
    });
  }, [filter, searchQuery, searchSourceFilter, searchDateRange, isSearchOpen, articles, isLoading, forceRefresh]);

  const feedMap = useMemo(() => new Map(feeds.map(f => [f.id, f])), [feeds]);

  return (
    <div ref={scrollRef} className="absolute inset-0 overflow-y-auto scrollbar-hide will-change-transform" style={{ paddingBottom: currentTrack ? 192 : 144, transform: 'translateZ(0)' }}>
      {displayArticles.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400 px-6 text-center mt-20">
          <Inbox className="w-16 h-16 mb-4 text-gray-600" />
          <p className="text-lg font-medium text-white mb-1">No articles found</p>
          {feeds.length === 0 && (
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setSettingsInitialTab('subscriptions'); setIsSettingsModalOpen(true); }} className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold">
              <Plus className="w-5 h-5" /> Add your first feed
            </motion.button>
          )}
        </div>
      ) : (
        <div className="flex-1">
          <AnimatePresence mode="popLayout">
            {displayArticles.map((article) => {
              const feed = feedMap.get(article.feedId);
              return (
                <SwipeableArticle 
                  key={article.id} 
                  article={article} 
                  feedName={feed?.title || 'Unknown Feed'}
                  feedImageUrl={feed?.imageUrl}
                  settings={settings}
                  onClick={onSelectArticle}
                  onMarkAsRead={markAsRead}
                  onVisibilityChange={handleVisibilityChange}
                  toggleRead={() => {}} // simplified
                  toggleFavorite={toggleFavorite}
                  toggleQueue={toggleQueue}
                  isSavedSection={filter === 'saved'}
                  filter={filter}
                />
              );
            })}
          </AnimatePresence>
          <div ref={bottomRef} className="h-20" />
        </div>
      )}
    </div>
  );
});

function MainContent() {
  const bottomRefInbox = useRef<HTMLDivElement>(null);
  const bottomRefSaved = useRef<HTMLDivElement>(null);
  const visibleArticlesRef = useRef<Set<string>>(new Set());

  const { articles, feeds, settings, isLoading, progress, error, refreshFeeds, toggleRead, markAsRead, markArticlesAsRead, markAllAsRead, searchQuery, setSearchQuery, unreadCount, toggleFavorite, toggleQueue } = useRss();
  const { currentTrack } = useAudioState();

  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'settings' | 'subscriptions' | 'about' | undefined>(undefined);
  const [isMarkAllConfirmOpen, setIsMarkAllConfirmOpen] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(0);
  const [filter, setFilter] = useState<'inbox' | 'saved'>('inbox');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchSourceFilter, setSearchSourceFilter] = useState('all');
  const [searchDateRange, setSearchDateRange] = useState('all');

  const handleVisibilityChange = useCallback((id: string, inView: boolean) => {
    if (inView) visibleArticlesRef.current.add(id);
    else visibleArticlesRef.current.delete(id);
  }, []);

  const handleSelectArticle = useCallback((article: Article) => {
    setSelectedArticle(article);
    if (!article.isRead && article.type !== 'podcast') markAsRead(article.id);
  }, [markAsRead]);

  // Handle Android back button
  useEffect(() => {
    const backListener = CapacitorApp.addListener('backButton', () => {
      if (selectedArticle) setSelectedArticle(null);
      else if (isSettingsModalOpen) setIsSettingsModalOpen(false);
      else if (isSearchOpen) setIsSearchOpen(false);
      else if (filter !== 'inbox') setFilter('inbox');
      else CapacitorApp.exitApp();
    });
    return () => { backListener.then(l => l.remove()); };
  }, [selectedArticle, isSettingsModalOpen, isSearchOpen, filter]);

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-black font-sans" style={{ '--theme-color': settings.themeColor } as React.CSSProperties}>
      <header className="sticky top-0 z-20 bg-black px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-900/50 rounded-2xl flex items-center justify-center shadow-inner"><Rss className="w-6 h-6 text-indigo-400" /></div>
          <h1 className="text-xl font-bold text-white tracking-tight">flusso</h1>
        </div>
        <div className="flex items-center gap-2">
          <HeaderWidgets />
          <button onClick={() => setIsSearchOpen(true)} className="p-2 rounded-full hover:bg-indigo-900/30 text-gray-300"><Search className="w-5 h-5" /></button>
        </div>
      </header>

      <main className="flex-1 relative z-10 overflow-hidden">
        <div className={cn("absolute inset-0 transition-transform duration-300 ease-out", filter === 'inbox' ? "translate-x-0" : "-translate-x-full")}>
          <ArticleList 
            filter="inbox" articles={articles} feeds={feeds} settings={settings} currentTrack={currentTrack}
            searchQuery={searchQuery} isSearchOpen={isSearchOpen} searchSourceFilter={searchSourceFilter} searchDateRange={searchDateRange}
            isLoading={isLoading} forceRefresh={forceRefresh} onSelectArticle={handleSelectArticle}
            markAsRead={markAsRead} markArticlesAsRead={markArticlesAsRead} toggleFavorite={toggleFavorite} toggleQueue={toggleQueue}
            setIsSettingsModalOpen={setIsSettingsModalOpen} setSettingsInitialTab={setSettingsInitialTab} refreshFeeds={refreshFeeds}
            handleVisibilityChange={handleVisibilityChange} bottomRef={bottomRefInbox}
          />
        </div>
        <div className={cn("absolute inset-0 transition-transform duration-300 ease-out", filter === 'saved' ? "translate-x-0" : "translate-x-full")}>
          <ArticleList 
            filter="saved" articles={articles} feeds={feeds} settings={settings} currentTrack={currentTrack}
            searchQuery={searchQuery} isSearchOpen={isSearchOpen} searchSourceFilter={searchSourceFilter} searchDateRange={searchDateRange}
            isLoading={isLoading} forceRefresh={forceRefresh} onSelectArticle={handleSelectArticle}
            markAsRead={markAsRead} markArticlesAsRead={markArticlesAsRead} toggleFavorite={toggleFavorite} toggleQueue={toggleQueue}
            setIsSettingsModalOpen={setIsSettingsModalOpen} setSettingsInitialTab={setSettingsInitialTab} refreshFeeds={refreshFeeds}
            handleVisibilityChange={handleVisibilityChange} bottomRef={bottomRefSaved}
          />
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-800 flex justify-around pt-3 pb-10 px-3 z-20 bg-black safe-bottom">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setFilter('saved')} className={cn("relative p-2", filter === 'saved' ? 'text-[var(--theme-color)]' : 'text-gray-500')}>
          <Star className="w-6 h-6" />
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setFilter('inbox')} className={cn("relative p-2", filter === 'inbox' ? 'text-[var(--theme-color)]' : 'text-gray-500')}>
          <Inbox className="w-6 h-6" />
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setIsSettingsModalOpen(true)} className="text-gray-500 p-2"><SettingsIcon className="w-6 h-6" /></motion.button>
      </div>

      <div className={cn("fixed right-6 flex flex-col gap-4 z-30 items-center transition-all duration-300", currentTrack ? "bottom-48" : "bottom-32")}>
        {filter === 'inbox' && (
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => refreshFeeds()} disabled={isLoading} className={cn("w-10 h-10 bg-gray-800 text-indigo-400 rounded-xl shadow-lg flex items-center justify-center", isLoading ? "animate-spin opacity-50" : "")}>
            <RefreshCw className="w-5 h-5" />
          </motion.button>
        )}
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setIsMarkAllConfirmOpen(true)} className="w-14 h-14 bg-indigo-500 text-white rounded-2xl shadow-lg flex items-center justify-center"><CheckSquare className="w-6 h-6" /></motion.button>
      </div>

      <SettingsModal isOpen={isSettingsModalOpen} initialTab={settingsInitialTab} onClose={() => { setIsSettingsModalOpen(false); setSettingsInitialTab(undefined); }} />
      <AnimatePresence>
        {selectedArticle && (
          <ArticleReader 
            key={selectedArticle.id} article={selectedArticle} onClose={() => setSelectedArticle(null)} onSelectArticle={setSelectedArticle}
            hasNext={articles.findIndex(a => a.id === selectedArticle.id) < articles.length - 1}
            hasPrev={articles.findIndex(a => a.id === selectedArticle.id) > 0}
          />
        )}
      </AnimatePresence>
      <PersistentPlayer onNavigate={setSelectedArticle} />
    </div>
  );
}

export default function App() {
  return (
    <RssProvider>
      <AudioPlayerProvider>
        <MainContent />
      </AudioPlayerProvider>
    </RssProvider>
  );
}
