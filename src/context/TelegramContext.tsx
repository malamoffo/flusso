import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { TelegramChannel, TelegramMessage } from '../types';
import { storage } from '../services/storage';
import DataWorker from '../workers/dataProcessor.worker?worker';
import { v4 as uuidv4 } from 'uuid';
import { fetchTelegramMessages, fetchTelegramChannelInfo } from '../services/telegramParser';
import { useSettings } from './SettingsContext';

interface TelegramContextType {
  telegramChannels: TelegramChannel[];
  telegramMessages: Record<string, TelegramMessage[]>;
  addTelegramChannel: (username: string) => Promise<void>;
  removeTelegramChannel: (id: string) => void;
  refreshTelegramChannels: (channelsToRefresh?: TelegramChannel[]) => Promise<void>;
  loadTelegramMessages: (channelId: string) => Promise<void>;
  loadMoreTelegramMessages: (channelId: string) => Promise<void>;
  markAllTelegramAsRead: () => Promise<void>;
  markTelegramChannelAsRead: (channelId: string) => Promise<void>;
}

const TelegramContext = createContext<TelegramContextType | undefined>(undefined);

export const TelegramProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [telegramChannels, setTelegramChannels] = useState<TelegramChannel[]>([]);
  const [telegramMessages, setTelegramMessages] = useState<Record<string, TelegramMessage[]>>({});
  const { settings } = useSettings();
  
  const telegramChannelsRef = useRef<TelegramChannel[]>([]);
  const telegramMessagesRef = useRef<Record<string, TelegramMessage[]>>({});
  const worker = useRef<Worker>();

  useEffect(() => {
    worker.current = new DataWorker();
    return () => worker.current?.terminate();
  }, []);

  useEffect(() => {
    telegramChannelsRef.current = telegramChannels;
    telegramMessagesRef.current = telegramMessages;
  }, [telegramChannels, telegramMessages]);

  const loadData = useCallback(async () => {
    const loadedTelegramChannels = await storage.getTelegramChannels();
    setTelegramChannels(loadedTelegramChannels);
    const messages: Record<string, TelegramMessage[]> = {};
    for (const channel of loadedTelegramChannels) {
      messages[channel.id] = await storage.getTelegramMessages(channel.id);
    }
    setTelegramMessages(messages);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addTelegramChannel = useCallback(async (username: string) => {
    try {
      const cleanUsername = username.replace('@', '').replace('https://t.me/', '').split('/')[0].trim();
      
      const existing = telegramChannels.find(c => c.username.toLowerCase() === cleanUsername.toLowerCase());
      if (existing) {
        throw new Error("Sei già iscritto a questo canale Telegram.");
      }
      
      const [messages, info] = await Promise.all([
        fetchTelegramMessages(cleanUsername),
        fetchTelegramChannelInfo(cleanUsername)
      ]);
      
      const channel: TelegramChannel = {
        id: uuidv4(),
        name: info.name,
        username: cleanUsername,
        imageUrl: info.imageUrl,
        lastMessageDate: messages.length > 0 ? messages[messages.length - 1].date : Date.now(),
        lastChecked: Date.now(),
        unreadCount: messages.length,
        lastOpened: Date.now(),
        retentionDays: 30,
      };
      await storage.addTelegramChannel(channel);
      setTelegramChannels(prev => [...prev, channel]);
      setTelegramMessages(prev => ({ ...prev, [channel.id]: messages }));
      storage.saveTelegramMessages(channel.id, messages);
    } catch (e: any) {
      const errMsg = e.message || "Canale Telegram non trovato o non accessibile";
      throw new Error(errMsg);
    }
  }, [telegramChannels]);

  const removeTelegramChannel = useCallback((id: string) => {
    setTelegramChannels(prev => prev.filter(c => c.id !== id));
    setTelegramMessages(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    storage.removeTelegramChannel(id);
  }, []);

  const cleanupTelegramMessages = useCallback((channel: TelegramChannel, messages: TelegramMessage[]) => {
    const retentionMs = settings.telegramRetentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return messages.filter(m => now - m.date < retentionMs);
  }, [settings.telegramRetentionDays]);

  const refreshTelegramChannels = useCallback(async (channelsToRefresh?: TelegramChannel[]) => {
    const channels = channelsToRefresh || telegramChannelsRef.current;
    
    const queue = [...channels];
    let queueIndex = 0;
    const CONCURRENCY = Math.min(3, queue.length);
    
    let mergeChain = Promise.resolve();
    
    const workers = Array(CONCURRENCY).fill(null).map(async () => {
      while (true) {
        const channel = queue[queueIndex++];
        if (!channel) break;
        
        try {
          const currentMessages = telegramMessagesRef.current[channel.id] || [];
          const sinceDate = currentMessages.length > 0 ? currentMessages[currentMessages.length - 1].date : undefined;

          const [messages, info] = await Promise.all([
            fetchTelegramMessages(channel.username, sinceDate),
            fetchTelegramChannelInfo(channel.username)
          ]);
          
          if (messages.length > 0) {
            await (mergeChain = mergeChain.then(async () => {
              const { merged } = await new Promise<{ merged: TelegramMessage[] }>((resolve, reject) => {
                const requestId = uuidv4();
                const timeout = setTimeout(() => {
                  worker.current!.removeEventListener('message', handler);
                  reject(new Error('Worker timeout'));
                }, 10000);

                const handler = (e: MessageEvent) => {
                  if (e.data.type === 'mergedTelegramMessages' && e.data.requestId === requestId) {
                    clearTimeout(timeout);
                    worker.current!.removeEventListener('message', handler);
                    resolve(e.data);
                  }
                };
                worker.current!.addEventListener('message', handler);
                worker.current!.postMessage({ 
                  type: 'mergeTelegramMessages', 
                  prev: telegramMessagesRef.current[channel.id] || [], 
                  incoming: messages,
                  requestId
                });
              }).catch(err => {
                console.error('Telegram merge failed:', err);
                return { merged: telegramMessagesRef.current[channel.id] || [] };
              });
              
              const cleaned = cleanupTelegramMessages(channel, merged);
              setTelegramMessages(prev => {
                const next = { ...prev, [channel.id]: cleaned };
                telegramMessagesRef.current = next;
                return next;
              });
              await storage.saveTelegramMessages(channel.id, cleaned);
            }));
          }
        } catch (e) {
          console.error(`Failed to refresh channel ${channel.username}`, e);
        }
      }
    });

    await Promise.all(workers);
    await mergeChain;
  }, [cleanupTelegramMessages]);

  const loadTelegramMessages = useCallback(async (channelId: string) => {
    const messages = await storage.getTelegramMessages(channelId);
    setTelegramMessages(prev => ({ ...prev, [channelId]: messages }));
  }, []);

  const loadMoreTelegramMessages = useCallback(async (channelId: string) => {
    // Implementation of loadMoreTelegramMessages
  }, []);

  const markAllTelegramAsRead = useCallback(async () => {
    // Implementation of markAllTelegramAsRead
  }, []);

  const markTelegramChannelAsRead = useCallback(async (channelId: string) => {
    // Implementation of markTelegramChannelAsRead
  }, []);

  return (
    <TelegramContext.Provider value={{
      telegramChannels, telegramMessages,
      addTelegramChannel, removeTelegramChannel, refreshTelegramChannels,
      loadTelegramMessages, loadMoreTelegramMessages,
      markAllTelegramAsRead, markTelegramChannelAsRead
    }}>
      {children}
    </TelegramContext.Provider>
  );
};

export const useTelegram = () => {
  const context = useContext(TelegramContext);
  if (context === undefined) {
    throw new Error('useTelegram must be used within a TelegramProvider');
  }
  return context;
};
