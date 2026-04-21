import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, X, RotateCcw, RotateCw, RefreshCw } from 'lucide-react';
import { useAudioStore } from '../store/audioStore';
import { useShallow } from 'zustand/react/shallow';
import { Article } from '../types';
import { cn, formatTime } from '../lib/utils';
import { CachedImage } from './CachedImage';

export const PersistentPlayer = React.memo(function PersistentPlayer({ onNavigate }: { onNavigate?: (article: Article) => void }) {
  const { currentTrack, isPlaying, isBuffering, toggle, stop } = useAudioStore(useShallow(s => ({
    currentTrack: s.currentTrack,
    isPlaying: s.isPlaying,
    isBuffering: s.isBuffering,
    toggle: s.toggle,
    stop: s.stop,
  })));

  if (!currentTrack) return null;

  const isLoadingAudio = isBuffering;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        onClick={() => onNavigate?.(currentTrack)}
        className={cn(
          "fixed bottom-16 left-0 right-0 z-40 mx-2 mb-2 rounded-xl shadow-lg border border-gray-800 backdrop-blur-md transition-colors cursor-pointer",
          "bg-gray-900/90"
        )}
      >
        <div className="px-3 py-2.5 flex items-center gap-2">
          {/* Thumbnail */}
          {currentTrack.imageUrl && (
            <CachedImage 
              src={currentTrack.imageUrl} 
              alt="" 
              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              referrerPolicy="no-referrer"
            />
          )}
          
          {/* Info */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <PlayerTitle track={currentTrack} />
            <PlayerProgressBar />
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-1">
            <SeekButton direction="backward" />
            
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { e.stopPropagation(); toggle(); }}
              className={cn(
                "w-10 h-10 flex items-center justify-center bg-indigo-600 text-white rounded-full shadow-sm hover:bg-indigo-700 transition-colors relative flex-shrink-0",
                isLoadingAudio && "animate-pulse"
              )}
            >
              {isLoadingAudio ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-1" />
              )}
            </motion.button>
            
            <SeekButton direction="forward" />
            
            <button 
              onClick={(e) => { e.stopPropagation(); stop(); }}
              className="p-1 text-gray-400 hover:text-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

/**
 * ⚡ Bolt: Isolated title component to show current chapter.
 */
const PlayerTitle = React.memo(function PlayerTitle({ track }: { track: Article }) {
  const progress = useAudioStore(s => s.progress);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const textRef = React.useRef<HTMLHeadingElement>(null);
  const [scrollDistance, setScrollDistance] = React.useState(0);
  const [textWidth, setTextWidth] = React.useState(0);
  
  let displayTitle = track.title;
  if (track.chapters && track.chapters.length > 0) {
    const currentChapter = [...track.chapters].reverse().find(c => progress >= c.startTime);
    if (currentChapter) {
      displayTitle = `${currentChapter.title} • ${track.title}`;
    }
  }

  React.useEffect(() => {
    if (containerRef.current && textRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      // Reset padding to measure true width
      textRef.current.style.paddingRight = '0px';
      const tWidth = textRef.current.offsetWidth;
      setTextWidth(tWidth);
      if (tWidth > containerWidth) {
        setScrollDistance(tWidth - containerWidth);
      } else {
        setScrollDistance(0);
      }
    }
  }, [displayTitle]);

  return (
    <div className="overflow-hidden whitespace-nowrap relative w-full" ref={containerRef}>
      <motion.div
        className="inline-block"
        animate={scrollDistance > 0 ? { x: [0, -textWidth - 24] } : { x: 0 }}
        transition={scrollDistance > 0 ? { repeat: Infinity, duration: (textWidth + 24) / 30, ease: "linear" } : {}}
      >
        <h4 
          className="text-sm font-bold text-white inline-block" 
          style={{ paddingRight: scrollDistance > 0 ? 24 : 0 }} 
          ref={textRef}
        >
          {displayTitle}
        </h4>
        {scrollDistance > 0 && (
          <h4 className="text-sm font-bold text-white inline-block" style={{ paddingRight: 24 }}>
            {displayTitle}
          </h4>
        )}
      </motion.div>
    </div>
  );
});

/**
 * ⚡ Bolt: Isolated progress bar to prevent the whole player from re-rendering every second.
 */
const PlayerProgressBar = React.memo(function PlayerProgressBar() {
  const { progress, duration } = useAudioStore(useShallow(s => ({ progress: s.progress, duration: s.duration })));
  const progressPercent = (progress / duration) * 100 || 0;

  return (
    <div className="flex items-center gap-1.5 text-[10px] font-medium text-indigo-400 mt-1 tabular-nums w-full">
      <span className="flex-shrink-0 text-left whitespace-nowrap min-w-[32px]">{formatTime(progress)}</span>
      <div className="flex-1 min-w-[20px] h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div 
          className="h-full bg-indigo-500 transition-all duration-200" 
          style={{ width: `${progressPercent}%` }} 
        />
      </div>
      <span className="flex-shrink-0 text-right whitespace-nowrap min-w-[36px]">-{formatTime(Math.max(0, duration - progress))}</span>
    </div>
  );
});

/**
 * ⚡ Bolt: Isolated seek buttons to prevent unnecessary re-renders.
 */
function SeekButton({ direction }: { direction: 'forward' | 'backward' }) {
  const { seek, progress, duration } = useAudioStore(useShallow(s => ({
    seek: s.seek,
    progress: s.progress,
    duration: s.duration
  })));

  const handleSeek = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (direction === 'backward') {
      seek(Math.max(0, progress - 15));
    } else {
      seek(Math.min(duration, progress + 15));
    }
  };

  return (
    <button 
      onClick={handleSeek}
      className="p-2 text-gray-300 hover:bg-gray-800 rounded-full transition-colors"
    >
      {direction === 'backward' ? (
        <div className="relative">
          <RotateCcw className="w-5 h-5" />
          <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold mt-0.5">15</span>
        </div>
      ) : (
        <div className="relative">
          <RotateCw className="w-5 h-5" />
          <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold mt-0.5">15</span>
        </div>
      )}
    </button>
  );
}
