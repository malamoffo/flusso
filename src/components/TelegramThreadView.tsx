import React, { memo, useEffect, useRef, useState } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { TelegramChannel, TelegramMessage } from '../types';
import { ArrowLeft, RefreshCw, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

interface TelegramThreadViewProps {
  channel: TelegramChannel;
  messages: TelegramMessage[];
  onClose: () => void;
  onRefresh?: () => void;
  onLoadMore?: () => Promise<void>;
}

export const TelegramThreadView = memo(({ channel, messages, onClose, onRefresh, onLoadMore }: TelegramThreadViewProps) => {
  const controls = useDragControls();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const isLoading = messages === undefined;
  const isEmpty = Array.isArray(messages) && messages.length === 0;

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      });
    }
  };

  const handleScroll = async () => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0 && onLoadMore && !isFetchingMore) {
      const prevScrollHeight = scrollRef.current.scrollHeight;
      setIsFetchingMore(true);
      await onLoadMore();
      setIsFetchingMore(false);
      
      // Wait for DOM to update and then restore scroll position
      setTimeout(() => {
        if (scrollRef.current) {
          const newScrollHeight = scrollRef.current.scrollHeight;
          scrollRef.current.scrollTop = newScrollHeight - prevScrollHeight;
        }
      }, 0);
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
        // Only scroll if we are already near the bottom
        const isNearBottom = scrollRef.current && (scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight < 100);
        if (isNearBottom) {
          scrollToBottom('smooth');
        }
      }
    }
  }, [messages?.length]);

  useEffect(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => { 
      document.body.style.overflow = '';
      document.body.style.paddingRight = ''; 
    };
  }, []);

  return (
    <motion.div key={`reader-wrapper-${channel.id}`} className="contents">
      <motion.div 
        key={`backdrop-${channel.id}`}
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed inset-0 bg-black/80 z-[40]"
        onClick={onClose}
      />
      <motion.article 
        key={`modal-${channel.id}`}
        layoutId={`telegram-${channel.id}`}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 z-50 h-[92vh] overflow-hidden flex flex-col transition-colors break-words font-sans bg-[#0A0A10] sm:bg-[#0A0A10]/95 sm:backdrop-blur-xl rounded-t-[2.5rem] border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] will-change-transform isolate"
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.1, bottom: 0.8 }}
        onDragEnd={(e, info) => {
          if (info.offset.y > 100 || info.velocity.y > 500) {
            onClose();
          }
        }}
      >
        <div 
          onPointerDown={(e) => controls.start(e)}
          className="absolute top-0 left-0 right-0 h-12 z-[60] cursor-grab active:cursor-grabbing flex items-center justify-center pointer-events-auto touch-none"
        >
          <div className="w-12 h-1.5 bg-white/20 rounded-full" />
        </div>
        
        <style dangerouslySetInnerHTML={{ __html: `
        .telegram-message-text a {
          color: #4ade80;
          text-decoration: none;
        }
        .telegram-message-text a:hover {
          text-decoration: underline;
        }
      `}} />
        <header className="sticky top-0 z-20 px-4 py-6 mt-4 flex items-center bg-gradient-to-b from-[#0A0A10]/90 to-[#0A0A10]/0 pointer-events-none">
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 border border-white/20 active:bg-white/20 text-white pointer-events-auto backdrop-blur-md transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center ml-4 gap-3 pointer-events-auto backdrop-blur-md px-4 py-2 rounded-full border border-white/10 bg-white/5 shadow-xl">
            {channel.imageUrl && (
              <img 
                src={channel.imageUrl} 
                alt="" 
                className="w-6 h-6 rounded-full object-cover" 
                referrerPolicy="no-referrer"
              />
            )}
            <h2 className="text-sm font-bold text-white tracking-wide">{channel.name}</h2>
          </div>
        </header>

        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overscroll-contain px-4 pb-20 max-w-3xl mx-auto w-full"
        >
        {isFetchingMore && (
          <div className="flex justify-center py-4">
            <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4">
            <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin shadow-[0_0_10px_rgba(34,197,94,0.4)]" />
            <p className="text-sm font-medium">Caricamento messaggi...</p>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4 p-6 text-center">
            <MessageSquare className="w-12 h-12 opacity-20" />
            <div>
              <p className="text-sm font-medium text-white">Nessun messaggio recente</p>
              <p className="text-xs mt-1">I messaggi fuori dal periodo di retention sono stati nascosti.</p>
            </div>
            <button 
              onClick={() => {
                if (onRefresh) onRefresh();
              }}
              className="px-6 py-2.5 bg-green-600 text-white rounded-full text-sm font-bold hover:bg-green-700 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)] flex items-center gap-2 active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              Aggiorna Canale
            </button>
          </div>
        ) : (
          Array.from(new Map(messages?.map(m => [m.id, m])).values()).map(message => {
            const isNew = message.date > (channel.lastOpened || 0);
            return (
              <div key={`${message.channelId}-${message.id}`} className={cn(
                "mb-4 p-5 rounded-[2rem] relative transition-all shadow-lg select-none bg-[#161622] border-2 border-green-500/30"
              )}>
                {isNew && (
                  <span className="absolute top-2 right-2 z-30 px-2 py-0.5 bg-green-500 text-[9px] font-black text-black rounded-full shadow-[0_0_10px_rgba(34,197,94,0.6)] border border-green-400 uppercase tracking-widest">
                    NEW
                  </span>
                )}
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
                  />
                )}
                <p className="text-xs text-gray-500 mt-2">{format(message.date, 'HH:mm dd/MM/yy')}</p>
              </div>
            );
          })
        )}
      </div>
    </motion.article>
    </motion.div>
  );
});
