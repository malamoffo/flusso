import React, { useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, animate, useReducedMotion } from 'framer-motion';
import { format, isToday } from 'date-fns';
import { Check, Trash2, Bookmark, MessageSquare } from 'lucide-react';
import { RedditPost, Settings } from '../types';
import { useInView } from 'react-intersection-observer';
import { cn, getSafeUrl } from '../lib/utils';
import { CachedImage } from './CachedImage';
import DOMPurify from 'dompurify';
import he from 'he';

interface SwipeableRedditPostProps {
  post: RedditPost;
  settings: Settings;
  onClick: (post: RedditPost) => void;
  onImageClick: (imageUrl: string) => void;
  onMarkAsRead: (id: string) => void;
  toggleRead: (id: string) => void;
  toggleFavorite: (id: string) => void;
  onRemove?: (id: string) => void;
  onVisibilityChange?: (id: string, isVisible: boolean) => void;
  isSavedSection?: boolean;
  filter?: string;
  disableGestures?: boolean;
}

export const SwipeableRedditPost = React.memo(function SwipeableRedditPost({
  post,
  settings,
  onClick,
  onImageClick,
  onMarkAsRead,
  toggleRead,
  toggleFavorite,
  onRemove,
  onVisibilityChange,
  isSavedSection,
  filter,
  disableGestures = false
}: SwipeableRedditPostProps) {
  const x = useMotionValue(0);
  
  const { ref, inView, entry } = useInView({
    threshold: 0,
    rootMargin: '-120px 0px 0px 0px',
  });

  const { ref: visibleRef, inView: isVisibleForTimer } = useInView({
    threshold: 0.5,
  });

  React.useEffect(() => {
    if (onVisibilityChange) {
      onVisibilityChange(post.id, isVisibleForTimer);
    }
  }, [isVisibleForTimer, post.id, onVisibilityChange]);

  React.useEffect(() => {
    if (filter === 'reddit' && !inView && entry && entry.boundingClientRect.top < 120 && !post.isRead) {
      onMarkAsRead(post.id);
    }
  }, [inView, entry, post.id, post.isRead, onMarkAsRead, filter]);

  const handlePostClick = () => {
    if (!post.isRead) {
      onMarkAsRead(post.id);
    }
    onClick(post);
  };

  const getActionColor = (action: string, isSaved: boolean) => {
    if (isSaved) return '#ef4444';
    return action === 'none' ? 'rgba(0, 0, 0, 0)' : '#a855f7';
  };

  const leftBackground = getActionColor(isSavedSection ? 'remove' : settings.swipeLeftAction, !!isSavedSection);
  const rightBackground = getActionColor(isSavedSection ? 'remove' : settings.swipeRightAction, !!isSavedSection);

  const backgroundTransform = useTransform(x, (val) => {
    const numVal = typeof val === 'number' ? val : parseFloat(val);
    if (numVal > 5) return rightBackground;
    if (numVal < -5) return leftBackground;
    return 'transparent';
  });

  const [exitX, setExitX] = useState<number | string>(0);

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 100;
    const isRight = info.offset.x > threshold;
    const isLeft = info.offset.x < -threshold;

    if (isRight || isLeft) {
      const action = isRight ? settings.swipeRightAction : settings.swipeLeftAction;
      
      if (isSavedSection) {
        setExitX(isRight ? '100%' : '-100%');
        onRemove?.(post.id);
      } else {
        animate(x, 0, { type: "spring", stiffness: 400, damping: 30, restDelta: 0.5 });

        if (action === 'toggleFavorite') {
          // Favorites disabled for Reddit as requested
          animate(x, 0, { type: "spring", stiffness: 400, damping: 30, restDelta: 0.5 });
        }
      }
    } else {
      animate(x, 0, { type: "spring", stiffness: 300, damping: 25 });
    }
  };

  const shouldReduceMotion = useReducedMotion();

  const decodedImageUrl = React.useMemo(() => {
    if (!post.imageUrl) return undefined;
    try {
      // Handle Reddit's encoded URLs (e.g. &amp; -> &)
      return post.imageUrl.includes('&amp;') ? he.decode(post.imageUrl) : post.imageUrl;
    } catch (e) {
      return post.imageUrl;
    }
  }, [post.imageUrl]);

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
        visibleRef(node);
      }}
      className={cn(
        "relative w-full overflow-hidden will-change-transform",
        (filter === 'saved' || filter === 'reddit') && "px-1.25 py-1"
      )}
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: '0 120px',
        transform: 'translateZ(0)'
      } as React.CSSProperties}
    >
      <div className={cn(
        "relative w-full rounded-2xl overflow-hidden",
        (filter === 'saved' || filter === 'reddit') ? "border-2 border-purple-500/80 shadow-md bg-black" : ""
      )}>
        {!post.isRead && (
          <span className="absolute top-2 right-2 z-30 px-2 py-0.5 bg-purple-600 text-[9px] font-black text-white rounded-full shadow-[0_0_10px_rgba(168,85,247,0.6)] border border-purple-400 uppercase tracking-widest">
            NEW
          </span>
        )}
        <motion.div 
          className="absolute inset-0 z-0"
          style={{ backgroundColor: backgroundTransform }}
        />

        <div className="absolute inset-0 flex items-center justify-between px-6 z-10">
          <div className="flex items-center text-white font-medium">
            {isSavedSection ? (
              <Trash2 className="w-6 h-6" />
            ) : (
              null
            )}
          </div>
          <div className="flex items-center text-white font-medium">
            {isSavedSection ? (
              <Trash2 className="w-6 h-6" />
            ) : (
              null
            )}
          </div>
        </div>

        <motion.div
          style={{ x, willChange: 'transform' }}
          drag={!disableGestures && (isSavedSection || (settings.swipeLeftAction !== 'none' || settings.swipeRightAction !== 'none')) ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={!disableGestures ? { 
            left: (isSavedSection || settings.swipeLeftAction !== 'none') ? 0.7 : 0, 
            right: (isSavedSection || settings.swipeRightAction !== 'none') ? 0.7 : 0 
          } : 0}
          dragPropagation={false}
          dragTransition={{ bounceStiffness: 300, bounceDamping: 25 }}
          onDragEnd={handleDragEnd}
          onClick={handlePostClick}
          exit={{ x: exitX, opacity: 0, transition: { duration: 0.15, ease: "easeOut" } }}
          className={cn(
            "relative z-20 w-full p-3 cursor-pointer transition-all bg-black select-none",
            (filter !== 'saved') && "opacity-100"
          )}
        >
        <div className="flex flex-col gap-2">
          {/* Image at the top */}
          {decodedImageUrl && (
            <CachedImage 
              src={getSafeUrl(decodedImageUrl)}
              alt="" 
              className={cn(
                "rounded-lg flex-shrink-0 bg-gray-800 transition-opacity w-full object-cover mb-1 h-auto min-h-[120px]"
              )}
              referrerPolicy="no-referrer"
              onClick={(e) => { e.stopPropagation(); onImageClick(decodedImageUrl); }}
            />
          )}

          {/* Source and Time (below image, above title) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider truncate text-purple-400">
                r/{post.subredditName}
              </span>
              <span className="text-[10px] text-gray-400 truncate tracking-wide">u/{post.author}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 whitespace-nowrap">
                {isToday(post.createdUtc) ? format(post.createdUtc, 'HH:mm') : format(post.createdUtc, 'dd MMM yyyy')}
              </span>
            </div>
          </div>

          {/* Title and Stats at the bottom */}
          <div className="flex-1 min-w-0">
            <h3 
              className={cn(
                "font-semibold leading-tight mb-1 text-gray-100",
                settings.fontSize === 'large' ? 'text-lg' : 'text-base'
              )}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.title, { FORBID_ATTR: ['id', 'name'] }) }}
            />
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 font-medium">
              <span className="flex items-center gap-1"><span className="text-purple-400 shadow-[0_0_5px_rgba(168,85,247,0.3)]">↑</span> {post.score}</span>
              <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3 text-purple-400" /> {post.numComments}</span>
            </div>
          </div>
        </div>
      </motion.div>
      </div>
    </motion.div>
  );
});