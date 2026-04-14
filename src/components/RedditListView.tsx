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
  toggleRead,
  toggleFavorite,
  scrollRef,
  handleScroll
}: RedditListViewProps) => {
  const hasUnread = React.useMemo(() => posts.some(p => !p.isRead), [posts]);

  return (
    <motion.main
      ref={scrollRef as any}
      onScroll={handleScroll}
      className={cn(
        "absolute inset-0 overflow-y-auto transition-all duration-300 will-change-transform pb-32 bg-black",
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
        <div className="flex-1 max-w-3xl mx-auto px-1 py-1">
          <AnimatePresence initial={false}>
            {posts.map(post => (
              <SwipeableRedditPost
                key={`${post.subredditName}-${post.id}`}
                post={post}
                settings={settings}
                onClick={onPostClick}
                onImageClick={onImageClick}
                onMarkAsRead={onMarkAsRead}
                toggleRead={toggleRead}
                toggleFavorite={toggleFavorite}
                filter="reddit"
                disableGestures={true}
              />
            ))}
          </AnimatePresence>
          
          {posts.length > 0 && (
            <div className="py-8 flex justify-center">
              <button 
                onClick={(e) => { e.stopPropagation(); loadMoreReddit(); }}
                className="px-6 py-2 bg-gray-800 text-gray-300 rounded-full font-medium hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <RefreshCw className={cn("w-4 h-4", isLoading ? "animate-spin" : "")} />
                Load More
              </button>
            </div>
          )}
        </div>
      )}
    </motion.main>
  );
});
