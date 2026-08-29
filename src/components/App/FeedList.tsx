import React, { memo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Article, Settings } from '../../types';
import { RssArticleItem } from '../RssArticleItem';
import { Loader2 } from 'lucide-react';
import { useInView } from 'react-intersection-observer';

interface FeedListProps {
  articles: Article[];
  feedsMap: Map<string, any>;
  settings: Settings;
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
  scrollElementRef?: React.RefObject<HTMLDivElement | null>;
}

export const FeedList = memo(({
  articles,
  feedsMap,
  settings,
  handleArticleClick,
  markAsRead,
  toggleRead,
  toggleFavorite,
  onVisibilityChange,
  isActive,
  hasMoreArticles,
  isLoading,
  loadMoreArticles,
  scrollElementRef
}: FeedListProps) => {
  const defaultContainerRef = useRef<HTMLDivElement>(null);
  const getScrollElement = () => scrollElementRef?.current || defaultContainerRef.current;

  const rowVirtualizer = useVirtualizer({
    count: articles.length,
    getScrollElement,
    estimateSize: () => 140,
    overscan: 6,
    getItemKey: (index) => `${articles[index]?.id || 'art'}-${index}`,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Infinite scroll trigger when reaching near the bottom of the virtualized list
  const lastVirtualItem = virtualItems[virtualItems.length - 1];
  useEffect(() => {
    if (!lastVirtualItem) return;
    if (
      lastVirtualItem.index >= articles.length - 3 &&
      hasMoreArticles &&
      !isLoading &&
      isActive
    ) {
      loadMoreArticles();
    }
  }, [lastVirtualItem, articles.length, hasMoreArticles, isLoading, isActive, loadMoreArticles]);

  const { ref: loadMoreSentinelRef, inView: isSentinelInView } = useInView({
    threshold: 0,
    rootMargin: '300px',
  });

  useEffect(() => {
    if (isSentinelInView && hasMoreArticles && !isLoading && isActive) {
      loadMoreArticles();
    }
  }, [isSentinelInView, hasMoreArticles, isLoading, isActive, loadMoreArticles]);

  return (
    <div ref={defaultContainerRef} className="flex-1 max-w-4xl mx-auto px-1 sm:px-2 pt-0 pb-2 w-full">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const article = articles[virtualRow.index];
          if (!article) return null;
          const feed = feedsMap.get(article.feedId);

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <RssArticleItem
                article={article}
                feedName={feed?.title || 'Unknown Feed'}
                feedImageUrl={feed?.imageUrl}
                settings={settings}
                onClick={handleArticleClick}
                onMarkAsRead={markAsRead}
                toggleRead={toggleRead}
                toggleFavorite={toggleFavorite}
                onVisibilityChange={onVisibilityChange}
              />
            </div>
          );
        })}
      </div>

      <div ref={loadMoreSentinelRef} className="h-20 flex items-center justify-center">
        {(hasMoreArticles || isLoading) && (
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        )}
      </div>
    </div>
  );
});
