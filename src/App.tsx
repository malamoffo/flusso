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

import { useInView } from 'react-intersection-observer';

interface ArticleListProps {
  filter: 'inbox' | 'saved';
  typeFilter: 'all' | 'article' | 'podcast';
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

const ArticleList = ({
  filter, typeFilter, articles, feeds, settings, currentTrack, searchQuery, isSearchOpen,
  searchSourceFilter, searchDateRange, isLoading, forceRefresh,
  onSelectArticle, markAsRead, markArticlesAsRead, toggleFavorite, toggleQueue,
  setIsSettingsModalOpen, setSettingsInitialTab, refreshFeeds, handleVisibilityChange, bottomRef
}: ArticleListProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { ref: bottomInViewRef, inView: bottomInView } = useInView({
    threshold: 0.1,
  });

  const displayArticles = useMemo(() => {
    return articles.filter(article => {
      if (filter === 'saved' && !article.isFavorite && !article.isQueued) return false;
      if (typeFilter !== 'all' && article.type !== typeFilter) return false;
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
  }, [filter, typeFilter, searchQuery, searchSourceFilter, searchDateRange, isSearchOpen, articles]);

  const feedMap = useMemo(() => new Map(feeds.map(f => [f.id, f])), [feeds]);

  const handleRemove = useCallback((id: string) => {
    const article = displayArticles.find(a => a.id === id);
    if (article?.isFavorite) toggleFavorite(id);
    if (article?.isQueued) toggleQueue(id);
  }, [displayArticles, toggleFavorite, toggleQueue]);

  useEffect(() => {
    if (bottomInView && filter === 'inbox' && displayArticles.length > 0) {
      const unreadIds = displayArticles.filter(a => !a.isRead).map(a => a.id);
      if (unreadIds.length > 0) {
        markArticlesAsRead(unreadIds);
      }
    }
  }, [bottomInView, filter, displayArticles, markArticlesAsRead]);

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
                  onRemove={handleRemove}
                  isSavedSection={filter === 'saved'}
                  filter={filter}
                />
              );
            })}
          </AnimatePresence>
          <div ref={(node) => {
            if (bottomRef) (bottomRef as any).current = node;
            bottomInViewRef(node);
          }} className="h-20" />
        </div>
      )}
    </div>
  );
};

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
  const [typeFilter, setTypeFilter] = useState<'all' | 'article' | 'podcast'>('all');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchSourceFilter, setSearchSourceFilter] = useState('all');
  const [searchDateRange, setSearchDateRange] = useState('all');

  const savedCount = useMemo(() => articles.filter(a => a.isFavorite || a.isQueued).length, [articles]);

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

      <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
        <button onClick={() => setTypeFilter('all')} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap", typeFilter === 'all' ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700")}>
          <LayoutGrid className="w-3.5 h-3.5" /> All
        </button>
        <button onClick={() => setTypeFilter('article')} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap", typeFilter === 'article' ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700")}>
          <FileText className="w-3.5 h-3.5" /> Articles
        </button>
        <button onClick={() => setTypeFilter('podcast')} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap", typeFilter === 'podcast' ? "bg-indigo-600 text-white shadow-sm" : "bg-gray-800 text-gray-400 hover:bg-gray-700")}>
          <Headphones className="w-3.5 h-3.5" /> Podcasts
        </button>
      </div>

      <main className="flex-1 relative z-10 overflow-hidden">
        <div className={cn("absolute inset-0 transition-transform duration-300 ease-out", filter === 'inbox' ? "translate-x-0" : "translate-x-full")}>
          <ArticleList 
            filter="inbox" articles={articles} feeds={feeds} settings={settings} currentTrack={currentTrack}
            searchQuery={searchQuery} isSearchOpen={isSearchOpen} searchSourceFilter={searchSourceFilter} searchDateRange={searchDateRange}
            isLoading={isLoading} forceRefresh={forceRefresh} onSelectArticle={handleSelectArticle}
            markAsRead={markAsRead} markArticlesAsRead={markArticlesAsRead} toggleFavorite={toggleFavorite} toggleQueue={toggleQueue}
            setIsSettingsModalOpen={setIsSettingsModalOpen} setSettingsInitialTab={setSettingsInitialTab} refreshFeeds={refreshFeeds}
            handleVisibilityChange={handleVisibilityChange} bottomRef={bottomRefInbox} typeFilter={typeFilter}
          />
        </div>
        <div className={cn("absolute inset-0 transition-transform duration-300 ease-out", filter === 'saved' ? "translate-x-0" : "-translate-x-full")}>
          <ArticleList 
            filter="saved" articles={articles} feeds={feeds} settings={settings} currentTrack={currentTrack}
            searchQuery={searchQuery} isSearchOpen={isSearchOpen} searchSourceFilter={searchSourceFilter} searchDateRange={searchDateRange}
            isLoading={isLoading} forceRefresh={forceRefresh} onSelectArticle={handleSelectArticle}
            markAsRead={markAsRead} markArticlesAsRead={markArticlesAsRead} toggleFavorite={toggleFavorite} toggleQueue={toggleQueue}
            setIsSettingsModalOpen={setIsSettingsModalOpen} setSettingsInitialTab={setSettingsInitialTab} refreshFeeds={refreshFeeds}
            handleVisibilityChange={handleVisibilityChange} bottomRef={bottomRefSaved} typeFilter={typeFilter}
          />
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-800 flex justify-around py-1 px-3 z-20 bg-black safe-bottom">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setFilter('saved')} className={cn("relative p-2", filter === 'saved' ? 'text-[var(--theme-color)]' : 'text-gray-500')}>
          <Star className="w-6 h-6" />
          {savedCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-yellow-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center border border-black">
              {savedCount}
            </span>
          )}
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setFilter('inbox')} className={cn("relative p-2", filter === 'inbox' ? 'text-[var(--theme-color)]' : 'text-gray-500')}>
          <Inbox className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border border-black">
              {unreadCount}
            </span>
          )}
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
        {isMarkAllConfirmOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMarkAllConfirmOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-gray-900 border border-gray-800 rounded-[32px] p-8 w-full max-w-sm shadow-2xl"
            >
              <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <CheckSquare className="w-8 h-8 text-indigo-400" />
              </div>
              <h3 className="text-xl font-bold text-white text-center mb-2">Mark all as read?</h3>
              <p className="text-gray-400 text-center mb-8">This will mark all articles in your inbox as read. This action cannot be undone.</p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    markAllAsRead();
                    setIsMarkAllConfirmOpen(false);
                  }}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-colors shadow-lg shadow-indigo-500/20"
                >
                  Yes, mark all as read
                </button>
                <button 
                  onClick={() => setIsMarkAllConfirmOpen(false)}
                  className="w-full py-4 bg-gray-800 hover:bg-gray-700 text-white rounded-2xl font-bold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
