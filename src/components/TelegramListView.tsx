import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TelegramChannel } from '../types';
import { cn } from '../lib/utils';
import { format, isToday, isYesterday } from 'date-fns';
import { it } from 'date-fns/locale';

interface TelegramListViewProps {
  isActive: boolean;
  channels: TelegramChannel[];
  onChannelClick: (channel: TelegramChannel) => void;
  filter: 'all' | 'unread';
}

const formatChannelDate = (date: number) => {
  const d = new Date(date);
  if (isToday(d)) {
    return format(d, 'HH:mm');
  }
  if (isYesterday(d)) {
    return 'Ieri ' + format(d, 'HH:mm');
  }
  return format(d, 'dd/MM HH:mm', { locale: it });
};

export const TelegramListView = memo(({ isActive, channels, onChannelClick, filter }: TelegramListViewProps) => {
  const filteredChannels = React.useMemo(() => {
    let list = channels;
    if (filter === 'unread') {
      list = list.filter(c => (c.unreadCount || 0) > 0);
    }
    return list;
  }, [channels, filter]);

  return (
    <motion.main
      className={cn(
        "absolute inset-0 overflow-y-auto transition-opacity duration-300 will-change-transform pb-32 bg-transparent",
        isActive ? "z-10 opacity-100 pointer-events-auto" : "z-0 opacity-0 pointer-events-none"
      )}
      initial={false}
    >
      {filteredChannels.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 px-6 text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16 mb-4 text-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
            <path d="M21.5 2L2 11.5l6.5 2.5 2 6.5L14 17l5.5 4.5L21.5 2z"></path>
            <path d="M21.5 2L8.5 14"></path>
          </svg>
          <p className="text-lg font-medium text-white mb-1">
            {filter === 'unread' ? "Nessun messaggio non letto" : "Nessun canale Telegram"}
          </p>
          <p className="text-sm">
            {filter === 'unread' ? "Sei in pari con tutto!" : "Aggiungi un canale nelle impostazioni per vedere i messaggi."}
          </p>
        </div>
      ) : (
        <div className="flex-1 max-w-3xl mx-auto px-2 pt-0 pb-2 space-y-2">
          <AnimatePresence initial={false} mode="popLayout">
          {filteredChannels.map((channel, i) => (
            <motion.div 
              key={channel.id}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "50px" }}
              exit={{ 
                opacity: 0, 
                height: 0,
                marginTop: 0,
                marginBottom: 0,
                scale: 0.9 
              }}
              transition={{ type: "spring", stiffness: 250, damping: 25 }}
              onClick={() => onChannelClick(channel)}
              className={cn(
                "relative z-0 p-4 rounded-3xl flex items-center gap-4 cursor-pointer transition-colors active:scale-[0.98] select-none border border-white/10 dark:border-white/5 bg-white/5 dark:bg-black/20 backdrop-blur-xl transform-gpu"
              )}
            >
              <div className="relative z-10 flex w-full items-center gap-4">
                {channel.imageUrl ? (
                  <img 
                    src={channel.imageUrl} 
                    alt={channel.name} 
                    className="w-12 h-12 rounded-full object-cover shrink-0" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-green-900 flex items-center justify-center text-green-300 font-bold shrink-0">
                    {channel.name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-semibold text-white truncate">{channel.name}</h3>
                    {channel.lastMessageDate && (
                      <span className="text-[10px] text-gray-500 whitespace-nowrap shrink-0">
                        {formatChannelDate(channel.lastMessageDate)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 truncate">@{channel.username}</p>
                </div>
                {(channel.unreadCount || 0) > 0 && (
                  <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] shrink-0" />
                )}
              </div>
            </motion.div>
          ))}
          </AnimatePresence>
        </div>
      )}
    </motion.main>
  );
});
