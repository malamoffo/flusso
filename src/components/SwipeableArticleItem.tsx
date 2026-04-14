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

// VERY IMPORTANT: Persist swipe state outside component
const swipeState: Record<string, number> = {};

interface SwipeableArticleItemProps {
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

export const SwipeableArticleItem = React.memo(function SwipeableArticleItem({
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
}: SwipeableArticleItemProps) {
  // Initialize x from swipeState[id]
  const x = useMotionValue(swipeState[article.id] || 0);
  
  // Update swipeState[id] on change
  useEffect(() => {
    const unsubscribe = x.on("change", (latest) => {
      swipeState[article.id] = latest;
    });
    return () => unsubscribe();
  }, [x, article.id]);

  // Reset x to 0 on mount to ensure items are centered, especially in Saved section
  useEffect(() => {
    if (swipeState[article.id]) {
      animate(x, 0, { duration: 0 });
      swipeState[article.id] = 0;
    }
  }, [article.id, x]);

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
        feedColorCache.set(feedImageUrl, ''); 
      }
    };
    img.onerror = () => {
      feedColorCache.set(feedImageUrl, '');
    };
  }, [feedImageUrl]);
  
  const { ref, inView, entry } = useInView({
    threshold: 0,
    rootMargin: '-120px 0px 0px 0px',
  });

  const { ref: prefetchRef, inView: prefetchInView } = useInView({
    threshold: 0,
    rootMargin: '200px 0px',
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
    if (filter === 'inbox' && !inView && entry && entry.boundingClientRect.top < 120 && !article.isRead) {
      onMarkAsRead(article.id);
    }
  }, [inView, entry, article.id, article.isRead, onMarkAsRead, filter]);

  const handleArticleClick = () => {
    if (!article.isRead) {
      onMarkAsRead(article.id);
    }
    onClick(article);
  };

  const getActionColor = (action: string, isSaved: boolean) => {
    if (isSaved) {
      return '#ef4444'; // Red for removal
    }
    if (action === 'remove' && article.type === 'podcast') {
      return '#ef4444'; // Red for removal
    }
    if (action === 'toggleFavorite') {
      return '#f59e0b'; // Yellow for favorite
    }
    return 'rgba(0, 0, 0, 0)';
  };

  const leftBackground = getActionColor(isSavedSection ? 'remove' : settings.swipeLeftAction, !!isSavedSection);
  const rightBackground = getActionColor(isSavedSection ? 'remove' : settings.swipeRightAction, !!isSavedSection);

  const middleBackground = 'rgba(0, 0, 0, 0)';
  const backgroundTransform = useTransform(
    x, 
    [-100, -20, 0, 20, 100], 
    [leftBackground, leftBackground, middleBackground, rightBackground, rightBackground]
  );

  const [exitX, setExitX] = React.useState<number | string>(0);

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 80;
    const velocityThreshold = 500;
    
    let isRight = info.offset.x > threshold || info.velocity.x > velocityThreshold;
    let isLeft = info.offset.x < -threshold || info.velocity.x < -velocityThreshold;

    // Prevent triggering if action is 'none' and we are not in saved section
    if (!isSavedSection) {
      if (settings.swipeRightAction === 'none') isRight = false;
      if (settings.swipeLeftAction === 'none') isLeft = false;
    }

    if (isRight || isLeft) {
      const action = isRight ? settings.swipeRightAction : settings.swipeLeftAction;
      
      if (isSavedSection) {
        setExitX(isRight ? '100%' : '-100%');
        swipeState[article.id] = 0;
        onRemove?.(article.id);
      } else if (article.type === 'podcast' && action === 'remove') {
        // Podcast removal action
        const direction = isRight ? '100%' : '-100%';
        setExitX(direction);
        swipeState[article.id] = 0;
        // Small delay to ensure exitX state is applied before removal triggers AnimatePresence
        setTimeout(() => {
          onRemove?.(article.id);
        }, 50);
      } else if (action === 'toggleFavorite') {
        animate(x, 0, { type: "spring", stiffness: 600, damping: 35, restDelta: 0.5 });
        swipeState[article.id] = 0; // Reset state
        article.type === 'podcast' ? toggleQueue(article.id) : toggleFavorite(article.id);
      } else {
        animate(x, 0, { type: "spring", stiffness: 600, damping: 35, restDelta: 0.5 });
        swipeState[article.id] = 0; // Reset state
      }
    } else {
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
        x: exitX,
        transition: { 
          opacity: { duration: 0.2 },
          height: { duration: 0.2, delay: 0.1 },
          x: { duration: 0.2 }
        } 
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
        containIntrinsicSize: '0 120px',
        transform: 'translateZ(0)',
        ...style
      } as React.CSSProperties}
    >
      <motion.div 
        className="absolute inset-0 z-0"
        style={{ 
          backgroundColor: backgroundTransform
        }}
      />

      <div className="absolute inset-0 flex items-center justify-between px-6 z-10">
        <div className="flex items-center text-white font-medium">
          {isSavedSection || (settings.swipeRightAction === 'remove' && article.type === 'podcast') ? (
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
          {isSavedSection || (settings.swipeLeftAction === 'remove' && article.type === 'podcast') ? (
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

      <motion.div
        style={{ 
          x, 
          willChange: 'transform',
          touchAction: 'pan-y', // Prevent scroll/swipe conflicts
        }}
        drag={
          !disableGestures && (
            isSavedSection || 
            (article.type === 'podcast' && (settings.swipeLeftAction !== 'none' || settings.swipeRightAction !== 'none')) ||
            (article.type === 'article' && (settings.swipeLeftAction === 'toggleFavorite' || settings.swipeRightAction === 'toggleFavorite'))
          ) ? "x" : false
        }
        dragDirectionLock={true} // Lock direction to prevent diagonal dragging
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={!disableGestures ? { 
          left: (isSavedSection || (article.type === 'podcast' && settings.swipeLeftAction !== 'none') || (article.type === 'article' && settings.swipeLeftAction === 'toggleFavorite')) ? 0.5 : 0, 
          right: (isSavedSection || (article.type === 'podcast' && settings.swipeRightAction !== 'none') || (article.type === 'article' && settings.swipeRightAction === 'toggleFavorite')) ? 0.5 : 0 
        } : 0}
        dragPropagation={false}
        dragTransition={{ bounceStiffness: 400, bounceDamping: 25 }}
        onDragEnd={handleDragEnd}
        onClick={handleArticleClick}
        exit={{ x: exitX, opacity: 0, transition: { duration: 0.15, ease: "easeOut" } }}
        className={cn(
          "relative z-20 w-full p-2 cursor-pointer shadow-sm transition-all bg-black select-none",
          "mx-auto max-w-full"
        )}
      >
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[90%] h-[1.5px] bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-60 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
        <div className={cn("flex gap-2", article.type === 'podcast' ? "flex-row items-start" : "flex-col gap-1.5")}>
          {(article.imageUrl || (article.type === 'podcast' && feedImageUrl)) && (article.type === 'podcast' || settings.imageDisplay !== 'none') && (
            <CachedImage 
              key={`${article.id}-${article.imageUrl}`}
              src={getSafeUrl(article.imageUrl || (article.type === 'podcast' ? feedImageUrl! : ''))}
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

            <div className="min-w-0">
              <h3 
                className={`${getTitleSize()} font-semibold leading-tight mb-1 ${article.isRead ? 'text-gray-400' : 'text-gray-100'}`}
                dangerouslySetInnerHTML={{ __html: article.title }}
              />
              {article.type === 'article' && article.contentSnippet && (
                <p className="text-sm text-gray-400 line-clamp-2 mb-1 leading-snug">
                  {article.contentSnippet}...
                </p>
              )}
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
