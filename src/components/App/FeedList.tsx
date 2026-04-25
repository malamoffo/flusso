import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Article } from '../../types';
import { SwipeableArticleItem } from '../SwipeableArticleItem';
import { Loader2 } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { cn } from '../../lib/utils';

interface FeedListProps {
  articles: Article[];
  feedsMap: Map<string, any>;
  settings: any;
  handleArticleClick: (article: Article) => void;
  markAsRead: (id: string) => void;
  toggleRead: (id: string) => void;
  toggleFavorite: (id: string) => void;
  handleRemoveArticle: (id: string) => void;
  onVisibilityChange?: (id: string, isVisible: boolean) => void;
  isSavedSection: boolean;
  isActive: boolean;
  hasMoreArticles: boolean;
  isLoading: boolean;
  loadMoreArticles: () => void;
}

export const FeedList = memo(({
  articles,
  feedsMap,
  settings,
  handleArticleClick,
  markAsRead,
  toggleRead,
  toggleFavorite,
  handleRemoveArticle,
  onVisibilityChange,
  isSavedSection,
  isActive,
  hasMoreArticles,
  isLoading,
  loadMoreArticles
}: FeedListProps) => {
  const { ref, inView } = useInView({
    threshold: 0,
    rootMargin: '200px',
  });

  React.useEffect(() => {
    if (inView && hasMoreArticles && !isLoading && isActive) {
      loadMoreArticles();
    }
  }, [inView, hasMoreArticles, isLoading, loadMoreArticles, isActive]);

  return (
    <div className="flex-1 max-w-3xl mx-auto px-2 pt-0 pb-2 space-y-2">
      <AnimatePresence initial={false}>
        {Array.from(new Map(articles.map(a => [a.id, a])).values()).map((article: Article) => {
          const feed = feedsMap.get(article.feedId);
          return (
            <SwipeableArticleItem
              key={article.id}
              article={article}
              feedName={feed?.title || 'Unknown Feed'}
              feedImageUrl={feed?.imageUrl}
              settings={settings}
              onClick={handleArticleClick}
              onMarkAsRead={markAsRead}
              toggleRead={toggleRead}
              toggleFavorite={toggleFavorite}
              isSavedSection={isSavedSection}
              filter={isSavedSection ? 'saved' : 'inbox'}
              onRemove={handleRemoveArticle}
              onVisibilityChange={onVisibilityChange}
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
  );
});
