import React, { useState, useEffect, useRef, useCallback, useMemo, memo, useDeferredValue, RefObject } from 'react';
import { useRss } from './context/RssContext';
import { useSettings } from './context/SettingsContext';
import { useReddit } from './context/RedditContext';
import { useFeedFiltering } from './hooks/useFeedFiltering';
import { usePagination } from './hooks/usePagination';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useAutoMarkVisibleItemsAsRead } from './hooks/useAutoMarkVisibleItemsAsRead';
import { FeedList } from './components/App/FeedList';
import { SwipeableArticleItem } from './components/SwipeableArticleItem';
import { createLazyModalWithState, createLazyView, ModalFallback, ViewFallback } from './lib/lazyLoader';
import { SwipeableRedditPost } from './components/SwipeableRedditPost';
import { storage } from './services/storage';
import { RedditListView } from './components/RedditListView';
import { ErrorNotification } from './components/ErrorNotification';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';

const SettingsModal = createLazyModalWithState(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })), 'SettingsModal', ModalFallback);
const RadioView = createLazyModalWithState(() => import('./components/RadioView').then(m => ({ default: m.RadioView })), 'RadioView', ViewFallback);
const ArticleReader = createLazyView(() => import('./components/ArticleReader').then(m => ({ default: m.ArticleReader })), 'ArticleReader', ModalFallback);
const RedditPostReader = createLazyView(() => import('./components/RedditPostReader').then(m => ({ default: m.RedditPostReader })), 'RedditPostReader', ModalFallback);
const ImageViewer = createLazyView(() => import('./components/ImageViewer').then(m => ({ default: m.ImageViewer })), 'ImageViewer', ModalFallback);
const ErrorModal = createLazyView(() => import('./components/ErrorModal').then(m => ({ default: m.ErrorModal })), 'ErrorModal', ModalFallback);
const InAppWebView = createLazyView(() => import('./components/InAppWebView').then(m => ({ default: m.InAppWebView })), 'InAppWebView', ModalFallback);
import { Loader2, Search, X, Check, Rss, Settings, Star, CheckCircle2, RefreshCw, Layers, FileText, Inbox, MessageSquare, ChevronDown, Flame, Radio } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { cn, getHostname } from './lib/utils';
import { Article, Feed } from './types';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { useAndroidBackNavigation } from './hooks/useAndroidBackNavigation';
import { deduplicateAndSortSavedArticles } from './utils/articleUtils';
import { LcarsLayout } from './components/LcarsLayout';

const PAGE_SIZE = 30;

