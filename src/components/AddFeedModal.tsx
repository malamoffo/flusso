import React, { useState } from 'react';
import { X, Rss, RefreshCw } from 'lucide-react';
import { useRss } from '../context/RssContext';
import { useTelegram } from '../context/TelegramContext';
import { useReddit } from '../context/RedditContext';
import { motion, AnimatePresence } from 'framer-motion';

export const AddFeedModal = React.memo(function AddFeedModal({ isOpen, onClose, onFeedAdded }: { isOpen: boolean; onClose: () => void; onFeedAdded?: (type: string) => void }) {
  const [url, setUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addFeedOrSubreddit, error, setError, progress } = useRss();
  const { addTelegramChannel } = useTelegram();
  const { addSubreddit } = useReddit();

  React.useEffect(() => {
    if (isOpen) {
      setError(null);
    }
  }, [isOpen, setError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    setIsSubmitting(true);
    try {
      let type;
      let cleanUrl = url.trim();
      const lowerUrl = cleanUrl.toLowerCase();

      // Ensure https:// is prepended if no protocol is specified and it's not a special shortcut
      if (!lowerUrl.startsWith('http://') && !lowerUrl.startsWith('https://') && !lowerUrl.startsWith('r/') && !lowerUrl.startsWith('@')) {
        cleanUrl = 'https://' + cleanUrl;
      }

      if (lowerUrl.startsWith('r/') || lowerUrl.includes('reddit.com/r/')) {
        await addSubreddit(cleanUrl);
        type = 'subreddit';
      } else {
        type = await addFeedOrSubreddit(cleanUrl);
      }
      
      // If it's a telegram channel, we need to call the telegram context
      if (type === 'telegram') {
        try {
          await addTelegramChannel(cleanUrl);
        } catch (tgErr: any) {
          setError(tgErr.message);
          setIsSubmitting(false);
          return;
        }
      }
      
      setUrl('');
      if (onFeedAdded && type) {
        onFeedAdded(type);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Errore durante l'aggiunta. Riprova.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (error) setError(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 rounded-t-[28px] z-[70] p-6 pb-8 border-t shadow-[0_-8px_30px_rgb(0,0,0,0.5)] border-white/10 dark:border-white/5 bg-white/5 dark:bg-black/20 backdrop-blur-xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Add Item</h2>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="p-2 bg-gray-800 rounded-full"
                aria-label="Close modal"
              >
                <X className="w-5 h-5 text-gray-300" aria-hidden="true" />
              </motion.button>
            </div>

            {progress && (
              <div className="mb-6 p-4 rounded-2xl bg-indigo-900/20 border border-indigo-800">
                <div className="flex justify-between items-center text-sm font-medium text-indigo-300 mb-2 gap-2">
                  <span className="truncate">{progress.status || 'Importing...'}</span>
                  <span className="flex-shrink-0">{Math.round((progress.current / progress.total) * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-indigo-900/40 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-indigo-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-red-900/30 text-red-400 rounded-xl text-sm border border-red-800/50 flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                {error}
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="mb-6">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Rss className="h-5 w-5 text-gray-500" aria-hidden="true" />
                </div>
                <input
                  type="text"
                  value={url}
                  onChange={handleUrlChange}
                  placeholder="https://example.com/feed.xml, r/news or channel_username"
                  className="block w-full pl-10 pr-3 py-3 border border-gray-700 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 bg-gray-800 text-white placeholder-gray-500"
                  required
                  aria-label="Feed URL, Subreddit or Telegram Channel"
                />
              </div>
              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isSubmitting || !url}
                className="mt-4 w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                    Adding...
                  </>
                ) : '+ Add Feed / Subreddit / Channel'}
              </motion.button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});
