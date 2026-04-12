import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { TelegramChannel } from '../types';
import { cn } from '../lib/utils';
import { MessageSquare, Check } from 'lucide-react';

interface TelegramListViewProps {
  isActive: boolean;
  channels: TelegramChannel[];
  onChannelClick: (channel: TelegramChannel) => void;
  onMarkAllAsRead: () => void;
  filter: 'all' | 'unread';
}

export const TelegramListView = memo(({ isActive, channels, onChannelClick, onMarkAllAsRead, filter }: TelegramListViewProps) => {
  const filteredChannels = React.useMemo(() => {
    if (filter === 'unread') {
      return channels.filter(c => c.unreadCount > 0);
    }
    return channels;
  }, [channels, filter]);

  return (
    <motion.main
      className={cn(
        "absolute inset-0 overflow-y-auto transition-all duration-300 will-change-transform pb-32",
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
            {filter === 'unread' ? "No unread messages" : "No Telegram channels"}
          </p>
          <p className="text-sm">
            {filter === 'unread' ? "You're all caught up!" : "Add a channel in settings to see messages here."}
          </p>
        </div>
      ) : (
        <div className="flex-1 max-w-3xl mx-auto px-1 py-1">
          {filteredChannels.map(channel => (
            <div 
              key={channel.id}
              onClick={() => onChannelClick(channel)}
              className="p-4 border-b border-gray-800 flex items-center gap-4 cursor-pointer hover:bg-gray-900"
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
                      {new Date(channel.lastMessageDate).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 truncate">@{channel.username}</p>
              </div>
              {channel.unreadCount > 0 && (
                <div className="w-3 h-3 rounded-full bg-green-500" />
              )}
            </div>
          ))}
        </div>
      )}
      
      {channels.some(c => c.unreadCount > 0) && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={onMarkAllAsRead}
          className="fixed bottom-24 right-6 w-14 h-14 bg-green-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-green-700 transition-colors z-20"
          aria-label="Mark all as read"
        >
          <Check className="w-6 h-6" />
        </motion.button>
      )}
    </motion.main>
  );
});
