import React, { memo } from 'react';
import { motion } from 'framer-motion';
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
        "absolute inset-0 overflow-y-auto transition-all duration-300 will-change-transform pb-32 bg-transparent",
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
        <div className="flex-1 max-w-3xl mx-auto px-2 py-2 space-y-2">
          {filteredChannels.map((channel, i) => (
            <motion.div 
              key={channel.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "100px" }}
              transition={{ type: "spring", stiffness: 300, damping: 25, delay: i * 0.05 }}
              onClick={() => onChannelClick(channel)}
              className={cn(
                "relative p-4 rounded-3xl shadow-xl flex items-center gap-4 cursor-pointer bg-white/[0.08] backdrop-blur-xl border border-white/[0.15] border-green-500/20 transition-all active:scale-[0.98] active:bg-white/5"
              )}
            >
              {channel.imageUrl ? (
                <img 
                  src={channel.imageUrl} 
                  alt={channel.name} 
                  className="w-12 h-12 rounded-full object-cover" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-green-900 flex items-center justify-center text-green-300 font-bold">
                  {channel.name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-white truncate">{channel.name}</h3>
                  {channel.lastMessageDate && (
                    <span className="text-[10px] text-gray-500 whitespace-nowrap">
                      {formatChannelDate(channel.lastMessageDate)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 truncate">@{channel.username}</p>
              </div>
              {(channel.unreadCount || 0) > 0 && (
                <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.main>
  );
});
