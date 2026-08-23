import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isToday } from 'date-fns';
import { Star, CheckCircle2 } from 'lucide-react';
import he from 'he';
import DOMPurify from 'dompurify';
import { Article, Settings } from '../types';
import { useInView } from 'react-intersection-observer';
import { CachedImage } from './CachedImage';
import { cn, getSafeUrl } from '../lib/utils';
import { extractArticleImages } from './RotatingImageCarousel';

interface RssArticleItemProps {
  article: Article;
  feedName: string;
  feedImageUrl?: string;
  settings: Settings;
  onClick: (article: Article) => void;
  onMarkAsRead: (id: string) => void;
  toggleRead: (id: string) => void;
  toggleFavorite: (id: string) => void;
  onVisibilityChange?: (id: string, isVisible: boolean) => void;
  style?: React.CSSProperties;
}

const ScrollingFeedName = React.memo(function ScrollingFeedName({ 
  feedName, 
  inView = true
}: { 
  feedName: string; 
  inView?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [textWidth, setTextWidth] = useState(0);

  useEffect(() => {
    let active = true;
    const checkOverflow = () => {
      if (!active || !containerRef.current || !textRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const singleTextWidth = textRef.current.scrollWidth;
      const isOverflowing = containerWidth > 0 && singleTextWidth > containerWidth + 8;
      
      setShouldScroll(prev => (prev !== isOverflowing ? isOverflowing : prev));
      setTextWidth(prev => (prev !== singleTextWidth ? singleTextWidth : prev));
    };

    // Run asynchronously to avoid layout thrashing and observer recursion
    const timeoutId = setTimeout(checkOverflow, 60);
    window.addEventListener('resize', checkOverflow, { passive: true });

    return () => {
      active = false;
      clearTimeout(timeoutId);
      window.removeEventListener('resize', checkOverflow);
    };
  }, [feedName]);

  return (
    <div className="flex-1 overflow-hidden whitespace-nowrap min-w-0 relative" ref={containerRef}>
      <motion.div
        className="inline-block"
        animate={(shouldScroll && inView) ? { x: ["0%", "-50%"] } : { x: 0 }}
        transition={(shouldScroll && inView) ? {
          repeat: Infinity,
          duration: Math.max(5, (textWidth * 2) / 25),
          repeatType: "loop",
          ease: "linear",
          repeatDelay: 1
        } : {}}
      >
        <span
          ref={textRef}
          className="text-[10px] font-bold uppercase tracking-wider inline-block text-blue-500"
        >
          {feedName}
        </span>
        {shouldScroll && (
          <span
            className="text-[10px] font-bold uppercase tracking-wider inline-block text-blue-500"
            aria-hidden="true"
          >
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{feedName}
          </span>
        )}
      </motion.div>
    </div>
  );
});

export const RssArticleItem = React.memo(
  React.forwardRef<HTMLDivElement, RssArticleItemProps>(function RssArticleItem(
    {
      article,
      feedName,
      settings,
      onClick,
      onMarkAsRead,
      toggleFavorite,
      onVisibilityChange,
      style
    },
    forwardedRef
  ) {
    const isFavorite = !!article.isFavorite;
    const isReadForDisplay = article.isRead;

    // Intersection observers
    const { ref: inViewRef, inView, entry } = useInView({
      threshold: 0,
      rootMargin: '-120px 0px 0px 0px',
    });

    const { ref: visibleRef, inView: isVisibleForTimer } = useInView({
      threshold: 0.5,
    });

    useEffect(() => {
      if (onVisibilityChange) {
        onVisibilityChange(article.id, isVisibleForTimer);
      }
    }, [isVisibleForTimer, article.id, onVisibilityChange]);

    useEffect(() => {
      if (!inView && entry && entry.boundingClientRect.top < 120 && !article.isRead) {
        onMarkAsRead(article.id);
      }
    }, [inView, entry, article.id, article.isRead, onMarkAsRead]);

    // Long press 1 second tracking
    const [isHolding, setIsHolding] = useState(false);
    const [justFavorited, setJustFavorited] = useState(false);
    const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
    const visualTimerRef = useRef<NodeJS.Timeout | null>(null);
    const startCoordRef = useRef<{ x: number; y: number } | null>(null);
    const isMovedRef = useRef(false);
    const didTriggerLongPressRef = useRef(false);

    const cancelHold = useCallback(() => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (visualTimerRef.current) {
        clearTimeout(visualTimerRef.current);
        visualTimerRef.current = null;
      }
      setIsHolding(false);
    }, []);

    const triggerFavorite = useCallback(() => {
      didTriggerLongPressRef.current = true;
      cancelHold();
      toggleFavorite(article.id);
      
      // Haptic feedback
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([40, 60, 80]);
        }
      } catch (e) {
        // Ignore vibration errors
      }

      setJustFavorited(true);
      setTimeout(() => {
        setJustFavorited(false);
      }, 1500);
    }, [article.id, toggleFavorite, cancelHold]);

    const handlePointerDown = (e: React.PointerEvent) => {
      // Only primary mouse button or touch
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      
      didTriggerLongPressRef.current = false;
      isMovedRef.current = false;
      startCoordRef.current = { x: e.clientX, y: e.clientY };

      cancelHold();

      // Show visual progress after 100ms to avoid flashing on instant taps
      visualTimerRef.current = setTimeout(() => {
        setIsHolding(true);
      }, 100);

      // Exactly 1 second (1000ms) long press
      holdTimerRef.current = setTimeout(() => {
        triggerFavorite();
      }, 1000);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      if (!startCoordRef.current) return;
      const dx = Math.abs(e.clientX - startCoordRef.current.x);
      const dy = Math.abs(e.clientY - startCoordRef.current.y);

      // If moved more than 16px, user is scrolling or dragging, cancel long press
      if (dx > 16 || dy > 16) {
        isMovedRef.current = true;
        cancelHold();
      }
    };

    const handlePointerUp = () => {
      cancelHold();
      startCoordRef.current = null;
    };

    const handlePointerCancel = () => {
      cancelHold();
      startCoordRef.current = null;
      didTriggerLongPressRef.current = false;
      isMovedRef.current = false;
    };

    const handleArticleClick = () => {
      if (!article.isRead) {
        onMarkAsRead(article.id);
      }
      onClick(article);
    };

    const handleClick = (e: React.MouseEvent) => {
      // If long press was triggered, prevent opening the article
      if (didTriggerLongPressRef.current) {
        e.preventDefault();
        e.stopPropagation();
        didTriggerLongPressRef.current = false;
        return;
      }
      // If user was clearly scrolling on a touch screen
      if (isMovedRef.current) {
        isMovedRef.current = false;
        return;
      }
      handleArticleClick();
    };

    // Images
    const articleImages = useMemo(() => extractArticleImages(article), [article]);
    const firstImage = useMemo(() => {
      for (const url of articleImages) {
        if (url && url.trim()) {
          const trimmed = url.trim();
          const lower = trimmed.toLowerCase();
          if (
            !lower.includes('favicon') && 
            !lower.endsWith('.ico') && 
            !lower.includes('pixel.gif') && 
            !lower.includes('tracker') &&
            !lower.includes('/sprite') &&
            !lower.includes('doubleclick')
          ) {
            return trimmed;
          }
        }
      }
      return null;
    }, [articleImages]);

    const hasImage = !!firstImage;

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

    const sanitizedTitle = useMemo(() => ({ 
      __html: DOMPurify.sanitize(article.title, { FORBID_ATTR: ['id', 'name'] }) 
    }), [article.title]);

    // Merge forwardedRef and intersection observer refs
    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        inViewRef(node);
        visibleRef(node);
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      },
      [inViewRef, visibleRef, forwardedRef]
    );

    return (
      <div 
        ref={setRefs}
        style={style}
        className={cn(
          "w-full px-1.25 py-1 select-none transition-transform duration-150 ease-out",
          !isReadForDisplay ? "z-[35]" : "z-[10]",
          isHolding && "scale-[0.985]"
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleClick}
        onContextMenu={(e) => {
          // Prevent browser context menu on long press
          e.preventDefault();
        }}
      >
        <div 
          className={cn(
            "relative w-full rounded-3xl p-4 flex flex-col gap-3 cursor-pointer transition-all duration-300 border border-blue-500/10 bg-[#121e36] shadow-md shadow-black/30 overflow-hidden",
            !isReadForDisplay ? "z-[35]" : "z-20",
            isFavorite && "border-yellow-500/30 shadow-[0_0_18px_rgba(234,179,8,0.12)]",
            isHolding && "border-yellow-400 ring-2 ring-yellow-400/40 shadow-[0_0_25px_rgba(234,179,8,0.3)]"
          )}
        >
          {/* 1-Second Long Press Progress Feedback Bar */}
          {isHolding && (
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-yellow-500/20 z-50 overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.8)]"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 0.9, ease: "linear" }}
              />
            </div>
          )}

          {/* Long Press Visual Toast / Overlay Hint */}
          <AnimatePresence>
            {isHolding && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-x-0 bottom-2 z-50 flex justify-center pointer-events-none"
              >
                <div className="bg-black/90 backdrop-blur-md border border-yellow-500/40 text-yellow-300 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-xl">
                  <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 animate-spin" style={{ animationDuration: '2s' }} />
                  <span>Tieni premuto per {isFavorite ? 'rimuovere dai preferiti' : 'salvare nei preferiti'}...</span>
                </div>
              </motion.div>
            )}

            {justFavorited && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="absolute top-3 right-3 z-50 pointer-events-none"
              >
                <div className="bg-yellow-500 text-black font-extrabold text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1 shadow-lg shadow-yellow-500/40 uppercase tracking-wider">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isFavorite ? 'Salvato!' : 'Rimosso'}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Unread Glowing Pulse & Badge */}
          {!isReadForDisplay && (
            <>
              <span className="absolute top-1 right-4 z-40 px-2 py-0.5 bg-blue-600 text-[9px] font-black text-white rounded-full shadow-[0_0_12px_rgba(59,130,246,0.8)] border border-blue-400 uppercase tracking-widest animate-pulse">
                NEW
              </span>
              <div 
                className="absolute inset-0 z-20 pointer-events-none rounded-[inherit] border-2 border-blue-400 shadow-[0_0_28px_rgba(59,130,246,0.95),inset_0_0_18px_rgba(59,130,246,0.6)] animate-pulse" 
                style={{ animationDuration: '3s' }} 
              />
            </>
          )}

          <div className="relative z-10 flex flex-col gap-2">
            {hasImage && firstImage && (
              <div className="relative overflow-hidden flex-shrink-0 w-full rounded-2xl bg-gray-800/50 transform-gpu">
                <CachedImage 
                  src={getSafeUrl(firstImage)}
                  alt=""
                  className="w-full h-auto block rounded-[inherit]"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}

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
                    <ScrollingFeedName feedName={feedName} inView={inView} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  {isFavorite && (
                    <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 animate-in zoom-in-50 duration-200" />
                  )}
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">
                    {isToday(article.pubDate) ? format(article.pubDate, 'HH:mm') : format(article.pubDate, 'dd MMM yyyy')}
                  </span>
                </div>
              </div>

              <div className="min-w-0">
                <h3 
                  className={cn(
                    "font-bold leading-tight transition-colors text-gray-100",
                    getTitleSize(),
                    !isReadForDisplay && "group-hover:text-[var(--theme-color)]"
                  )}
                  dangerouslySetInnerHTML={sanitizedTitle}
                />
                
                {article.contentSnippet && (
                  <p className={cn(
                    "text-gray-400 leading-snug mb-1",
                    getSnippetSize()
                  )}>
                    {he.decode(article.contentSnippet)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  })
);
