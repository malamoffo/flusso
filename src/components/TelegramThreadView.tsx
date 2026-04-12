import React, { memo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { TelegramChannel, TelegramMessage } from '../types';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

interface TelegramThreadViewProps {
  channel: TelegramChannel;
  messages: TelegramMessage[];
  onClose: () => void;
  onRefresh?: () => void;
}

export const TelegramThreadView = memo(({ channel, messages, onClose, onRefresh }: TelegramThreadViewProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);
  const isLoading = messages === undefined;
  const isEmpty = messages && messages.length === 0;

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      });
    }
  };

  // Scroll to bottom on initial load and when new messages arrive
  useEffect(() => {
    if (messages && messages.length > 0) {
      if (isInitialMount.current) {
        // Use a small timeout to ensure DOM is fully rendered and images have started loading
        const timer = setTimeout(() => {
          scrollToBottom('auto');
          isInitialMount.current = false;
        }, 100);
        return () => clearTimeout(timer);
      } else {
        scrollToBottom('smooth');
      }
    }
  }, [messages?.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .telegram-message-text a {
          color: #4ade80;
          text-decoration: none;
        }
        .telegram-message-text a:hover {
          text-decoration: underline;
        }
      `}} />
      <header className="flex items-center p-4 border-b border-gray-800 bg-black/80 backdrop-blur-md z-10">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-800 text-gray-300 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex items-center ml-4 gap-3">
          {channel.imageUrl && (
            <img 
              src={channel.imageUrl} 
              alt="" 
              className="w-8 h-8 rounded-full object-cover" 
              referrerPolicy="no-referrer"
            />
          )}
          <h2 className="text-lg font-bold text-white">{channel.name}</h2>
        </div>
      </header>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full"
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4">
            <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin shadow-[0_0_10px_rgba(34,197,94,0.4)]" />
            <p className="text-sm font-medium">Caricamento messaggi...</p>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4">
            <p className="text-sm font-medium">Nessun messaggio trovato</p>
            <button 
              onClick={onRefresh}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Riprova
            </button>
          </div>
        ) : (
          messages.map(message => (
            <div key={message.id} className="mb-4 p-3 bg-gray-900 rounded-lg">
              <div 
                className="text-gray-300 whitespace-pre-wrap break-words telegram-message-text"
                dangerouslySetInnerHTML={{ __html: message.text }}
              />
              {message.imageUrl && (
                <img 
                  src={message.imageUrl} 
                  alt="" 
                  className="mt-2 rounded-lg max-h-96 w-full object-cover" 
                  referrerPolicy="no-referrer"
                  onLoad={() => {
                    // If we are still at the bottom (or near it), scroll again when image loads
                    if (scrollRef.current) {
                      const isNearBottom = scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight < 100;
                      if (isNearBottom || isInitialMount.current) {
                        scrollToBottom(isInitialMount.current ? 'auto' : 'smooth');
                      }
                    }
                  }}
                />
              )}
              <p className="text-xs text-gray-500 mt-2">{format(message.date, 'HH:mm dd/MM/yy')}</p>
              <div className="mt-4 w-[90%] h-[1.5px] mx-auto bg-gradient-to-r from-transparent via-green-500 to-transparent opacity-60 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
});
