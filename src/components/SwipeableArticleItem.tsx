import React, { useRef, useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, animate, useReducedMotion, useAnimation } from 'framer-motion';
import { format, isToday } from 'date-fns';
import { Trash2, FileText, Star } from 'lucide-react';
import he from 'he';
import { Article, Settings } from '../types';
import { useInView } from 'react-intersection-observer';
import { contentFetcher } from '../utils/contentFetcher';
import { CachedImage } from './CachedImage';
import { cn, getSafeUrl } from '../lib/utils';

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
  onRemove,
  onVisibilityChange,
  isSavedSection,
  filter,
  style,
  disableGestures = false
}: SwipeableArticleItemProps) {
  const controls = useAnimation();

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
      controls.start({ x: 0, transition: { duration: 0 } });
      swipeState[article.id] = 0;
    }
  }, [article.id, controls]);

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
    if (isSaved) return 'rgba(0, 0, 0, 0)';
    switch (action) {
      case 'toggleFavorite': return 'rgba(234, 179, 8, 1)';
      case 'markRead': return 'rgba(59, 130, 246, 1)';
      default: return 'rgba(0, 0, 0, 0)';
    }
  };

  const leftBackground = getActionColor(isSavedSection ? 'remove' : settings.swipeLeftAction, !!isSavedSection);
  const rightBackground = getActionColor(isSavedSection ? 'remove' : settings.swipeRightAction, !!isSavedSection);

  const backgroundTransform = useTransform(x, (val) => {
    if (val > 0) return leftBackground;
    if (val < 0) return rightBackground;
    return 'rgba(0, 0, 0, 0)';
  });

  const backgroundOpacity = useTransform(x, [-100, 0, 100], [0.8, 0, 0.8]);

  const leftIconOpacity = useTransform(x, [10, 50], [0, 1], { clamp: true });
  const rightIconOpacity = useTransform(x, [-50, -10], [1, 0], { clamp: true });
  const leftIconScale = useTransform(x, [10, 50], [0.5, 1], { clamp: true });
  const rightIconScale = useTransform(x, [-50, -10], [1, 0.5], { clamp: true });

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
      } else if (action === 'toggleFavorite') {
        controls.start({ x: 0, transition: { type: "spring", stiffness: 250, damping: 25, restDelta: 0.1 } });
        swipeState[article.id] = 0; // Reset state
        toggleFavorite(article.id);
      } else {
        controls.start({ x: 0, transition: { type: "spring", stiffness: 250, damping: 25, restDelta: 0.1 } });
        swipeState[article.id] = 0; // Reset state
      }
    } else {
      controls.start({ x: 0, transition: { type: "spring", stiffness: 200, damping: 25 } });
    }
  };

  const hasImage = !!article.imageUrl;

  const getTitleSize = () => {
    switch (settings.fontSize) {
      case 'large': return 'text-lg';
      case 'medium':
      default: return 'text-base';
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

  const shouldReduceMotion = useReducedMotion();

  const isInboxOrSaved = filter === 'inbox' || filter === 'saved' || isSavedSection;

  const isReadForDisplay = article.isRead;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "50px" }}
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
        type: "spring", stiffness: 250, damping: 25 
      }}
      ref={(node) => {
        ref(node);
        prefetchRef(node);
        visibleRef(node);
      }} 
      className={cn(
        "relative w-full",
        isInboxOrSaved && "px-1.25 py-2"
      )}
      style={{
        ...style
      } as React.CSSProperties}
    >
      <div className={cn(
        "relative w-full overflow-hidden rounded-3xl",
        isInboxOrSaved ? "shadow-md" : ""
      )}>
        <motion.div 
          className="absolute inset-0 z-0"
          style={{ backgroundColor: backgroundTransform, opacity: backgroundOpacity }}
        />

        <div className="absolute inset-0 flex items-center justify-between px-6 z-10 pointer-events-none">
          <motion.div style={{ opacity: leftIconOpacity, scale: leftIconScale }} className="flex items-center font-medium">
            {isSavedSection ? (
              <Trash2 className="w-6 h-6 text-red-500" />
            ) : (
              <>
                {settings.swipeRightAction === 'toggleFavorite' && (
                  <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                )}
              </>
            )}
          </motion.div>
          <motion.div style={{ opacity: rightIconOpacity, scale: rightIconScale }} className="flex items-center font-medium">
            {isSavedSection ? (
              <Trash2 className="w-6 h-6 text-red-500" />
            ) : (
              <>
                {settings.swipeLeftAction === 'toggleFavorite' && (
                  <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                )}
              </>
            )}
          </motion.div>
        </div>

        <motion.article
          layoutId={`article-${article.id}-${filter}`}
          animate={controls}
          style={{ 
            x
          }}
          drag={
            !disableGestures && (
              isSavedSection || 
              (settings.swipeLeftAction === 'toggleFavorite' || settings.swipeRightAction === 'toggleFavorite')
            ) ? "x" : false
          }
          dragDirectionLock={true} // Lock direction to prevent diagonal dragging
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={!disableGestures ? { 
            left: (isSavedSection || settings.swipeLeftAction === 'toggleFavorite') ? 0.8 : 0, 
            right: (isSavedSection || settings.swipeRightAction === 'toggleFavorite') ? 0.8 : 0 
          } : 0}
          dragPropagation={false}
          dragTransition={{ bounceStiffness: 200, bounceDamping: 30 }}
          onDragEnd={handleDragEnd}
          onClick={handleArticleClick}
          exit={{ x: exitX, opacity: 0, transition: { duration: 0.2, ease: "easeOut" } }}
          className={cn(
            "relative z-20 w-full p-4 flex flex-col gap-3 cursor-pointer select-none rounded-[inherit] transition-colors border-transparent",
            filter === 'saved' && "shadow-[0_0_15px_rgba(234,179,8,0.15)]",
            filter === 'inbox' && "shadow-[0_0_15px_rgba(59,130,246,0.15)]"
          )}
        >
          {/* Light Source */}
          <div className="absolute inset-0 z-0 rounded-[inherit] overflow-hidden pointer-events-none">
            {filter === 'saved' || isSavedSection ? (
              <div className="absolute -top-10 -left-10 w-48 h-48 bg-yellow-500/60 rounded-full blur-3xl" />
            ) : (
              <div className="absolute -top-10 -left-10 w-48 h-48 bg-blue-500/60 rounded-full blur-3xl" />
            )}
          </div>

          {/* Glass Surface */}
          <div className="absolute inset-0 z-0 bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] rounded-[inherit] pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-2">
            {hasImage ? (
              <div className="relative overflow-hidden flex-shrink-0 w-full aspect-[2/1] rounded-2xl bg-gray-800/50">
              <CachedImage 
                key={`${article.id}-${article.imageUrl}`}
                src={getSafeUrl(article.imageUrl || '')}
                alt="" 
                className="absolute inset-0 w-full h-full object-cover bg-gray-800 transition-opacity"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}

          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
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
                  <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <ScrollingFeedName feedName={feedName} readableFeedThemeColor={readableFeedThemeColor} />
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                {!!(article.isFavorite) && (
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
              
              {article.contentSnippet && (
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
            </div>
          </div>
        </div>
        </motion.article>
      </div>
    </motion.div>
  );
});
