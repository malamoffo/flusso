import React, { useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { format, isToday } from 'date-fns';
import { Check, Star, Trash2 } from 'lucide-react';
import { Article, Settings } from '../types';
import { useInView } from 'react-intersection-observer';
import { contentFetcher } from '../utils/contentFetcher';
import { cn } from '../lib/utils';
import DOMPurify from 'dompurify';

interface SwipeableArticleProps {
  key?: React.Key;
  article: Article;
  feedName: string;
  settings: Settings;
  onClick: (article: Article) => void;
  onMarkAsRead: (id: string) => void;
  onToggleRead: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onVisibilityChange: (id: string, inView: boolean) => void;
  style?: React.CSSProperties;
}

export const SwipeableArticle = React.memo(({
  article,
  feedName,
  settings,
  onClick,
  onMarkAsRead,
  onToggleRead,
  onToggleFavorite,
  onVisibilityChange,
  style
}: SwipeableArticleProps) => {
  const x = useMotionValue(0);
  
  const { ref, inView, entry } = useInView({
    threshold: 0,
    rootMargin: '-120px 0px 0px 0px', // Offset for the sticky header
  });

  const { ref: prefetchRef, inView: prefetchInView } = useInView({
    threshold: 0,
    rootMargin: '200px 0px', // Trigger prefetch slightly before it enters the screen
    triggerOnce: true,
  });

  useEffect(() => {
    if (prefetchInView) {
      contentFetcher.enqueue(article.id, article.link);
    }
  }, [prefetchInView, article.id, article.link]);

  useEffect(() => {
    // Report visibility to parent for batch marking as read
    if (!article.isRead) {
      onVisibilityChange(article.id, inView);
    }
    
    // Cleanup on unmount or when article is marked as read
    return () => {
      onVisibilityChange(article.id, false);
    };
  }, [inView, article.id, article.isRead, onVisibilityChange]);

  useEffect(() => {
    // Mark as read when the article exits the top of the screen
    if (!inView && entry && entry.boundingClientRect.top < 0 && !article.isRead) {
      onMarkAsRead(article.id);
    }
  }, [inView, entry, article.id, article.isRead, onMarkAsRead]);

  const handleArticleClick = () => {
    if (!article.isRead) {
      onMarkAsRead(article.id);
    }
    onClick(article);
  };

  // Background colors based on swipe action
  const getActionColor = (action: string) => {
    if (action === 'toggleRead') return '#3b82f6'; // Blue
    if (action === 'toggleFavorite') return '#f59e0b'; // Yellow
    return '#ffffff';
  };

  const background = useTransform(
    x,
    [-100, 0, 100],
    [getActionColor(settings.swipeLeftAction), '#ffffff', getActionColor(settings.swipeRightAction)]
  );

  const getActionIcon = (action: string, isLeft: boolean) => {
    if (action === 'toggleRead') return <Check className="w-6 h-6" />;
    if (action === 'toggleFavorite') return <Star className="w-6 h-6" />;
    return null;
  };

  const getActionText = (action: string) => {
    if (action === 'toggleRead') return article.isRead ? 'Mark Unread' : 'Mark Read';
    if (action === 'toggleFavorite') return article.isFavorite ? 'Unfavorite' : 'Favorite';
    return '';
  };

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 80;
    if (info.offset.x > threshold) {
      // Swiped right
      if (settings.swipeRightAction === 'toggleRead') onToggleRead(article.id);
      else if (settings.swipeRightAction === 'toggleFavorite') onToggleFavorite(article.id);
    } else if (info.offset.x < -threshold) {
      // Swiped left
      if (settings.swipeLeftAction === 'toggleRead') onToggleRead(article.id);
      else if (settings.swipeLeftAction === 'toggleFavorite') onToggleFavorite(article.id);
    }
  };

  const getTitleSize = () => {
    switch (settings.fontSize) {
      case 'small': return 'text-sm';
      case 'large': return 'text-lg';
      case 'xlarge': return 'text-xl';
      case 'medium':
      default: return 'text-base';
    }
  };

  const getSnippetSize = () => {
    switch (settings.fontSize) {
      case 'small': return 'text-xs';
      case 'large': return 'text-base';
      case 'xlarge': return 'text-lg';
      case 'medium':
      default: return 'text-sm';
    }
  };

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return '';
    }
  };

  const domain = getDomain(article.link);

  return (
    <motion.div 
      ref={(node) => {
        ref(node);
        prefetchRef(node);
      }} 
      style={{ ...style, background }}
      className="relative w-full overflow-hidden border-b border-gray-200 dark:border-gray-800"
    >
      {/* Background Actions */}
      <div className="absolute inset-0 flex items-center justify-between px-6 z-0">
        <div className="flex items-center text-white font-medium">
          {settings.swipeRightAction === 'toggleRead' && <Check className="w-6 h-6 mr-2" />}
          {settings.swipeRightAction === 'toggleFavorite' && <Star className="w-6 h-6 mr-2" />}
          {getActionText(settings.swipeRightAction)}
        </div>
        <div className="flex items-center text-white font-medium">
          {getActionText(settings.swipeLeftAction)}
          {settings.swipeLeftAction === 'toggleRead' && <Check className="w-6 h-6 ml-2" />}
          {settings.swipeLeftAction === 'toggleFavorite' && <Star className="w-6 h-6 ml-2" />}
        </div>
      </div>

      {/* Foreground Draggable Card */}
      <motion.div
        style={{ x }}
        drag={settings.swipeLeftAction === 'none' && settings.swipeRightAction === 'none' ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ 
          left: settings.swipeLeftAction === 'none' ? 0 : 0.2, 
          right: settings.swipeRightAction === 'none' ? 0 : 0.2 
        }}
        dragTransition={{ bounceStiffness: 400, bounceDamping: 25 }}
        onDragEnd={handleDragEnd}
        onClick={handleArticleClick}
        className={cn(
          "relative z-10 w-full p-4 cursor-pointer shadow-sm transition-colors",
          settings.pureBlack ? "bg-black" : "bg-white dark:bg-gray-900"
        )}
      >
        <div className={`flex ${settings.imageDisplay === 'large' ? 'flex-col' : 'gap-4'}`}>
          {article.imageUrl && settings.imageDisplay !== 'none' && (
            <img 
              src={article.imageUrl} 
              alt="" 
              className={`${settings.imageDisplay === 'large' ? 'w-full h-auto max-h-[70vh] mb-3' : 'w-20 h-auto max-h-32'} object-contain rounded-lg flex-shrink-0 bg-gray-100 dark:bg-gray-800 transition-opacity`}
              referrerPolicy="no-referrer"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {domain && (
                  <img 
                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} 
                    alt="" 
                    className={`w-4 h-4 rounded-sm flex-shrink-0`}
                    referrerPolicy="no-referrer"
                  />
                )}
                <span className={`text-xs font-medium truncate text-indigo-600 dark:text-indigo-400`}>
                  {feedName}
                </span>
              </div>
              <div className="flex items-center gap-1.5 ml-2">
                {article.isFavorite && (
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {isToday(article.pubDate) ? format(article.pubDate, 'HH:mm') : format(article.pubDate, 'HH:mm dd/MM/yy')}
                </span>
              </div>
            </div>
            <h3 
              className={`${getTitleSize()} font-semibold leading-tight mb-1 ${article.isRead ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.title) }}
            />
            {article.contentSnippet && article.contentSnippet.trim() !== '' && (
              <p 
                className={`${getSnippetSize()} text-gray-500 dark:text-gray-400 line-clamp-2 mt-1`}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.contentSnippet) }}
              />
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});
