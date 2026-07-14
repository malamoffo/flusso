import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RedditPost, Settings } from '../types';
import { MessageSquare, RefreshCw, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { SwipeableRedditPost } from './SwipeableRedditPost';

interface RedditListViewProps {
  isActive: boolean;
  posts: RedditPost[];
  onPostClick: (post: RedditPost) => void;
  onImageClick: (imageUrl: string) => void;
  isLoading: boolean;
  refreshReddit: () => void;
  loadMoreReddit: () => void;
  settings: Settings;
  onMarkAsRead: (id: string) => void;
  onVisibilityChange?: (id: string, isVisible: boolean) => void;
  toggleRead: (id: string) => void;
  toggleFavorite: (id: string) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  handleScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

export const RedditListView = memo(({ 
  isActive, 
  posts, 
  onPostClick, 
  onImageClick,
  isLoading, 
  refreshReddit,
  loadMoreReddit,
  settings,
  onMarkAsRead,
  onVisibilityChange,
  toggleRead,
  toggleFavorite,
  scrollRef,
  handleScroll
}: RedditListViewProps) => {
  const hasUnread = React.useMemo(() => posts.some(p => !p.isRead), [posts]);
  const observerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const observerTarget = observerRef.current;
    if (!observerTarget || isLoading || !isActive) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading) {
          loadMoreReddit();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(observerTarget);

    return () => {
      observer.disconnect();
    };
  }, [loadMoreReddit, isLoading, isActive]);

  return (
    <motion.main
      ref={scrollRef as any}
      onScroll={handleScroll}
      className={cn(
        "absolute inset-0 overflow-y-auto transition-opacity duration-300 transform-gpu will-change-scroll pb-32 pt-0 bg-transparent scrollbar-hide",
        isActive ? "z-10 opacity-100 pointer-events-auto" : "z-0 opacity-0 pointer-events-none"
      )}
      initial={false}
    >
      {posts.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 px-6 text-center">
          <MessageSquare className="w-16 h-16 mb-4 text-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.2)]" />
          <p className="text-lg font-medium text-white mb-1">No Reddit posts</p>
          <p className="text-sm">Add a subreddit in settings to see posts here.</p>
        </div>
      ) : (
        <div className="flex-1 max-w-3xl mx-auto px-2 pt-0 pb-2 space-y-0">
          <AnimatePresence initial={false} mode="sync">
            {posts.map(post => (
              <SwipeableRedditPost
                key={`${post.subredditName}-${post.id}`}
                post={post}
                settings={settings}
                onClick={onPostClick}
                onImageClick={onImageClick}
                onMarkAsRead={onMarkAsRead}
                onVisibilityChange={onVisibilityChange}
                toggleRead={toggleRead}
                toggleFavorite={toggleFavorite}
                filter="reddit"
                disableGestures={true}
              />
            ))}
          </AnimatePresence>
          
          {posts.length > 0 && (
            <div ref={observerRef} className="py-12 flex flex-col items-center justify-center gap-2">
              <div className="flex items-center gap-2 text-purple-500 bg-purple-500/10 px-4 py-2 rounded-full border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.15)] backdrop-blur-sm">
                <RefreshCw className="w-4 h-4 animate-spin text-purple-500" />
                <span className="text-xs font-semibold uppercase tracking-wider animate-pulse">Loading More Posts</span>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.main>
  );
});
