import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, X, SkipBack, SkipForward, RefreshCw } from 'lucide-react';
import { useAudioState, useAudioProgress } from '../context/AudioPlayerContext';
import { Article } from '../types';
import { cn, formatTime } from '../lib/utils';

export function PersistentPlayer({ onNavigate }: { onNavigate?: (article: Article) => void }) {
  const { currentTrack, isPlaying, isBuffering, toggle, seek, stop } = useAudioState();

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
        <div className="px-4 py-3 flex items-center gap-3">
          {/* Thumbnail */}
          {currentTrack.imageUrl && (
            <img 
              src={currentTrack.imageUrl} 
              alt="" 
              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
              referrerPolicy="no-referrer"
            />
          )}
          
          {/* Info */}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-white truncate">
              {currentTrack.title}
            </h4>
            <PlayerProgressBar />
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-2">
            <SeekButton direction="backward" />
            
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { e.stopPropagation(); toggle(); }}
              className={cn(
                "p-2 bg-indigo-600 text-white rounded-full shadow-sm hover:bg-indigo-700 transition-colors relative",
                isLoadingAudio && "animate-pulse"
              )}
            >
              {isLoadingAudio ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </motion.button>
            
            <SeekButton direction="forward" />
            
            <button 
              onClick={(e) => { e.stopPropagation(); stop(); }}
              className="p-1.5 text-gray-400 hover:text-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * ⚡ Bolt: Isolated progress bar to prevent the whole player from re-rendering every second.
 */
const PlayerProgressBar = React.memo(function PlayerProgressBar() {
  const { progress, duration } = useAudioProgress();
  const progressPercent = (progress / duration) * 100 || 0;

  return (
    <div className="flex items-center gap-2 text-[10px] font-medium text-indigo-400 mt-1">
      <span className="w-14 flex-shrink-0 text-left whitespace-nowrap">{formatTime(progress)}</span>
      <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
        <div 
          className="h-full bg-indigo-500 transition-all duration-200" 
          style={{ width: `${progressPercent}%` }} 
        />
      </div>
      <span className="w-14 flex-shrink-0 text-right whitespace-nowrap">{formatTime(Math.max(0, duration - progress))}</span>
    </div>
  );
});

/**
 * ⚡ Bolt: Isolated seek buttons to prevent unnecessary re-renders.
 */
function SeekButton({ direction }: { direction: 'forward' | 'backward' }) {
  const { seek } = useAudioState();
  const { progress, duration } = useAudioProgress();

  const handleSeek = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (direction === 'backward') {
      seek(Math.max(0, progress - 10));
    } else {
      seek(Math.min(duration, progress + 30));
    }
  };

  return (
    <button 
      onClick={handleSeek}
      className="p-1.5 text-gray-300 hover:bg-gray-800 rounded-full"
    >
      {direction === 'backward' ? (
        <SkipBack className="w-4 h-4 fill-current" />
      ) : (
        <SkipForward className="w-4 h-4 fill-current" />
      )}
    </button>
  );
}
