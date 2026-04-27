import React, { useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, animate, useReducedMotion, useAnimation } from 'framer-motion';
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
  const controls = useAnimation();
  
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
    if (isSaved) return 'rgba(255, 255, 255, 0.08)'; // Glass-like color
    switch (action) {
      case 'toggleFavorite': return 'rgba(234, 179, 8, 1)';
      case 'markRead': return 'rgba(59, 130, 246, 1)';
      default: return 'rgba(255, 255, 255, 0.08)'; // Default to glass
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
        controls.start({ x: 0, transition: { type: "spring", stiffness: 400, damping: 30, restDelta: 0.5 } });

        if (action === 'toggleFavorite') {
          // Favorites disabled for Reddit as requested
          controls.start({ x: 0, transition: { type: "spring", stiffness: 400, damping: 30, restDelta: 0.5 } });
        }
      }
    } else {
      controls.start({ x: 0, transition: { type: "spring", stiffness: 300, damping: 25 } });
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
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "50px" }}
      exit={{ 
        opacity: 0, 
        height: 0,
        transition: { duration: shouldReduceMotion ? 0 : 0.2, ease: "easeInOut" } 
      }}
      transition={{ 
        type: "spring", stiffness: 250, damping: 25 
      }}
      ref={(node) => {
        ref(node);
        visibleRef(node);
      }}
      className={cn(
        "relative w-full",
        (filter === 'saved' || filter === 'reddit') && "px-1.25 py-2"
      )}
    >
      <div className={cn(
        "relative w-full rounded-3xl overflow-hidden",
        (filter === 'saved' || filter === 'reddit') ? "shadow-md" : ""
      )}>
        <motion.div 
          className="absolute inset-0 z-0 backdrop-blur-xl border border-white/[0.15]"
          style={{ backgroundColor: backgroundTransform, opacity: backgroundOpacity }}
        />

        {!post.isRead && (
          <span className="absolute top-2 right-2 z-30 px-2 py-0.5 bg-purple-600 text-[9px] font-black text-white rounded-full shadow-[0_0_10px_rgba(168,85,247,0.6)] border border-purple-400 uppercase tracking-widest">
            NEW
          </span>
        )}

        <div className="absolute inset-0 flex items-center justify-between px-6 z-10 pointer-events-none">
          <motion.div style={{ opacity: leftIconOpacity, scale: leftIconScale }} className="flex items-center text-white font-medium">
            {isSavedSection ? (
              <Trash2 className="w-6 h-6 text-red-500" />
            ) : (
              null
            )}
          </motion.div>
          <motion.div style={{ opacity: rightIconOpacity, scale: rightIconScale }} className="flex items-center text-white font-medium">
            {isSavedSection ? (
              <Trash2 className="w-6 h-6 text-red-500" />
            ) : (
              null
            )}
          </motion.div>
        </div>

        <motion.article
          animate={controls}
          style={{ x }}
          drag={!disableGestures && (isSavedSection || (settings.swipeLeftAction !== 'none' || settings.swipeRightAction !== 'none')) ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={!disableGestures ? { 
            left: (isSavedSection || settings.swipeLeftAction !== 'none') ? 0.8 : 0, 
            right: (isSavedSection || settings.swipeRightAction !== 'none') ? 0.8 : 0 
          } : 0}
          dragPropagation={false}
          dragTransition={{ bounceStiffness: 200, bounceDamping: 30 }}
          onDragEnd={handleDragEnd}
          onClick={handlePostClick}
          exit={{ x: exitX, opacity: 0, transition: { duration: 0.15, ease: "easeOut" } }}
          className={cn(
            "relative z-20 w-full p-4 flex flex-col gap-3 cursor-pointer select-none rounded-[inherit] transition-colors border-transparent",
            filter === 'saved' && "shadow-[0_0_15px_rgba(234,179,8,0.15)]",
            filter === 'reddit' && "shadow-[0_0_15px_rgba(168,85,247,0.15)]"
          )}
        >
          {/* Light Source */}
          <div className="absolute inset-0 z-0 rounded-[inherit] overflow-hidden pointer-events-none">
            {filter === 'saved' || isSavedSection ? (
              <div className="absolute -top-10 -left-10 w-64 h-64 bg-yellow-500/60 rounded-full blur-[80px]" />
            ) : (
              <div className="absolute -top-10 -left-10 w-64 h-64 bg-purple-500/60 rounded-full blur-[80px]" />
            )}
          </div>

          {/* Glass Surface */}
          <div className="absolute inset-0 z-0 bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] rounded-[inherit] pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-2">
          {/* Image at the top */}
          {decodedImageUrl && (
            <CachedImage 
              src={getSafeUrl(decodedImageUrl)}
              alt="" 
              className={cn(
                "rounded-lg flex-shrink-0 bg-gray-800/50 transition-opacity w-full object-cover mb-1 aspect-[16/9]"
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
      </motion.article>
      </div>
    </motion.div>
  );
});