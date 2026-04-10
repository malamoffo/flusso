import React, { useRef, useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, animate, useReducedMotion } from 'framer-motion';
import { format, isToday } from 'date-fns';
import { Check, Trash2, Headphones, ListPlus, FileText, Bookmark, Star } from 'lucide-react';
import { Article, Settings } from '../types';
import { useInView } from 'react-intersection-observer';
import { contentFetcher } from '../utils/contentFetcher';
import { CachedImage } from './CachedImage';
import { cn, getSafeUrl, formatTime, parseDurationToSeconds } from '../lib/utils';
import { useAudioState, useAudioProgress } from '../context/AudioPlayerContext.tsx';
import { getColorSync } from 'colorthief';

// Global cache for feed colors to avoid repeated fetches and re-renders
const feedColorCache = new Map<string, string>();

interface SwipeableArticleProps {
  key?: React.Key;
  article: Article;
  feedName: string;
  feedImageUrl?: string;
  settings: Settings;
  onClick: (article: Article) => void;
  onMarkAsRead: (id: string) => void;
  toggleRead: (id: string) => void;
  toggleFavorite: (id: string) => void;
  toggleQueue: (id: string) => void;
  onRemove?: (id: string) => void;
  isSavedSection?: boolean;
  filter?: string;
  style?: React.CSSProperties;
  disableGestures?: boolean;
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
  toggleRead,
  toggleFavorite,
  toggleQueue,
  onRemove,
  isSavedSection,
  filter,
  style,
  disableGestures = false
}: SwipeableArticleProps) {
  const x = useMotionValue(0);
  const [feedThemeColor, setFeedThemeColor] = useState<string | null>(() => {
    return feedImageUrl ? feedColorCache.get(feedImageUrl) || null : null;
  });

  useEffect(() => {
    if (!feedImageUrl || feedColorCache.has(feedImageUrl)) return;

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = `https://api.allorigins.win/raw?url=${encodeURIComponent(feedImageUrl)}`;
    img.onload = () => {
      try {
        const color = getColorSync(img);
        if (color) {
          const hex = color.hex();
          feedColorCache.set(feedImageUrl, hex);
          setFeedThemeColor(hex);
        }
      } catch (e) {
        // Avoid retrying for failed images
        feedColorCache.set(feedImageUrl, ''); 
      }
    };
    img.onerror = () => {
      feedColorCache.set(feedImageUrl, '');
    };
  }, [feedImageUrl]);
  
  const { ref, inView, entry } = useInView({
    threshold: 0,
    rootMargin: '-120px 0px 0px 0px', // Offset for the sticky header
  });

  const { ref: prefetchRef, inView: prefetchInView } = useInView({
    threshold: 0,
    rootMargin: '200px 0px', // Trigger prefetch slightly before it enters the screen
    triggerOnce: true,
  });

  const prevTop = useRef(0);
  useEffect(() => {
    if (prefetchInView && entry) {
      const isScrollingDown = entry.boundingClientRect.top < prevTop.current;
      if (isScrollingDown) {
        contentFetcher.enqueue(article.id, article.link);
      }
      prevTop.current = entry.boundingClientRect.top;
    }
  }, [prefetchInView, entry, article.id, article.link]);

  useEffect(() => {
    // Mark as read when the article exits the top of the screen (past the sticky header)
    // Only apply this logic when in the 'inbox' filter section
    if (filter === 'inbox' && !inView && entry && entry.boundingClientRect.top < 120 && !article.isRead) {
      onMarkAsRead(article.id);
    }
  }, [inView, entry, article.id, article.isRead, onMarkAsRead, filter]);

  const handleArticleClick = () => {
    if (!article.isRead) {
      onMarkAsRead(article.id);
    }
    // ⚡ Bolt: Pass article to the stable onClick handler
    onClick(article);
  };

  // Background colors based on swipe action
  const getActionColor = (action: string, isSaved: boolean) => {
    if (isSaved) {
      return '#ef4444'; // Red for removal in saved section
    }
    // If isSaved is false, we want yellow if action is configured, else transparent.
    return action === 'none' ? 'rgba(0, 0, 0, 0)' : '#f59e0b'; // Yellow
  };

  const leftBackground = getActionColor(isSavedSection ? 'remove' : settings.swipeLeftAction, !!isSavedSection);
  const rightBackground = getActionColor(isSavedSection ? 'remove' : settings.swipeRightAction, !!isSavedSection);

  const middleBackground = isSavedSection ? 'rgba(239, 68, 68, 0)' : 'rgba(0, 0, 0, 0)';
  const backgroundTransform = useTransform(x, [-100, 0, 100], [leftBackground, middleBackground, rightBackground]);

  const getActionIcon = (action: string, isLeft: boolean) => {
    if (action === 'toggleFavorite') {
      return article.type === 'podcast' ? <ListPlus className="w-6 h-6" /> : <Bookmark className="w-6 h-6" />;
    }
    return null;
  };

  const getActionText = (action: string) => {
    if (isSavedSection) return 'Remove';
    if (action === 'toggleFavorite') {
      if (article.type === 'podcast') return article.isQueued ? 'Remove from Queue' : 'Add to Queue';
      return article.isFavorite ? 'Unfavorite' : 'Favorite';
    }
    return '';
  };

  const [exitX, setExitX] = React.useState<number | string>(0);

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 40;
    const isRight = info.offset.x > threshold;
    const isLeft = info.offset.x < -threshold;

    if (isRight || isLeft) {
      const action = isRight ? settings.swipeRightAction : settings.swipeLeftAction;
      
      if (isSavedSection) {
        // Set exit direction for AnimatePresence
        setExitX(isRight ? '100%' : '-100%');
        onRemove?.(article.id);
      } else {
        // Snap back for all actions to give the "bounce" feel
        animate(x, 0, { type: "spring", stiffness: 600, damping: 35, restDelta: 0.5 });

        if (action === 'toggleFavorite') {
          article.type === 'podcast' ? toggleQueue(article.id) : toggleFavorite(article.id);
        }
      }
    } else {
      // Snap back if threshold not met
      animate(x, 0, { type: "spring", stiffness: 400, damping: 25 });
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
  const shouldReduceMotion = useReducedMotion();
  const isCurrentTrack = currentTrack?.id === article.id;

  return (
    <motion.div 
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ 
        opacity: 0, 
        height: 0,
        transition: { duration: shouldReduceMotion ? 0 : 0.2, ease: "easeInOut" } 
      }}
      transition={{ 
        opacity: { duration: shouldReduceMotion ? 0 : 0.2 },
        height: { duration: shouldReduceMotion ? 0 : 0.2 }
      }}
      ref={(node) => {
        ref(node);
        prefetchRef(node);
      }} 
      className={cn(
        "relative w-full overflow-hidden will-change-transform"
      )}
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: '0 120px', // Rough estimate of article height
        transform: 'translateZ(0)', // GPU acceleration
        ...style
      } as React.CSSProperties}
    >
      {/* Background Action Color */}
      <motion.div 
        className="absolute inset-0 z-0"
        style={{ 
          backgroundColor: backgroundTransform
        }}
      />

      {/* Background Actions */}
      <div className="absolute inset-0 flex items-center justify-between px-6 z-10">
        <div className="flex items-center text-white font-medium">
          {isSavedSection ? (
            <Trash2 className="w-6 h-6" />
          ) : (
            <>
              {settings.swipeRightAction === 'toggleFavorite' && (
                article.type === 'podcast' ? <ListPlus className="w-6 h-6" /> : <Bookmark className="w-6 h-6" />
              )}
            </>
          )}
        </div>
        <div className="flex items-center text-white font-medium">
          {isSavedSection ? (
            <Trash2 className="w-6 h-6" />
          ) : (
            <>
              {settings.swipeLeftAction === 'toggleFavorite' && (
                article.type === 'podcast' ? <ListPlus className="w-6 h-6" /> : <Bookmark className="w-6 h-6" />
              )}
            </>
          )}
        </div>
      </div>

      {/* Foreground Draggable Card */}
      <motion.div
        style={{ x, willChange: 'transform' }}
        drag={!disableGestures && (isSavedSection || (settings.swipeLeftAction !== 'none' || settings.swipeRightAction !== 'none')) ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={!disableGestures ? { 
          left: (isSavedSection || settings.swipeLeftAction !== 'none') ? 0.5 : 0, 
          right: (isSavedSection || settings.swipeRightAction !== 'none') ? 0.5 : 0 
        } : 0}
        dragPropagation={false}
        dragTransition={{ bounceStiffness: 400, bounceDamping: 25 }}
        onDragEnd={handleDragEnd}
        onClick={handleArticleClick}
        exit={{ x: exitX, opacity: 0, transition: { duration: 0.15, ease: "easeOut" } }}
        className={cn(
          "relative z-20 w-full p-2 cursor-pointer shadow-sm transition-all bg-black select-none",
          "mx-auto max-w-full",
          "opacity-100"
        )}
      >
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[90%] h-[1.5px] bg-gradient-to-r from-transparent via-[var(--theme-color)] to-transparent opacity-60 shadow-[0_0_10px_rgba(var(--theme-color-rgb),0.3)]" />
        <div className={cn("flex gap-2", article.type === 'podcast' ? "flex-row items-start" : "flex-col gap-1.5")}>
          {/* Image */}
          {(article.imageUrl || (article.type === 'podcast' && feedImageUrl)) && (article.type === 'podcast' || settings.imageDisplay !== 'none') && (
            <CachedImage 
              key={`${article.id}-${article.imageUrl}`}
              src={getSafeUrl(article.imageUrl || feedImageUrl!)}
              alt="" 
              className={cn(
                "rounded-lg flex-shrink-0 bg-gray-800 transition-opacity",
                article.type === 'podcast' ? 'h-16 w-16 object-cover' : (
                  settings.imageDisplay === 'large' ? 'w-full h-auto min-h-[200px] mb-2' : 'w-20 h-auto min-h-[80px]'
                )
              )}
              referrerPolicy="no-referrer"
            />
          )}

          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            {/* Source and Time */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                {domain && article.type !== 'podcast' && (
                  <CachedImage 
                    src={`https://icons.duckduckgo.com/ip3/${domain}.ico`} 
                    alt="" 
                    className={`w-4 h-4 rounded-sm flex-shrink-0`}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
                    }}
                  />
                )}
                {article.type === 'podcast' ? (
                  <Headphones className="w-3.5 h-3.5 text-[var(--theme-color)]" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-gray-500" />
                )}
                <span 
                  className={`text-xs font-medium truncate ${feedThemeColor ? '' : 'text-indigo-400'}`}
                  style={{ color: feedThemeColor || undefined }}
                >
                  {feedName}
                </span>
              </div>
              <div className="flex items-center gap-1.5 ml-2">
                {article.isFavorite && (
                  article.type === 'podcast' ? <ListPlus className="w-3.5 h-3.5 text-[var(--theme-color)]" /> : <Bookmark className="w-3.5 h-3.5 text-[var(--theme-color)] fill-[var(--theme-color)]" />
                )}
                {article.isQueued && (
                  <ListPlus className="w-3.5 h-3.5 text-[var(--theme-color)]" />
                )}
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {article.type === 'podcast' 
                    ? format(article.pubDate, 'dd/MM/yy')
                    : (isToday(article.pubDate) ? format(article.pubDate, 'HH:mm') : format(article.pubDate, 'HH:mm dd/MM/yy'))}
                </span>
              </div>
            </div>

            {/* Title */}
            <div className="min-w-0">
              <h3 
                className={`${getTitleSize()} font-semibold leading-tight mb-1 ${article.isRead ? 'text-gray-400' : 'text-gray-100'}`}
                dangerouslySetInnerHTML={{ __html: article.title }}
              />
              {article.type === 'podcast' && (
                <PodcastProgressBar article={article} isCurrentTrack={isCurrentTrack} />
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});

