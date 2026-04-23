import React, { useState, useMemo } from 'react';
import { X, Trash2, Headphones, ExternalLink, Plus, Calendar, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Feed, Article } from '../types';
import { CachedImage } from './CachedImage';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { useRss } from '../context/RssContext';
import DOMPurify from 'dompurify';

export const PodcastDetailsModal = React.memo(function PodcastDetailsModal({ 
  isOpen, 
  onClose,
  podcast,
  onRemove,
  onAdd,
  onArticleClick,
  isSubscribed = true
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  podcast: Feed | null;
  onRemove?: (id: string) => void;
  onAdd?: (feedUrl: string) => void;
  onArticleClick?: (article: Article) => void;
  isSubscribed?: boolean;
}) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const { articles } = useRss();

  const episodes = useMemo(() => {
    if (!podcast) return [];
    return articles
      .filter(a => a.feedId === podcast.id)
      .sort((a, b) => b.pubDate - a.pubDate)
      .slice(0, 10);
  }, [articles, podcast]);

  const sanitizedDescription = useMemo(() => {
    if (!podcast?.description) return '';
    return DOMPurify.sanitize(podcast.description, { FORBID_ATTR: ['id', 'name'] });
  }, [podcast?.description]);

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
            className="fixed bottom-0 left-0 right-0 rounded-t-3xl z-[90] p-6 pb-8 bg-black border-t border-gray-800 shadow-[0_-8px_30px_rgb(0,0,0,0.5)] flex flex-col max-h-[95vh]"
          >
            <div className="flex justify-end mb-2 flex-shrink-0">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="p-2 bg-gray-800 rounded-full"
              >
                <X className="w-5 h-5 text-gray-300" />
              </motion.button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 -mr-1 scrollbar-hide">
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
                {podcast.lastArticleDate && (
                  <div className="flex items-center gap-1.5 text-xs text-indigo-400 mb-3 bg-indigo-500/10 px-3 py-1 rounded-full mx-auto w-fit">
                    <Calendar className="w-3 h-3" />
                    <span>Last update: {format(podcast.lastArticleDate, 'dd/MM/yyyy HH:mm')}</span>
                  </div>
                )}
                {sanitizedDescription && (
                  <div 
                    className="text-sm text-gray-400 px-2 mb-6 text-left w-full leading-relaxed prose prose-invert prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
                  />
                )}
                
                {episodes.length > 0 && (
                  <div className="w-full text-left mt-2 mb-8">
                      <h3 className="text-sm font-bold text-gray-200 mb-3 border-b border-gray-800 pb-2">Latest Episodes</h3>
                      <div className="space-y-2">
                          {episodes.map(ep => (
                              <button 
                                  key={ep.id}
                                  onClick={() => {
                                      onClose(); 
                                      onArticleClick?.(ep);
                                  }}
                                  className="w-full text-left p-3 rounded-lg hover:bg-gray-800 transition-colors border border-transparent hover:border-white/5"
                              >
                                  <p className="text-sm text-gray-200 font-medium line-clamp-2 mb-1">{ep.title}</p>
                                  <p className="text-[11px] text-gray-500 font-medium tracking-wide uppercase">{format(ep.pubDate, 'dd MMM yyyy')}</p>
                              </button>
                          ))}
                      </div>
                  </div>
                )}

                <div className="space-y-3 w-full">
                <div className="flex gap-2 w-full">
                  {podcast.link && (
                    <a 
                      href={podcast.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-4 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Visit Website
                    </a>
                  )}
                  <a 
                    href={podcast.feedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-4 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors text-sm"
                    title="RSS Feed"
                  >
                    <FileText className="w-4 h-4" />
                  </a>
                </div>
                  
                  {isSubscribed ? (
                    <div className="pt-2">
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
                          "w-full p-4 rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2 text-sm",
                          isConfirmingDelete 
                            ? "bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-900/20" 
                            : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
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
                        <p className="text-[10px] text-center text-red-400 mt-2 animate-pulse uppercase tracking-wider font-bold">
                          Tap again to permanently delete
                        </p>
                      )}
                    </div>
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
                      className="w-full p-4 rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white disabled:bg-indigo-800 text-sm"
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
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});
