import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, X, SkipBack, SkipForward } from 'lucide-react';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { Article } from '../types';
import { cn } from '../lib/utils';

export function PersistentPlayer({ onNavigate }: { onNavigate?: (article: Article) => void }) {
  const { currentTrack, isPlaying, progress, duration, toggle, seek, stop } = useAudioPlayer();

  if (!currentTrack) return null;

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercent = (progress / duration) * 100 || 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        onClick={() => onNavigate?.(currentTrack)}
        className={cn(
          "fixed bottom-16 left-0 right-0 z-40 mx-2 mb-2 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 backdrop-blur-md transition-colors cursor-pointer",
          "bg-white/90 dark:bg-gray-900/90"
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
            <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">
              {currentTrack.title}
            </h4>
            <div className="flex items-center gap-2 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 mt-1">
              <span className="w-8 text-left">{formatTime(progress)}</span>
              <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-500 transition-all duration-200" 
                  style={{ width: `${progressPercent}%` }} 
                />
              </div>
              <span className="w-8 text-right">{formatTime(Math.max(0, duration - progress))}</span>
            </div>
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); seek(Math.max(0, progress - 10)); }}
              className="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>
            
            <button 
              onClick={(e) => { e.stopPropagation(); toggle(); }}
              className="p-2 bg-indigo-600 text-white rounded-full shadow-sm hover:bg-indigo-700 transition-colors"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>
            
            <button 
              onClick={(e) => { e.stopPropagation(); seek(Math.min(duration, progress + 30)); }}
              className="p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>
            
            <button 
              onClick={(e) => { e.stopPropagation(); stop(); }}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