const ProgressBanner = memo(({ filter }: { filter: string }) => {
  const { progress } = useRss();
  if (!progress || filter === 'radio') return null;
  
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
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isAtTop = useRef(true);

  const {
    articles, feeds, isLoading, error, setError, failedFeeds, clearFailedFeeds, 
    refreshFeeds, toggleRead, markAsRead, markArticlesAsRead,
    markAllAsRead, markFilteredArticlesAsRead, searchQuery, setSearchQuery, unreadCount, savedCount,
    toggleFavorite, removeFromSaved, removeArticle, addArticle, loadAllUnreadArticles
  } = useRss();

  const { settings } = useSettings();

  const {
    isLoading: isRedditLoading,
    subreddits, redditPosts, redditSort, handleRedditSortChange,
    refreshReddit, loadMoreReddit, markRedditAsRead, markRedditPostsAsRead, toggleRedditRead, toggleRedditFavorite,
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

  const nonRedditFeeds = useMemo(() => {
    return sortedFeeds.filter(f => {
      const hostname = getHostname(f.feedUrl);
      return hostname !== 'reddit.com' && !hostname.endsWith('.reddit.com');
    });
  }, [sortedFeeds]);

  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);

  useEffect(() => {
    // Idle prefetch for lazy loaded components
    if (typeof window !== 'undefined') {
      const doPrefetch = () => {
        try {
          (SettingsModal as any).prefetch();
          (RadioView as any).prefetch();
          (ArticleReader as any).prefetch();
          (RedditPostReader as any).prefetch();
          (ImageViewer as any).prefetch();
          (ErrorModal as any).prefetch();
          (InAppWebView as any).prefetch();
        } catch (e) {}
      };
      
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(doPrefetch);
      } else {
        setTimeout(doPrefetch, 2000);
      }
    }
  }, []);

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor) {
        const href = anchor.getAttribute('href');
        if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//'))) {
          e.preventDefault();
          e.stopPropagation();
          if (Capacitor.isNativePlatform()) {
            Browser.open({ url: href }).catch(err => {
              console.error('Error opening native browser:', err);
              setWebViewUrl(href);
            });
          } else {
            setWebViewUrl(href);
          }
        }
      }
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
    };
  }, []);
  const [selectedRedditPost, setSelectedRedditPost] = useState<any | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'main' | 'subscriptions' | 'about' | 'general' | undefined>(undefined);
  const [isMarkAllReadOpen, setIsMarkAllReadOpen] = useState(false);
  const [temporarilyVisibleUnreadIds, setTemporarilyVisibleUnreadIds] = useState<Set<string>>(new Set());
  const [visibleInboxArticleIds, setVisibleInboxArticleIds] = useState<Set<string>>(new Set());
  const visibleInboxArticleIdsRef = useRef<Set<string>>(new Set());
  const [visibleRedditPostIds, setVisibleRedditPostIds] = useState<Set<string>>(new Set());
  const visibleRedditPostIdsRef = useRef<Set<string>>(new Set());
  
  const handleVisibilityChange = useCallback((id: string, isVisible: boolean) => {
    setVisibleInboxArticleIds(prev => {
      const next = new Set(prev);
      if (isVisible) next.add(id);
      else next.delete(id);
      visibleInboxArticleIdsRef.current = next; // Sync the ref
      return next;
    });
  }, []);

  const handleRedditVisibilityChange = useCallback((id: string, isVisible: boolean) => {
    setVisibleRedditPostIds(prev => {
      const next = new Set(prev);
      if (isVisible) next.add(id);
      else next.delete(id);
      visibleRedditPostIdsRef.current = next; // Sync the ref
      return next;
    });
  }, []);
  
  const [filter, setFilter] = useState<'inbox' | 'saved' | 'reddit' | 'radio'>('inbox');
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

  useEffect(() => {
    // Sync retroTheme class with document.body in real-time
    document.body.classList.remove('retro-apple-ii', 'retro-c64', 'retro-lcars', 'retro-e-ink', 'retro-scumm');
    if (settings.retroTheme === 'c64') {
      document.body.classList.add('retro-c64');
    } else if (settings.retroTheme === 'lcars') {
      document.body.classList.add('retro-lcars');
    }
    return () => {
      document.body.classList.remove('retro-apple-ii', 'retro-c64', 'retro-lcars', 'retro-e-ink', 'retro-scumm');
    };
  }, [settings.retroTheme]);

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
  
  const [inboxUnreadOnly, setInboxUnreadOnly] = useState(false);
  const [savedUnreadOnly, setSavedUnreadOnly] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [subredditFilter, setSubredditFilter] = useState<string>('all');

  const filteredRedditPosts = useMemo(() => {
    const query = deferredSearchQuery.toLowerCase();
    const filtered = redditPosts.filter(post => {
      if (subredditFilter !== 'all' && post.subredditId !== subredditFilter) return false;
      if (query) {
        const matchesQuery = post.title.toLowerCase().includes(query) || 
                            (post.subredditName?.toLowerCase().includes(query) ?? false) ||
                            (post.selftextHtml?.toLowerCase().includes(query) ?? false);
        if (!matchesQuery) return false;
      }
      return true;
    });

    // ⚡ Bolt: RedditPosts are already sorted by the RedditContext.
    // We avoid redundant O(N log N) sorting here.
    return filtered;
  }, [redditPosts, deferredSearchQuery, redditSort, subredditFilter]);

  useEffect(() => {
    resetPagination();
  }, [filter, deferredSearchQuery, inboxUnreadOnly, savedUnreadOnly, sourceFilter, timeFilter]);

  useEffect(() => {
    if (filter === 'reddit' && subreddits.length > 0) {
      refreshReddit();
    }
  }, [filter]);

  const {
    pullProgressTransform,
    pullOpacity,
    isPulling,
    handleTouchStart: hookHandleTouchStart,
    handleTouchMove: hookHandleTouchMove,
    handleTouchEnd: hookHandleTouchEnd
  } = usePullToRefresh({
    onRefresh: refreshFeeds,
    isLoading,
    isDisabled: isSettingsOpen || filter === 'reddit' || filter === 'saved' || filter === 'radio' || !!selectedArticle || !!selectedRedditPost,
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
    setSubredditFilter('all');

    // Clean up readers and enforce retention when switching tabs
    if (selectedRedditPost) {
      setSelectedRedditPost(null);
      enforceRedditRetention();
    }
    if (selectedArticle) {
      setSelectedArticle(null);
    }

    // Reset temporary visibility when changing tabs
    setTemporarilyVisibleUnreadIds(new Set());
    setSearchQuery('');
    setIsSearchOpen(false);
  }, [filter]);

  const handleFilterChange = (newFilter: 'inbox' | 'saved' | 'reddit' | 'radio') => {
    if (newFilter === filter) {
      if (filter === 'inbox') {
        handleTypeFilterChange('unread');
      } else if (filter === 'saved') {
        if (savedScrollRef.current) {
          savedScrollRef.current.scrollTop = 0;
        }
      } else if (filter === 'reddit') {
        const nextSort = redditSort === 'new' ? 'hot' : 'new';
        handleRedditSortChange(nextSort);
        if (redditScrollRef.current) {
          redditScrollRef.current.scrollTop = 0;
        }
      }
      return;
    }
    
    // Batch updates
    setFilter(newFilter);
    if (newFilter === 'inbox') {
      setInboxUnreadOnly(false);
    } else if (newFilter === 'reddit') {
      handleRedditSortChange('new');
    }
  };

  const handleTypeFilterChange = (newType: 'unread') => {
    if (filter === 'inbox') {
      if (newType === 'unread') {
        const nextValue = !inboxUnreadOnly;
        setInboxUnreadOnly(nextValue);
        
        if (nextValue) {
          loadAllUnreadArticles();
          setTemporarilyVisibleUnreadIds(new Set());
        }
        
        // Clear temporary visibility when explicitly disabling the unread filter
        if (!nextValue) {
          setTemporarilyVisibleUnreadIds(new Set());
          // Optional: we might want to reset pagination here if we were showing everything
          resetPagination(); 
        }
      }
      if (inboxScrollRef.current) inboxScrollRef.current.scrollTop = 0;
    } else {
      if (newType === 'unread') {
        setSavedUnreadOnly(!savedUnreadOnly);
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

  useAndroidBackNavigation({
    selectedImage,
    setSelectedImage,
    webViewUrl,
    setWebViewUrl,
    selectedArticle,
    setSelectedArticle,
    selectedRedditPost,
    setSelectedRedditPost,
    enforceRedditRetention,
    isSettingsOpen,
    setIsSettingsOpen,
    setSettingsTab,
    isSearchOpen,
    setIsSearchOpen,
    searchQuery,
    setSearchQuery,
    setSourceFilter,
    setTimeFilter,
    filter,
    handleFilterChange,
  });

  const markAsReadWithPersistence = useCallback((id: string) => {
    if (filter === 'inbox' && inboxUnreadOnly) {
      setTemporarilyVisibleUnreadIds(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
    markAsRead(id);
  }, [markAsRead, filter, inboxUnreadOnly]);

  const toggleReadWithPersistence = useCallback((id: string) => {
    if (filter === 'inbox' && inboxUnreadOnly) {
      setTemporarilyVisibleUnreadIds(prev => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
    toggleRead(id);
  }, [toggleRead, filter, inboxUnreadOnly]);

  const markArticlesAsReadWithPersistence = useCallback((ids: string[]) => {
    if (filter === 'inbox' && inboxUnreadOnly) {
      setTemporarilyVisibleUnreadIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.add(id));
        return next;
      });
    }
    markArticlesAsRead(ids);
  }, [markArticlesAsRead, filter, inboxUnreadOnly]);

  const { inboxArticles, savedArticles } = useFeedFiltering({
    articles,
    inboxUnreadOnly,
    savedUnreadOnly: false, // Ensure all saved articles are always shown
    deferredSearchQuery,
    sourceFilter,
    timeFilter,
    isSearchOpen,
    temporarilyVisibleUnreadIds
  });

  /**
   * ⚡ Bolt: Memoize the saved list deduplicated and sorted using helper utility.
   */
  const memoizedSavedArticles = useMemo(() => {
    return deduplicateAndSortSavedArticles(savedArticles);
  }, [savedArticles]);

  const { visibleCount, loadMore: loadMoreArticles, hasMore: hasMoreArticles, reset: resetPagination } = usePagination(
    filter === 'inbox' ? inboxArticles.length : memoizedSavedArticles.length
  );

  /**
   * ⚡ Bolt: Optimize article navigation by pre-calculating the active list and current index.
   * This avoids repeated O(N) findIndex calls on every render and navigation event.
   */
  const activeArticles = useMemo(() => (filter === 'inbox' ? inboxArticles : memoizedSavedArticles), [filter, inboxArticles, memoizedSavedArticles]);
  
  const visibleArticles = useMemo(() => activeArticles.slice(0, visibleCount), [activeArticles, visibleCount]);

  const activeIndex = useMemo(() => {
    if (!selectedArticle) return -1;
    return activeArticles.findIndex(a => a.id === selectedArticle.id);
  }, [selectedArticle, activeArticles]);

  const currentSelectedArticle = useMemo(() => {
    if (!selectedArticle) return null;
    return articles.find(a => a.id === selectedArticle.id) || selectedArticle;
  }, [articles, selectedArticle]);

  const hasNextArticle = useMemo(() => {
    return activeIndex !== -1 && activeIndex < activeArticles.length - 1;
  }, [activeIndex, activeArticles.length]);

  const hasPrevArticle = useMemo(() => {
    return activeIndex > 0;
  }, [activeIndex]);

  const activeRedditIndex = useMemo(() => {
    if (!selectedRedditPost) return -1;
    return redditPosts.findIndex(p => p.id === selectedRedditPost.id);
  }, [redditPosts, selectedRedditPost]);

  const hasNextReddit = useMemo(() => {
    return activeRedditIndex !== -1 && activeRedditIndex < redditPosts.length - 1;
  }, [activeRedditIndex, redditPosts.length]);

  const hasPrevReddit = useMemo(() => {
    return activeRedditIndex > 0;
  }, [activeRedditIndex]);


  // Centralized auto-marking for inbox articles on scroll/bottom
  useAutoMarkVisibleItemsAsRead({
    containerRef: inboxScrollRef,
    items: inboxArticles,
    visibleIdsSetRef: visibleInboxArticleIdsRef,
    enabled: filter === 'inbox',
    hasMore: hasMoreArticles,
    bottomThreshold: 50,
    delay: 5000,
    mode: 'visible-only',
    onMarkAsRead: markArticlesAsReadWithPersistence
  });

  // Centralized auto-marking for saved articles on scroll/bottom
  useAutoMarkVisibleItemsAsRead({
    containerRef: savedScrollRef,
    items: memoizedSavedArticles,
    enabled: filter === 'saved',
    hasMore: hasMoreArticles,
    bottomThreshold: 5,
    delay: 5000,
    mode: 'all-unread',
    onMarkAsRead: markArticlesAsRead
  });

  // Centralized auto-marking for Reddit posts on scroll/bottom
  useAutoMarkVisibleItemsAsRead({
    containerRef: redditScrollRef,
    items: redditPosts,
    visibleIdsSetRef: visibleRedditPostIdsRef,
    enabled: filter === 'reddit',
    hasMore: isRedditLoading,
    bottomThreshold: 5,
    delay: 5000,
    mode: 'visible-only',
    onMarkAsRead: markRedditPostsAsRead
  });

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>, filterType: 'inbox' | 'saved' | 'reddit') => {
    const container = e.currentTarget;
    isAtTop.current = container.scrollTop <= 0;
    setHeaderScrolled(container.scrollTop > 20);
  }, []);

  const handleArticleClick = useCallback((article: Article) => {
    setSelectedArticle(article);
    if (!article.isRead) {
      markAsReadWithPersistence(article.id);
    }
  }, [markAsReadWithPersistence]);

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

  const blobColors = useMemo(() => {
    switch (filter) {
      case 'saved': return ['bg-yellow-500/60', 'bg-amber-500/50', 'bg-yellow-400/50', 'bg-orange-500/40'];
      case 'reddit': return ['bg-purple-500/60', 'bg-fuchsia-500/50', 'bg-violet-500/50', 'bg-purple-400/40'];
      case 'radio': return ['bg-red-500/60', 'bg-orange-500/50', 'bg-rose-500/50', 'bg-red-400/40'];
      case 'inbox':
      default: return ['bg-blue-500/60', 'bg-indigo-500/50', 'bg-sky-500/50', 'bg-blue-400/40'];
    }
  }, [filter]);
  const [blob1, blob2, blob3, blob4] = blobColors;

  const handleAppTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    
    // Check if the touch target or any parent is a card, interactive, or modal element
    let current: HTMLElement | null = target;
    let isInsideItemOrCard = false;
    
    while (current && current !== e.currentTarget) {
      const tagName = current.tagName;
      const classList = current.classList;
      
      if (
        ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(tagName) || 
        current.getAttribute('role') === 'button'
      ) {
        isInsideItemOrCard = true;
        break;
      }
      
      if (
        classList.contains('swipeable-item') ||
        classList.contains('reddit-card') ||
        classList.contains('station-card') ||
        classList.contains('active-reader') ||
        classList.contains('settings-modal') ||
        classList.contains('custom-modal') ||
        tagName === 'LI' ||
        current.id === 'article-reader-content' ||
        // Check general relative item wrappers
        (classList.contains('relative') && classList.contains('w-full') && current.querySelector('.rounded-3xl') !== null)
      ) {
        isInsideItemOrCard = true;
        break;
      }
      
      current = current.parentElement;
    }

    if (isInsideItemOrCard) {
      touchStartX.current = 0;
      touchStartY.current = 0;
    } else {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    }
    hookHandleTouchStart(e);
  };

  const handleAppTouchMove = (e: React.TouchEvent) => {
    hookHandleTouchMove(e);
  };

  const handleAppTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === 0) {
      hookHandleTouchEnd();
      return;
    }

    hookHandleTouchEnd();
  };

  if (settings.retroTheme === 'lcars') {
    return (
      <LcarsLayout
        filter={filter}
        onFilterChange={handleFilterChange}
        unreadCount={unreadCount}
        savedCount={savedCount}
        redditUnreadCount={redditUnreadCount}
        onOpenSettings={() => {
          setSettingsTab(undefined);
          setIsSettingsOpen(true);
        }}
        onOpenAddFeed={() => {
          setSettingsTab('subscriptions');
          setIsSettingsOpen(true);
        }}
        onRefresh={() => {
          if (filter === 'reddit') refreshReddit();
          else refreshFeeds();
        }}
        onMarkAllRead={() => setIsMarkAllReadOpen(true)}
        isRefreshing={isLoading || isRedditLoading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      >
        <div className="flex-1 relative overflow-hidden h-full">
          <div 
            ref={inboxScrollRef}
            onScroll={(e) => handleScroll(e, 'inbox')}
            className={cn(
              "absolute inset-0 overflow-y-auto pb-8 pt-0 scroll-smooth transition-opacity duration-300 transform-gpu will-change-scroll scrollbar-hide",
              filter === 'inbox' ? "z-10 opacity-100 pointer-events-auto" : "z-0 opacity-0 pointer-events-none"
            )}
          >
            <FeedList
              articles={filter === 'inbox' ? visibleArticles : []}
              feedsMap={feedsMap}
              settings={settings}
              handleArticleClick={handleArticleClick}
              markAsRead={markAsReadWithPersistence}
              toggleRead={toggleReadWithPersistence}
              toggleFavorite={toggleFavorite}
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
              "absolute inset-0 overflow-y-auto pb-8 pt-0 scroll-smooth transition-opacity duration-300 transform-gpu will-change-scroll scrollbar-hide",
              filter === 'saved' ? "z-10 opacity-100 pointer-events-auto" : "z-0 opacity-0 pointer-events-none"
            )}
          >
            <div className="flex-1 max-w-3xl mx-auto px-2 py-2 space-y-1">
              <AnimatePresence initial={false} mode="sync">
                {(filter === 'saved' ? visibleArticles : [])
                  .map(item => (
                    <SwipeableArticleItem
                      key={item.id}
                      article={item as any}
                      feedName={feedsMap.get((item as any).feedId)?.title || 'Unknown Feed'}
                      feedImageUrl={feedsMap.get((item as any).feedId)?.imageUrl}
                      settings={settings}
                      onClick={handleArticleClick}
                      onMarkAsRead={markAsReadWithPersistence}
                      toggleRead={toggleReadWithPersistence}
                      toggleFavorite={toggleFavorite}
                      onRemove={handleRemoveArticle}
                      isSavedSection={true}
                      filter="saved"
                    />
                  ))}
              </AnimatePresence>
              {savedCount === 0 && (
                <div className="flex flex-col items-center justify-center h-64 text-[#ffcc99] px-6 text-center">
                  <Star className="w-16 h-16 mb-4 text-[#ffcc00]" />
                  <p className="text-lg font-bold text-[#ff9900] mb-1 uppercase tracking-wider">NO SAVED DATA FILES</p>
                  <p className="text-xs text-[#ffcc99]">SWIPE ITEM TO ARCHIVE IN TACTICAL MEMORY.</p>
                </div>
              )}
              <div className="h-20 flex items-center justify-center">
                {hasMoreArticles && (
                  <Loader2 className="w-6 h-6 text-[#ff9900] animate-spin" />
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
            onVisibilityChange={handleRedditVisibilityChange}
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
          <RadioView
            isActive={filter === 'radio'}
            searchQuery={searchQuery}
          />
        </div>

        {/* Modals & Portal views in LCARS mode */}
        {selectedImage && (
          <ImageViewer imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
        )}
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            initialTab={settingsTab}
            onClose={() => {
              setIsSettingsOpen(false);
              setSettingsTab(undefined);
            }}
            onSelectArticle={(article) => setSelectedArticle(article)}
          />
        )}
        <AnimatePresence mode="wait">
          {selectedRedditPost && (
            <RedditPostReader
              key="reddit-modal-lcars"
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
              sourceFilter={filter}
            />
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          {currentSelectedArticle && (
            <ArticleReader
              key="article-modal-lcars"
              article={currentSelectedArticle}
              onClose={() => setSelectedArticle(null)}
              onSelectArticle={(a) => setSelectedArticle(a)}
              onNext={hasNextArticle ? () => {
                const next = activeArticles[activeIndex + 1];
                setSelectedArticle(next);
                if (!next.isRead) markAsReadWithPersistence(next.id);
              } : undefined}
              onPrev={hasPrevArticle ? () => {
                const prev = activeArticles[activeIndex - 1];
                setSelectedArticle(prev);
                if (!prev.isRead) markAsReadWithPersistence(prev.id);
              } : undefined}
              hasNext={hasNextArticle}
              hasPrev={hasPrevArticle}
              sourceFilter={filter}
            />
          )}
        </AnimatePresence>
        <ErrorNotification error={error} onClear={() => setError(null)} />
        <AnimatePresence mode="wait">
          {webViewUrl && (
            <InAppWebView
              url={webViewUrl}
              onClose={() => setWebViewUrl(null)}
            />
          )}
        </AnimatePresence>
        {isMarkAllReadOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-black border-2 border-[#ff9900] rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4 text-[#ffcc99]"
            >
              <h3 className="text-base font-black text-[#ff9900] uppercase tracking-wider">COMMAND CONFIRMATION</h3>
              <p className="text-xs uppercase">MARK ALL DATA ITEMS AS READ IN CURRENT TRANSMISSION DECK?</p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsMarkAllReadOpen(false)}
                  className="px-4 py-2 bg-[#ffcc99] text-black font-extrabold text-xs rounded-full uppercase hover:bg-[#ffaa66]"
                >
                  ABORT
                </button>
                <button
                  onClick={async () => {
                    if (filter === 'inbox') {
                      const DAY_MS = 1000 * 60 * 60 * 24;
                      let threshold = 0;
                      if (timeFilter === 'today') threshold = Date.now() - DAY_MS;
                      if (timeFilter === 'week') threshold = Date.now() - (DAY_MS * 7);
                      if (timeFilter === 'month') threshold = Date.now() - (DAY_MS * 30);

                      await markFilteredArticlesAsRead({
                        feedId: sourceFilter === 'all' ? undefined : sourceFilter,
                        searchQuery: searchQuery || undefined,
                        timeThreshold: threshold || undefined
                      });
                    } else if (filter === 'saved') {
                      const toMark = savedArticles.reduce<string[]>((acc, a) => {
                        if (!a.isRead) acc.push(a.id);
                        return acc;
                      }, []);                      
                      if (toMark.length > 0) {
                        await markArticlesAsRead(toMark);
                      }
                    } else if (filter === 'reddit') {
                      const toMark = redditPosts.reduce<string[]>((acc, p) => {
                        if (!p.isRead) acc.push(p.id);
                        return acc;
                      }, []);                      
                      if (toMark.length > 0) {
                        await markRedditPostsAsRead(toMark);
                      }
                    }
                    setIsMarkAllReadOpen(false);
                  }}
                  className="px-4 py-2 bg-[#cc3333] text-white font-extrabold text-xs rounded-full uppercase hover:bg-[#ff3333]"
                >
                  EXECUTE
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </LcarsLayout>
    );
  }

  return (
    <div 
      className="h-[100dvh] overflow-hidden flex flex-col transition-colors duration-500 font-sans relative bg-[#0A0A10]"
      style={{ 
        '--theme-color': settings.themeColor,
        '--theme-color-rgb': themeColorRgb
      } as React.CSSProperties}
      onTouchStart={handleAppTouchStart}
      onTouchMove={handleAppTouchMove}
      onTouchEnd={handleAppTouchEnd}
    >
      <div className="fixed inset-0 z-[0] pointer-events-none overflow-hidden">
        <div className={cn("absolute -top-[10%] -left-[10%] w-[70vw] h-[70vh] rounded-full blur-[80px] opacity-100 transition-colors duration-700 transform-gpu", blob1)} />
        <div className={cn("absolute top-[20%] -right-[10%] w-[60vw] h-[60vh] rounded-full blur-[80px] opacity-100 transition-colors duration-700 delay-100 transform-gpu", blob2)} />
        <div className={cn("absolute -bottom-[10%] left-[10%] w-[60vw] h-[60vh] rounded-full blur-[80px] opacity-90 transition-colors duration-700 delay-200 transform-gpu", blob3)} />
        <div className={cn("absolute bottom-[10%] right-[20%] w-[70vw] h-[70vh] rounded-full blur-[80px] opacity-90 transition-colors duration-700 transform-gpu", blob4)} />
      </div>
      {filter !== 'reddit' && (
        <motion.div 
          className="absolute top-0 left-0 right-0 flex justify-center py-2 pointer-events-none z-30"
          style={{ y: pullProgressTransform, opacity: pullOpacity }}
        >
          <div className="bg-gray-900 rounded-full p-2 shadow-lg border border-gray-800">
            <RefreshCw className={cn("w-5 h-5 text-blue-500", isLoading ? "animate-spin" : "")} />
          </div>
        </motion.div>
      )}

      <div className={cn("relative z-10 sticky top-0 transition-all duration-300", headerScrolled ? "bg-white/5 dark:bg-black/20 backdrop-blur-xl border-b border-white/10 dark:border-white/5 shadow-lg py-2" : "bg-transparent border-b border-transparent py-2")}>
        <header className="px-4 flex items-center justify-between">
           <motion.button 
            whileTap={{ scale: 0.95 }}
            onClick={scrollToTop}
            className="flex items-center gap-3 active:opacity-70 transition-opacity focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg px-1 outline-none"
            aria-label="Scroll to top"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center relative transition-colors" style={{ backgroundColor: filter === 'radio' ? 'rgba(239, 68, 68, 0.1)' : filter === 'reddit' ? 'rgba(147, 51, 234, 0.1)' : filter === 'saved' ? 'rgba(234, 179, 8, 0.1)' : 'rgba(37, 99, 235, 0.1)' }}>
              {filter === 'radio' ? (
                <Radio className="w-6 h-6 transition-colors text-red-600 dark:text-red-400" />
              ) : (
                <Rss className={cn("w-6 h-6 transition-colors", filter === 'reddit' ? "text-purple-600 dark:text-purple-400" : filter === 'saved' ? "text-yellow-600 dark:text-yellow-400" : "text-blue-600 dark:text-blue-400")} />
              )}
            </div>
            <div className="flex items-baseline gap-4">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">flusso</h1>
            </div>
          </motion.button>
          <div className="flex items-center gap-2">
            <AnimatePresence mode="wait">
              {filter === 'inbox' && (
                <motion.div
                  key="inbox-status"
                  initial={{ opacity: 0, scale: 0.9, y: -2 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 2 }}
                  transition={{ duration: 0.15 }}
                  className="text-[10px] font-bold uppercase tracking-widest text-blue-500 dark:text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/15 dark:border-blue-500/25 flex items-center gap-1 shadow-sm"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  {inboxUnreadOnly ? "Unread" : "All"}
                </motion.div>
              )}
              {filter === 'saved' && (
                <motion.div
                  key="saved-status"
                  initial={{ opacity: 0, scale: 0.9, y: -2 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 2 }}
                  transition={{ duration: 0.15 }}
                  className="text-[10px] font-bold uppercase tracking-widest text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 px-2.5 py-1 rounded-full border border-yellow-500/15 dark:border-yellow-500/25 flex items-center gap-1 shadow-sm"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                  Saved
                </motion.div>
              )}
              {filter === 'reddit' && (
                <motion.div
                  key="reddit-status"
                  initial={{ opacity: 0, scale: 0.9, y: -2 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 2 }}
                  transition={{ duration: 0.15 }}
                  className="text-[10px] font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/15 dark:border-purple-500/25 flex items-center gap-1 shadow-sm"
                >
                  {redditSort === 'hot' ? (
                    <>
                      <Flame className="w-3 h-3 text-purple-500 animate-pulse" />
                      Trending
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                      New
                    </>
                  )}
                </motion.div>
              )}
              {filter === 'radio' && (
                <motion.div
                  key="radio-status"
                  initial={{ opacity: 0, scale: 0.9, y: -2 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 2 }}
                  transition={{ duration: 0.15 }}
                  className="text-[10px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/15 dark:border-red-500/25 flex items-center gap-1 shadow-sm"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" style={{ animationDuration: '2s' }} />
                  Radio
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        {isSearchOpen && (
          <div className="px-4 py-3 border-t border-white/10 dark:border-white/5 bg-white/5 dark:bg-black/20 backdrop-blur-xl flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-gray-400" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={filter === 'reddit' ? "Search Reddit posts..." : filter === 'radio' ? "Search radio stations..." : "Search articles..."}
                className="flex-1 bg-transparent text-gray-900 dark:text-white focus:outline-none"
                aria-label={filter === 'reddit' ? "Search Reddit posts" : filter === 'radio' ? "Search radio stations" : "Search articles"}
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
                {filter !== 'reddit' && filter !== 'radio' && (
                  <>
                    <div className="relative">
                      <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        className="appearance-none text-xs bg-white/10 text-white dark:text-gray-300 rounded-full pl-3 pr-8 py-1.5 border-none focus:ring-0 outline-none whitespace-nowrap"
                      >
                        <option value="all">All Sources</option>
                        {nonRedditFeeds.map(f => (
                          <option key={f.id} value={f.id}>{f.title}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none z-10" />
                    </div>
                  </>
                )}
                {filter === 'reddit' && (
                  <div className="relative">
                    <select
                      value={subredditFilter}
                      onChange={(e) => setSubredditFilter(e.target.value)}
                      className="appearance-none text-xs bg-white/10 text-white dark:text-gray-300 rounded-full pl-3 pr-8 py-1.5 border-none focus:ring-0 outline-none whitespace-nowrap"
                    >
                      <option value="all">All Subreddits</option>
                      {sortedSubreddits.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none z-10" />
                  </div>
                )}

                {filter === 'radio' && (
                  <div className="flex items-center gap-2">
                    {['Pop', 'Rock', 'Jazz', 'Dance', 'News', 'Classical'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSearchQuery(cat)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                          searchQuery.toLowerCase() === cat.toLowerCase()
                            ? "bg-red-600 text-white shadow-sm"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>
        )}

        <ProgressBanner filter={filter} />
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div 
          ref={inboxScrollRef}
          onScroll={(e) => handleScroll(e, 'inbox')}
          className={cn(
            "absolute inset-0 overflow-y-auto pb-24 pt-0 scroll-smooth transition-opacity duration-300 transform-gpu will-change-scroll scrollbar-hide",
            filter === 'inbox' ? "z-10 opacity-100 pointer-events-auto" : "z-0 opacity-0 pointer-events-none"
          )}
        >
            <FeedList
              articles={filter === 'inbox' ? visibleArticles : []}
              feedsMap={feedsMap}
              settings={settings}
              handleArticleClick={handleArticleClick}
              markAsRead={markAsReadWithPersistence}
              toggleRead={toggleReadWithPersistence}
              toggleFavorite={toggleFavorite}
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
            "absolute inset-0 overflow-y-auto pb-24 pt-0 scroll-smooth transition-opacity duration-300 transform-gpu will-change-scroll scrollbar-hide",
            filter === 'saved' ? "z-10 opacity-100 pointer-events-auto" : "z-0 opacity-0 pointer-events-none"
          )}
        >
          <div className="flex-1 max-w-3xl mx-auto px-2 py-2 space-y-1">
            <AnimatePresence initial={false} mode="sync">
              {(filter === 'saved' ? visibleArticles : [])
                .map(item => (
                  <SwipeableArticleItem
                    key={item.id}
                    article={item as any}
                    feedName={feedsMap.get((item as any).feedId)?.title || 'Unknown Feed'}
                    feedImageUrl={feedsMap.get((item as any).feedId)?.imageUrl}
                    settings={settings}
                    onClick={handleArticleClick}
                    onMarkAsRead={markAsReadWithPersistence}
                    toggleRead={toggleReadWithPersistence}
                    toggleFavorite={toggleFavorite}
                    onRemove={handleRemoveArticle}
                    isSavedSection={true}
                    filter="saved"
                  />
                ))}
            </AnimatePresence>
            {savedCount === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500 px-6 text-center">
                <Star className="w-16 h-16 mb-4 text-yellow-500/40 shadow-[0_0_20px_rgba(234,179,8,0.2)]" />
                <p className="text-lg font-medium text-white mb-1">No favorites yet</p>
                <p className="text-sm">Swipe right on an article to save it for later.</p>
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
          onVisibilityChange={handleRedditVisibilityChange}
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
        <RadioView
          isActive={filter === 'radio'}
          searchQuery={searchQuery}
        />
      </div>

      {selectedImage && (
        <ImageViewer imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
      )}
      
      <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 dark:border-white/5 flex justify-around pt-2 pb-3 px-3 z-20 transition-colors bg-white/5 dark:bg-black/20 backdrop-blur-xl">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => handleFilterChange('saved')}
          className={cn(
            "relative p-2 rounded-full border-none outline-none",
            filter === 'saved' ? "text-yellow-500" : "text-gray-500"
          )}
          aria-label="Saved articles"
          aria-pressed={filter === 'saved'}
        >
          <Star className={cn("w-6 h-6", filter === 'saved' && "drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]")} aria-hidden="true" />
          {savedCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-black">
              {savedCount > 99 ? '99+' : savedCount}
            </span>
          )}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => handleFilterChange('inbox')}
          className={cn(
            "relative p-2 rounded-full border-none outline-none",
            filter === 'inbox' ? "text-blue-500" : "text-gray-500"
          )}
          aria-label="Inbox"
          aria-pressed={filter === 'inbox'}
        >
          <Inbox className={cn("w-6 h-6", filter === 'inbox' && "drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]")} aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-black">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => handleFilterChange('reddit')}
          onMouseEnter={() => (RedditPostReader as any).prefetch?.()}
          onTouchStart={() => (RedditPostReader as any).prefetch?.()}
          onFocus={() => (RedditPostReader as any).prefetch?.()}
          className={cn(
            "relative p-2 rounded-full border-none outline-none",
            filter === 'reddit' ? "text-purple-500" : "text-gray-500"
          )}
          aria-label="Reddit"
          aria-pressed={filter === 'reddit'}
        >
          <MessageSquare className={cn("w-6 h-6", filter === 'reddit' && "drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]")} aria-hidden="true" />
          {redditUnreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-black">
              {redditUnreadCount > 99 ? '99+' : redditUnreadCount}
            </span>
          )}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => handleFilterChange('radio')}
          onMouseEnter={() => (RadioView as any).prefetch?.()}
          onTouchStart={() => (RadioView as any).prefetch?.()}
          onFocus={() => (RadioView as any).prefetch?.()}
          className={cn(
            "relative p-2 rounded-full border-none outline-none",
            filter === 'radio' ? "text-red-500" : "text-gray-500"
          )}
          aria-label="Radio"
          aria-pressed={filter === 'radio'}
        >
          <Radio className={cn("w-6 h-6", filter === 'radio' && "drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]")} aria-hidden="true" />
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsSettingsOpen(true)}
          onMouseEnter={() => (SettingsModal as any).prefetch?.()}
          onTouchStart={() => (SettingsModal as any).prefetch?.()}
          onFocus={() => (SettingsModal as any).prefetch?.()}
          className={cn(
            "p-2 rounded-full transition-colors text-gray-500 hover:text-gray-300",
            isSettingsOpen && "text-[var(--theme-color)]"
          )}
          aria-label="Settings"
        >
          <Settings className="w-6 h-6" aria-hidden="true" />
        </motion.button>
      </div>

      <AnimatePresence>
        {(filter === 'inbox' || filter === 'saved' || filter === 'reddit' || filter === 'radio') && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 20 }}
            className={cn(
              "fixed right-6 flex flex-col gap-4 z-30 items-center transition-all duration-300 bottom-28"
            )}
          >
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsSearchOpen(prev => !prev)}
              className={cn(
                "w-10 h-10 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform relative group border border-transparent",
                isSearchOpen ? "bg-indigo-600 text-white" : "bg-gray-800 text-indigo-400 hover:bg-gray-700"
              )}
              title={isSearchOpen ? "Close search" : "Open search"}
              aria-label={isSearchOpen ? "Close search" : "Open search"}
            >
              <Search className="w-5 h-5" aria-hidden="true" />
            </motion.button>

            {filter === 'inbox' && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  refreshFeeds();
                }}
                className={cn(
                  "w-10 h-10 bg-gray-800 rounded-full shadow-lg flex items-center justify-center hover:bg-gray-700 active:scale-95 transition-transform relative group border border-transparent",
                  isLoading ? "text-red-400 hover:bg-red-950/40 border-red-500/30" : "text-indigo-400"
                )}
                title={isLoading ? "Interrompi aggiornamento" : "Aggiorna feed"}
                aria-label={isLoading ? "Interrompi aggiornamento" : "Aggiorna feed"}
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin group-hover:hidden" aria-hidden="true" />
                    <X className="w-5 h-5 hidden group-hover:block text-red-500" aria-hidden="true" />
                  </>
                ) : (
                  <RefreshCw className="w-5 h-5" aria-hidden="true" />
                )}
              </motion.button>
            )}
            
            {filter !== 'saved' && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsMarkAllReadOpen(true)}
                className={cn(
                  "w-14 h-14 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all duration-300",
                  filter === 'reddit' ? "bg-purple-600 hover:bg-purple-700 shadow-purple-500/20" : 
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
              className={cn(
                "w-full max-w-sm p-6 rounded-3xl backdrop-blur-xl border border-white/10 dark:border-white/5 bg-white/5 dark:bg-black/20 shadow-[0_8px_32px_rgba(0,0,0,0.25)] transform-gpu"
              )}
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
                      const DAY_MS = 1000 * 60 * 60 * 24;
                      let threshold = 0;
                      if (timeFilter === 'today') threshold = Date.now() - DAY_MS;
                      if (timeFilter === 'week') threshold = Date.now() - (DAY_MS * 7);
                      if (timeFilter === 'month') threshold = Date.now() - (DAY_MS * 30);

                      await markFilteredArticlesAsRead({
                        feedId: sourceFilter === 'all' ? undefined : sourceFilter,
                        searchQuery: searchQuery || undefined,
                        timeThreshold: threshold || undefined
                      });
                    } else if (filter === 'saved') {
                      // ⚡ Bolt: Consolidated O(N) chained array operations (.filter().map()) into a single .reduce() pass
                      const toMark = savedArticles.reduce<string[]>((acc, a) => {
                        if (!a.isRead) acc.push(a.id);
                        return acc;
                      }, []);                      
                      if (toMark.length > 0) {
                        await markArticlesAsRead(toMark);
                      }
                    } else if (filter === 'reddit') {
                      // Mark all reddit posts as read
                      // ⚡ Bolt: Consolidated O(N) chained array operations (.filter().map()) into a single .reduce() pass
                      const toMark = redditPosts.reduce<string[]>((acc, p) => {
                        if (!p.isRead) acc.push(p.id);
                        return acc;
                      }, []);                      
                      if (toMark.length > 0) {
                        await markRedditPostsAsRead(toMark);
                      }
                    }
                    setIsMarkAllReadOpen(false);
                  }}
                  className={cn(
                    "flex-1 py-2.5 rounded-full font-medium text-white transition-colors",
                    filter === 'reddit' ? "bg-purple-600 hover:bg-purple-700" : 
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
          setSearchQuery('');
          setIsSearchOpen(false);
        }} 
        onSelectArticle={setSelectedArticle}
      />

      <AnimatePresence mode="wait">
        {selectedRedditPost && (
          <RedditPostReader
            key="reddit-modal"
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
            sourceFilter={filter}
          />
        )}
      </AnimatePresence>

       <AnimatePresence mode="wait">
        {currentSelectedArticle && (
          <ArticleReader
            key="article-modal"
            article={currentSelectedArticle}
            onClose={() => setSelectedArticle(null)}
            onSelectArticle={(a) => setSelectedArticle(a)}
            onNext={() => {
              if (hasNextArticle) {
                const next = activeArticles[activeIndex + 1];
                setSelectedArticle(next);
                if (!next.isRead) markAsReadWithPersistence(next.id);
              }
            }}
            onPrev={() => {
              if (hasPrevArticle) {
                const prev = activeArticles[activeIndex - 1];
                setSelectedArticle(prev);
                if (!prev.isRead) markAsReadWithPersistence(prev.id);
              }
            }}
            hasNext={hasNextArticle}
            hasPrev={hasPrevArticle}
            sourceFilter={filter}
          />
        )}
      </AnimatePresence>
      
      <ErrorNotification error={error} onClear={() => setError(null)} />

      <AnimatePresence mode="wait">
        {webViewUrl && (
          <InAppWebView
            url={webViewUrl}
            onClose={() => setWebViewUrl(null)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}