import React, { useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { format, isToday } from 'date-fns';
import { Check, Star, Trash2, Headphones, ListPlus, FileText } from 'lucide-react';
import { Article, Settings } from '../types';
import { useInView } from 'react-intersection-observer';
import { contentFetcher } from '../utils/contentFetcher';
import { cn, getSafeUrl, formatTime, parseDurationToSeconds } from '../lib/utils';
import { useAudioState, useAudioProgress } from '../context/AudioPlayerContext';
import DOMPurify from 'dompurify';

/**
 * ⚡ Bolt: Inner progress bar that actually consumes the progress context.
 * This is wrapped by a parent to ensure ONLY the active track's bar re-renders.
 */
const ActivePodcastProgressBar = ({ article }: { article: Article }) => {
  const { progress: liveProgress, duration: liveDuration } = useAudioProgress();

  const remainingSeconds = Math.max(0, liveDuration - liveProgress);
  const progressPercent = liveDuration > 0 ? (liveProgress / liveDuration) * 100 : 0;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
        <span className="w-8 text-left">{formatTime(liveProgress)}</span>
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="w-8 text-right">{formatTime(remainingSeconds)}</span>
      </div>
    </div>
  );
};

/**
 * ⚡ Bolt: Static progress bar for inactive tracks.
 * Does NOT subscribe to the high-frequency progress context.
 */
const InactivePodcastProgressBar = ({ article }: { article: Article }) => {
  const totalSeconds = parseDurationToSeconds(article.duration);
  const currentSeconds = article.progress ? article.progress * totalSeconds : 0;
  const remainingSeconds = Math.max(0, totalSeconds - currentSeconds);
  const progressPercent = totalSeconds > 0 ? (currentSeconds / totalSeconds) * 100 : 0;

  return (
    <div className="mt-2 opacity-60">
      <div className="flex items-center gap-2 text-[10px] font-medium text-gray-500 dark:text-gray-400">
        <span className="w-8 text-left">{formatTime(currentSeconds)}</span>
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gray-400 dark:bg-gray-600 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="w-8 text-right">{formatTime(remainingSeconds)}</span>
      </div>
    </div>
  );
};

/**
 * ⚡ Bolt: Strategy component to choose between active and inactive progress bars.
 * This prevents ALL podcast articles from re-rendering on every progress update.
 */
const PodcastProgressBar = React.memo(({ article, isCurrentTrack }: { article: Article, isCurrentTrack: boolean }) => {
  if (isCurrentTrack) {
    return <ActivePodcastProgressBar article={article} />;
  }
  return <InactivePodcastProgressBar article={article} />;
});

interface SwipeableArticleProps {
  key?: React.Key;
  article: Article;
  feedName: string;
  feedImageUrl?: string;
  settings: Settings;
  onClick: (article: Article) => void;
  onMarkAsRead: (id: string) => void;
  onVisibilityChange: (id: string, inView: boolean) => void;
  toggleRead: (id: string) => void;
  toggleFavorite: (id: string) => void;
  toggleQueue: (id: string) => void;
  style?: React.CSSProperties;
}

/**
 * ⚡ Bolt: Memoized SwipeableArticle component to prevent unnecessary re-renders.
 * By removing the useRss context hook and receiving data via props, this component
 * only re-renders when its specific article data or global settings change,
 * rather than on every context update (e.g., during feed refresh progress).
 */
