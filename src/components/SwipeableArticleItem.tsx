import React, { useRef, useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, animate, useReducedMotion } from 'framer-motion';
import { format, isToday } from 'date-fns';
import { Check, Trash2, Headphones, ListPlus, FileText, Bookmark, Star } from 'lucide-react';
import he from 'he';
import { Article, Settings } from '../types';
import { useInView } from 'react-intersection-observer';
import { contentFetcher } from '../utils/contentFetcher';
import { CachedImage } from './CachedImage';
import { cn, getSafeUrl, formatTime, parseDurationToSeconds } from '../lib/utils';
import { useAudioStore } from '../store/audioStore';
import { useShallow } from 'zustand/react/shallow';

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
  onVisibilityChange?: (id: string, isVisible: boolean) => void;
  isSavedSection?: boolean;
  filter?: string;
  style?: React.CSSProperties;
  disableGestures?: boolean;
}

const ScrollingFeedName = React.memo(function ScrollingFeedName({ 
  feedName, 
  readableFeedThemeColor 
}: { 
  feedName: string; 
  readableFeedThemeColor: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [textWidth, setTextWidth] = useState(0);

  const checkOverflow = () => {
    if (containerRef.current && textRef.current) {
      // Use a larger buffer (10px) to prevent unnecessary scrolling for short names
      // also ensure clientWidth is definitely greater than 0
      const containerWidth = containerRef.current.clientWidth;
      const isOverflowing = containerWidth > 0 && textRef.current.scrollWidth > containerWidth + 10;
      setShouldScroll(isOverflowing);
      setTextWidth(textRef.current.scrollWidth);
    }
  };

  useEffect(() => {
    checkOverflow();
    
    // Add ResizeObserver to handle container size changes
    if (containerRef.current) {
      const observer = new ResizeObserver(() => {
        checkOverflow();
      });
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, [feedName]);

  return (
    <div className="flex-1 overflow-hidden whitespace-nowrap min-w-0 relative" ref={containerRef}>
      <motion.div
        className="inline-block"
        animate={shouldScroll ? { x: ["0%", "-50%"] } : { x: 0 }}
        transition={shouldScroll ? {
          repeat: Infinity,
          duration: Math.max(5, (textWidth * 2) / 25), // Proportional duration for consistent speed
          repeatType: "loop",
          ease: "linear",
          repeatDelay: 1
        } : {}}
      >
        <span
          ref={textRef}
          className={cn("text-[10px] font-bold uppercase tracking-wider inline-block", readableFeedThemeColor ? '' : 'text-blue-500')}
          style={{ color: readableFeedThemeColor || undefined }}
        >
          {feedName}{shouldScroll ? <>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{feedName}</> : ''}
        </span>
      </motion.div>
    </div>
  );
});

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
  onVisibilityChange,
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

  const [feedThemeColor, setFeedThemeColor] = useState<string | null>(null);

  const readableFeedThemeColor = null;
  
  const { ref, inView, entry } = useInView({
    threshold: 0,
    rootMargin: '-120px 0px 0px 0px',
  });

  const { ref: prefetchRef, inView: prefetchInView } = useInView({
    threshold: 0,
    rootMargin: '200px 0px',
    triggerOnce: true,
  });

  const { ref: visibleRef, inView: isVisibleForTimer } = useInView({
    threshold: 0.5,
  });

  useEffect(() => {
    if (onVisibilityChange) {
      onVisibilityChange(article.id, isVisibleForTimer);
    }
  }, [isVisibleForTimer, article.id, onVisibilityChange]);

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
    if (filter === 'inbox' && !inView && entry && entry.boundingClientRect.top < 120 && !article.isRead && article.type !== 'podcast') {
      onMarkAsRead(article.id);
    }
  }, [inView, entry, article.id, article.isRead, article.type, onMarkAsRead, filter]);

  const handleArticleClick = () => {
    if (!article.isRead && article.type !== 'podcast') {
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

  const backgroundTransform = useTransform(x, (val) => {
    const numVal = typeof val === 'number' ? val : parseFloat(val);
    if (numVal > 0.1) return rightBackground;
    if (numVal < -0.1) return leftBackground;
    return 'rgba(0, 0, 0, 0)';
  });

  const [exitX, setExitX] = React.useState<number | string>(0);

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 100;
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
        animate(x, 0, { type: "spring", stiffness: 250, damping: 25, restDelta: 0.1 });
        swipeState[article.id] = 0; // Reset state
        article.type === 'podcast' ? toggleQueue(article.id) : toggleFavorite(article.id);
      } else {
        animate(x, 0, { type: "spring", stiffness: 250, damping: 25, restDelta: 0.1 });
        swipeState[article.id] = 0; // Reset state
      }
    } else {
      animate(x, 0, { type: "spring", stiffness: 200, damping: 25 });
    }
  };

  const hasImage = (article.imageUrl || (article.type === 'podcast' && feedImageUrl));

  const getTitleSize = () => {
    const isPodcast = article.type === 'podcast';
    switch (settings.fontSize) {
      case 'large': return isPodcast ? 'text-base' : 'text-lg';
      case 'medium':
      default: return isPodcast ? 'text-sm' : 'text-base';
    }
  };

  const getSnippetSize = () => {
    switch (settings.fontSize) {
      case 'large': return 'text-sm';
      case 'medium':
      default: return 'text-xs';
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

  const currentTrack = useAudioStore(state => state.currentTrack);
  const shouldReduceMotion = useReducedMotion();
  const isCurrentTrack = currentTrack?.id === article.id;

  const isInboxOrSaved = filter === 'inbox' || filter === 'saved' || isSavedSection;

  const isPodcast = article.type === 'podcast';
  const isFinished = isPodcast && (() => {
    const total = parseDurationToSeconds(article.duration);
    if (total <= 0) return false;
    const current = (article.progress || 0) * total;
    return total - current < 120;
  })();
  const isReadForDisplay = isPodcast ? isFinished : article.isRead;

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
        visibleRef(node);
      }} 
      className={cn(
        "relative w-full overflow-hidden will-change-transform content-visibility-auto",
        isInboxOrSaved && "px-1.25 py-1"
      )}
      style={{
        transform: 'translateZ(0)',
        ...style
      } as React.CSSProperties}
    >
      <div className={cn(
        "relative w-full overflow-hidden",
        isInboxOrSaved ? "rounded-2xl border-2 border-blue-500/80 shadow-md" : ""
      )}>
        <motion.div 
          className="absolute inset-0 z-0"
          style={{ 
            backgroundColor: backgroundTransform
          }}
        />

        <div className="absolute inset-0 flex items-center justify-between px-6 z-10">
          <div className="flex items-center font-medium">
            {isSavedSection || (settings.swipeRightAction === 'remove' && article.type === 'podcast') ? (
              <Trash2 className="w-6 h-6 text-white" />
            ) : (
              <>
                {settings.swipeRightAction === 'toggleFavorite' && (
                  <Star className="w-6 h-6 text-white fill-white" />
                )}
              </>
            )}
          </div>
          <div className="flex items-center font-medium">
            {isSavedSection || (settings.swipeLeftAction === 'remove' && article.type === 'podcast') ? (
              <Trash2 className="w-6 h-6 text-white" />
            ) : (
              <>
                {settings.swipeLeftAction === 'toggleFavorite' && (
                  <Star className="w-6 h-6 text-white fill-white" />
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
            left: (isSavedSection || (article.type === 'podcast' && settings.swipeLeftAction !== 'none') || (article.type === 'article' && settings.swipeLeftAction === 'toggleFavorite')) ? 0.7 : 0, 
            right: (isSavedSection || (article.type === 'podcast' && settings.swipeRightAction !== 'none') || (article.type === 'article' && settings.swipeRightAction === 'toggleFavorite')) ? 0.7 : 0 
          } : 0}
          dragPropagation={false}
          dragTransition={{ bounceStiffness: 300, bounceDamping: 25 }}
          onDragEnd={handleDragEnd}
          onClick={handleArticleClick}
          exit={{ x: exitX, opacity: 0, transition: { duration: 0.2, ease: "easeOut" } }}
          className={cn(
            "relative z-20 w-full p-3 cursor-pointer bg-black select-none",
            !isInboxOrSaved && "border-b border-gray-800"
          )}
        >
          <div className={cn(
            "flex gap-2", 
            (article.type === 'podcast') ? "flex-row items-center" : "flex-col"
          )}>
            {hasImage ? (
              <div className={cn(
                "relative overflow-hidden flex-shrink-0",
                (article.type !== 'podcast') ? "w-full h-auto rounded-2xl" : "w-16 h-16 rounded-lg"
              )}>
              <CachedImage 
                key={`${article.id}-${article.imageUrl}`}
                src={getSafeUrl(article.imageUrl || (article.type === 'podcast' ? feedImageUrl! : ''))}
                alt="" 
                className={cn(
                  "w-full h-full object-cover bg-gray-800 transition-opacity",
                  article.type !== 'podcast' && "h-auto"
                )}
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}

          <div className={cn(
            "flex-1 min-w-0 flex flex-col gap-1.5"
          )}>
            <div className="flex items-center justify-between mb-0.5 w-full">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {domain && (
                  <div className="flex-shrink-0">
                    <CachedImage 
                      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} 
                      alt="" 
                      className="w-3.5 h-3.5 rounded-sm"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
                      }}
                    />
                  </div>
                )}
                <div className="flex items-center gap-1.5 min-w-0">
                  {article.type === 'podcast' ? (
                    <Headphones className="w-3 h-3 text-[var(--theme-color)] flex-shrink-0" />
                  ) : (
                    <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  )}
                  <ScrollingFeedName feedName={feedName} readableFeedThemeColor={readableFeedThemeColor} />
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                {!!(article.isFavorite || article.isQueued) && (
                  <Star className="w-3 h-3 text-yellow-500 fill-current" />
                )}
                <span className="text-[10px] text-gray-400 whitespace-nowrap">
                  {isToday(article.pubDate) ? format(article.pubDate, 'HH:mm') : format(article.pubDate, 'dd MMM yyyy')}
                </span>
              </div>
            </div>

            <div className="min-w-0">
              <h3 
                className={cn(
                  "font-bold leading-tight transition-colors",
                  getTitleSize(),
                  isReadForDisplay ? 'text-gray-500' : 'text-gray-100',
                  !isReadForDisplay && "group-hover:text-[var(--theme-color)]"
                )}
                dangerouslySetInnerHTML={{ __html: article.title }}
              />
              
              {article.type === 'article' && article.contentSnippet && (
                <p className={cn(
                  "text-gray-400 line-clamp-2 leading-snug mb-1",
                  getSnippetSize()
                )}>
                  {he.decode(article.contentSnippet)}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                <div className="flex-1" />
              </div>

              {article.type === 'podcast' && (
                <PodcastProgressBar article={article} isCurrentTrack={isCurrentTrack} />
              )}
            </div>
          </div>
        </div>
      </motion.div>
      </div>
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
  const { progress: liveProgress, duration: liveDuration } = useAudioStore(useShallow(s => ({
    progress: s.progress,
    duration: s.duration
  })));
  
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