/**
 * ⚡ Bolt: Isolated progress bar component to localize high-frequency re-renders.
 * Only the currently playing track's progress bar will re-render every second.
 */
const PodcastProgressBar = React.memo(({ article, isCurrentTrack }: { article: Article, isCurrentTrack: boolean }) => {
  if (isCurrentTrack) {
    return <LivePodcastProgressBar article={article} />;
  }

  const totalSeconds = parseDurationToSeconds(article.duration);
  const currentSeconds = article.progress ? article.progress * totalSeconds : 0;
  const remainingSeconds = Math.max(0, totalSeconds - currentSeconds);
  const progressPercent = totalSeconds > 0 ? (currentSeconds / totalSeconds) * 100 : 0;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 text-[10px] font-medium text-indigo-400">
        <span className="w-12 flex-shrink-0 text-left whitespace-nowrap">{formatTime(currentSeconds)}</span>
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-indigo-500 transition-all duration-300" 
            style={{ width: `${progressPercent}%` }} 
          />
        </div>
        <span className="w-12 flex-shrink-0 text-right whitespace-nowrap">{formatTime(remainingSeconds)}</span>
      </div>
    </div>
  );
});

const LivePodcastProgressBar = ({ article }: { article: Article }) => {
  const { progress: liveProgress, duration: liveDuration } = useAudioProgress();
  
  const totalSeconds = liveDuration > 0 ? liveDuration : parseDurationToSeconds(article.duration);
  const currentSeconds = liveProgress;
  const remainingSeconds = Math.max(0, totalSeconds - currentSeconds);
  const progressPercent = totalSeconds > 0 ? (currentSeconds / totalSeconds) * 100 : 0;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 text-[10px] font-medium text-indigo-400">
        <span className="w-12 flex-shrink-0 text-left whitespace-nowrap">{formatTime(currentSeconds)}</span>
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-indigo-500 transition-all duration-300" 
            style={{ width: `${progressPercent}%` }} 
          />
        </div>
        <span className="w-12 flex-shrink-0 text-right whitespace-nowrap">{formatTime(remainingSeconds)}</span>
      </div>
    </div>
  );
};