export const SwipeableArticle = React.memo(function SwipeableArticle({
  article,
  feedName,
  feedImageUrl,
  settings,
  onClick,
  onMarkAsRead,
  onVisibilityChange,
  toggleRead,
  toggleFavorite,
  toggleQueue,
  style
}: SwipeableArticleProps) {
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
    // ⚡ Bolt: Pass article to the stable onClick handler
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
    if (action === 'toggleFavorite') {
      return article.type === 'podcast' ? <ListPlus className="w-6 h-6" /> : <Star className="w-6 h-6" />;
    }
    return null;
  };

  const getActionText = (action: string) => {
    if (action === 'toggleRead') return article.isRead ? 'Mark Unread' : 'Mark Read';
    if (action === 'toggleFavorite') {
      if (article.type === 'podcast') return article.isQueued ? 'Remove from Queue' : 'Add to Queue';
      return article.isFavorite ? 'Unfavorite' : 'Favorite';
    }
    return '';
  };

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 80;
    if (info.offset.x > threshold) {
      // Swiped right
      if (settings.swipeRightAction === 'toggleRead') toggleRead(article.id);
      else if (settings.swipeRightAction === 'toggleFavorite') {
        article.type === 'podcast' ? toggleQueue(article.id) : toggleFavorite(article.id);
      }
    } else if (info.offset.x < -threshold) {
      // Swiped left
      if (settings.swipeLeftAction === 'toggleRead') toggleRead(article.id);
      else if (settings.swipeLeftAction === 'toggleFavorite') {
        article.type === 'podcast' ? toggleQueue(article.id) : toggleFavorite(article.id);
      }
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

  const { currentTrack } = useAudioState();

  const isCurrentTrack = currentTrack?.id === article.id;

  return (
    <motion.div 
      ref={(node) => {
        ref(node);
        prefetchRef(node);
      }} 
      style={{ ...style, background }}
      className={cn(
        "relative w-full overflow-hidden border-b border-gray-200 dark:border-gray-800",
        settings.pureBlack && "dark:border-gray-700"
      )}
    >
      {/* Background Actions */}
      <div className="absolute inset-0 flex items-center justify-between px-6 z-0">
        <div className="flex items-center text-white font-medium">
          {settings.swipeRightAction === 'toggleRead' && <Check className="w-6 h-6 mr-2" />}
          {settings.swipeRightAction === 'toggleFavorite' && (
            article.type === 'podcast' ? <ListPlus className="w-6 h-6 mr-2" /> : <Star className="w-6 h-6 mr-2" />
          )}
          {getActionText(settings.swipeRightAction)}
        </div>
        <div className="flex items-center text-white font-medium">
          {getActionText(settings.swipeLeftAction)}
          {settings.swipeLeftAction === 'toggleRead' && <Check className="w-6 h-6 ml-2" />}
          {settings.swipeLeftAction === 'toggleFavorite' && (
            article.type === 'podcast' ? <ListPlus className="w-6 h-6 ml-2" /> : <Star className="w-6 h-6 ml-2" />
          )}
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
        <div className={cn(
          "flex gap-4",
          (article.type !== 'podcast' && settings.imageDisplay === 'large') ? 'flex-col' : 'items-stretch'
        )}>
          {(article.imageUrl || (article.type === 'podcast' && feedImageUrl)) && (article.type === 'podcast' || settings.imageDisplay !== 'none') && (
            <img 
              src={getSafeUrl(article.imageUrl || feedImageUrl!)}
              alt="" 
              loading="lazy"
              className={cn(
                "object-cover rounded-lg flex-shrink-0 bg-gray-100 dark:bg-gray-800 transition-opacity aspect-square",
                (article.type !== 'podcast' && settings.imageDisplay === 'large') ? 'w-full h-auto max-h-[70vh] mb-3' : 
                (article.type === 'podcast' ? 'h-auto w-auto max-w-[64px]' : 'w-20 h-20')
              )}
              referrerPolicy="no-referrer"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {domain && (
                  <img 
                    src={`https://icons.duckduckgo.com/ip3/${domain}.ico`} 
                    alt="" 
                    loading="lazy"
                    className={`w-4 h-4 rounded-sm flex-shrink-0`}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
                    }}
                  />
                )}
                {article.type === 'podcast' ? (
                  <Headphones className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                )}
                <span className={`text-xs font-medium truncate text-indigo-600 dark:text-indigo-400`}>
                  {feedName}
                </span>
              </div>
              <div className="flex items-center gap-1.5 ml-2">
                {article.isFavorite && (
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                )}
                {article.isQueued && (
                  <ListPlus className="w-3.5 h-3.5 text-indigo-500" />
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {article.type === 'podcast' 
                    ? format(article.pubDate, 'dd/MM/yy')
                    : (isToday(article.pubDate) ? format(article.pubDate, 'HH:mm') : format(article.pubDate, 'HH:mm dd/MM/yy'))}
                </span>
              </div>
            </div>
            <h3 
              className={`${getTitleSize()} font-semibold leading-tight mb-1 ${article.isRead ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.title, { FORBID_ATTR: ['id', 'name'] }) }}
            />
            {article.type === 'podcast' ? (
              <PodcastProgressBar article={article} isCurrentTrack={isCurrentTrack} />
            ) : (
              article.contentSnippet && article.contentSnippet.trim() !== '' && (
                <p 
                  className={`${getSnippetSize()} text-gray-500 dark:text-gray-400 mt-1 line-clamp-3 text-justify`}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.contentSnippet, { FORBID_ATTR: ['id', 'name'] }) }}
                />
              )
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});
