import React, { useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, animate, useReducedMotion } from 'framer-motion';
import { format, isToday } from 'date-fns';
import { Check, Trash2, Bookmark, MessageSquare } from 'lucide-react';
import { RedditPost, Settings } from '../types';
import { useInView } from 'react-intersection-observer';
import { cn, getSafeUrl } from '../lib/utils';
import { CachedImage } from './CachedImage';
import DOMPurify from 'dompurify';

interface SwipeableRedditPostProps {
  post: RedditPost;
  settings: Settings;
  onClick: (post: RedditPost) => void;
  onImageClick: (imageUrl: string) => void;
  onMarkAsRead: (id: string) => void;
  toggleRead: (id: string) => void;
  toggleFavorite: (id: string) => void;
  onRemove?: (id: string) => void;
  isSavedSection?: boolean;
  filter?: string;
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
  isSavedSection,
  filter
}: SwipeableRedditPostProps) {
  const x = useMotionValue(0);
  
  const { ref, inView, entry } = useInView({
    threshold: 0,
    rootMargin: '-120px 0px 0px 0px',
  });

  React.useEffect(() => {
    // Reddit posts are now always shown as unread, so we don't need to mark them as read on scroll
  }, []);

  const handlePostClick = () => {
    onClick(post);
  };

  const getActionColor = (action: string, isSaved: boolean) => {
    if (isSaved) return '#ef4444';
    return action === 'none' ? 'rgba(0, 0, 0, 0)' : '#a855f7';
  };

  const leftBackground = getActionColor(isSavedSection ? 'remove' : settings.swipeLeftAction, !!isSavedSection);
  const rightBackground = getActionColor(isSavedSection ? 'remove' : settings.swipeRightAction, !!isSavedSection);

  const middleBackground = isSavedSection ? 'rgba(239, 68, 68, 0)' : 'rgba(0, 0, 0, 0)';
  const backgroundTransform = useTransform(x, [-100, 0, 100], [leftBackground, middleBackground, rightBackground]);

  const [exitX, setExitX] = useState<number | string>(0);

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 40;
    const isRight = info.offset.x > threshold;
    const isLeft = info.offset.x < -threshold;

    if (isRight || isLeft) {
      const action = isRight ? settings.swipeRightAction : settings.swipeLeftAction;
      
      if (isSavedSection) {
        setExitX(isRight ? '100%' : '-100%');
        onRemove?.(post.id);
      } else {
        animate(x, 0, { type: "spring", stiffness: 600, damping: 35, restDelta: 0.5 });

        if (action === 'toggleFavorite') {
          toggleFavorite(post.id);
        }
      }
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 25 });
    }
  };

  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div 
      layout={shouldReduceMotion ? false : "position"}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ 
        opacity: 0, 
        height: 0,
        transition: { duration: shouldReduceMotion ? 0 : 0.2, ease: "easeInOut" } 
      }}
      transition={{ 
        layout: { type: "spring", stiffness: 600, damping: 40 },
        opacity: { duration: shouldReduceMotion ? 0 : 0.2 },
        height: { duration: shouldReduceMotion ? 0 : 0.2 }
      }}
      ref={ref}
      className={cn(
        "relative w-full overflow-hidden will-change-transform"
      )}
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: '0 120px',
        transform: 'translateZ(0)'
      } as React.CSSProperties}
    >
      <motion.div 
        className="absolute inset-0 z-0"
        style={{ backgroundColor: backgroundTransform }}
      />

      <div className="absolute inset-0 flex items-center justify-between px-6 z-10">
        <div className="flex items-center text-white font-medium">
          {isSavedSection ? (
            <Trash2 className="w-6 h-6" />
          ) : (
            <>
              {settings.swipeRightAction === 'toggleFavorite' && <Bookmark className="w-6 h-6" />}
            </>
          )}
        </div>
        <div className="flex items-center text-white font-medium">
          {isSavedSection ? (
            <Trash2 className="w-6 h-6" />
          ) : (
            <>
              {settings.swipeLeftAction === 'toggleFavorite' && <Bookmark className="w-6 h-6" />}
            </>
          )}
        </div>
      </div>

      <motion.div
        style={{ x, willChange: 'transform' }}
        drag={(isSavedSection || (settings.swipeLeftAction !== 'none' || settings.swipeRightAction !== 'none')) ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ 
          left: (isSavedSection || settings.swipeLeftAction !== 'none') ? 0.5 : 0, 
          right: (isSavedSection || settings.swipeRightAction !== 'none') ? 0.5 : 0 
        }}
        dragPropagation={false}
        dragTransition={{ bounceStiffness: 400, bounceDamping: 25 }}
        onDragEnd={handleDragEnd}
        onClick={handlePostClick}
        exit={{ x: exitX, opacity: 0, transition: { duration: 0.15, ease: "easeOut" } }}
        className={cn(
          "relative z-20 w-full p-3 cursor-pointer transition-all bg-black select-none",
          "mx-auto max-w-full",
          "opacity-100"
        )}
      >
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[90%] h-[1.5px] bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-60 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
        <div className="flex flex-col gap-2">
          {/* Image at the top */}
          {post.imageUrl && (
            <CachedImage 
              src={getSafeUrl(post.imageUrl)}
              alt="" 
              className="rounded-lg flex-shrink-0 bg-gray-800 transition-opacity w-full h-auto min-h-[120px] object-cover mb-1"
              referrerPolicy="no-referrer"
              onClick={(e) => { e.stopPropagation(); onImageClick(post.imageUrl!); }}
            />
          )}

          {/* Source and Time (below image, above title) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-medium truncate text-purple-400 shadow-[0_0_5px_rgba(168,85,247,0.3)]">
                r/{post.subredditName}
              </span>
              <span className="text-xs text-gray-500">•</span>
              <span className="text-xs text-gray-400 truncate">u/{post.author}</span>
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
              {isToday(post.createdUtc) ? format(post.createdUtc, 'HH:mm') : format(post.createdUtc, 'HH:mm dd/MM/yy')}
            </span>
          </div>

          {/* Title and Stats at the bottom */}
          <div className="flex-1 min-w-0">
            <h3 
              className="text-base font-semibold leading-tight mb-1 text-gray-100"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.title, { FORBID_ATTR: ['id', 'name'] }) }}
            />
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 font-medium">
              <span className="flex items-center gap-1"><span className="text-purple-400 shadow-[0_0_5px_rgba(168,85,247,0.3)]">↑</span> {post.score}</span>
              <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3 text-purple-400" /> {post.numComments}</span>
              {post.isFavorite && <Bookmark className="w-3 h-3 text-purple-400 fill-purple-500 ml-auto shadow-[0_0_8px_rgba(168,85,247,0.4)]" />}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});