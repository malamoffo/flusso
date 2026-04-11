import React, { useState } from 'react';
import { X, Trash2, Headphones, ExternalLink, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Feed } from '../types';
import { CachedImage } from './CachedImage';
import { cn } from '../lib/utils';

export const PodcastDetailsModal = React.memo(function PodcastDetailsModal({ 
  isOpen, 
  onClose,
  podcast,
  onRemove,
  onAdd,
  isSubscribed = true
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  podcast: Feed | null;
  onRemove?: (id: string) => void;
  onAdd?: (feedUrl: string) => void;
  isSubscribed?: boolean;
}) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setIsConfirmingDelete(false);
    }
  }, [isOpen]);

  if (!podcast) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[80] backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 rounded-t-3xl z-[90] p-6 pb-8 bg-black border-t border-gray-800 shadow-[0_-8px_30px_rgb(0,0,0,0.5)] flex flex-col"
          >
            <div className="flex justify-end mb-2">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="p-2 bg-gray-800 rounded-full"
              >
                <X className="w-5 h-5 text-gray-300" />
              </motion.button>
            </div>

            <div className="flex flex-col items-center text-center mb-6">
              {podcast.imageUrl ? (
                <CachedImage 
                  src={podcast.imageUrl} 
                  alt={podcast.title}
                  className="w-32 h-32 rounded-2xl object-cover shadow-xl mb-4 bg-gray-800"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-32 h-32 rounded-2xl bg-gray-800 flex items-center justify-center shadow-xl mb-4">
                  <Headphones className="w-12 h-12 text-gray-500" />
                </div>
              )}
              <h2 className="text-xl font-bold text-white leading-tight mb-2">{podcast.title}</h2>
              {podcast.description && (
                <p className="text-sm text-gray-400 line-clamp-3 px-4">{podcast.description}</p>
              )}
            </div>

            <div className="space-y-3">
              {podcast.link && (
                <a 
                  href={podcast.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Visit Website
                </a>
              )}
              
              {isSubscribed ? (
                <>
                  <button 
                    onClick={() => { 
                      if (isConfirmingDelete && onRemove) {
                        onRemove(podcast.id); 
                        onClose();
                      } else {
                        setIsConfirmingDelete(true);
                      }
                    }} 
                    className={cn(
                      "w-full p-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2",
                      isConfirmingDelete 
                        ? "bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-900/20" 
                        : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                    )}
                  >
                    {isConfirmingDelete ? (
                      <>
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                        Confirm Removal
                      </>
                    ) : 'Remove Podcast'}
                  </button>
                  {isConfirmingDelete && (
                    <p className="text-[10px] text-center text-red-400 animate-pulse uppercase tracking-wider font-bold">
                      Tap again to permanently delete
                    </p>
                  )}
                </>
              ) : (
                <button 
                  onClick={async () => {
                    if (onAdd) {
                      setIsAdding(true);
                      try {
                        await onAdd(podcast.feedUrl);
                        onClose();
                      } finally {
                        setIsAdding(false);
                      }
                    }
                  }}
                  disabled={isAdding}
                  className="w-full p-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-indigo-800"
                >
                  {isAdding ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      Add Podcast
                    </>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});
