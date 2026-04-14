import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { TelegramChannel, TelegramMessage } from '../types';
import { storage } from '../services/storage';
import DataWorker from '../workers/dataProcessor.worker.ts?worker';
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
  const worker = useRef<Worker | undefined>(undefined);

  useEffect(() => {
    worker.current = new DataWorker();
    return () => worker.current?.terminate();
  }, []);

  useEffect(() => {
    telegramChannelsRef.current = telegramChannels;
    telegramMessagesRef.current = telegramMessages;
  }, [telegramChannels, telegramMessages]);

  const loadData = useCallback(async () => {
    await storage.cleanupOldTelegramMessages();
    const loadedTelegramChannels = await storage.getTelegramChannels();
    setTelegramChannels(loadedTelegramChannels);
    // Don't load all messages at once, they will be loaded on demand when a channel is selected
    setTelegramMessages({});
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addTelegramChannel = useCallback(async (username: string) => {
    try {
      // ... existing cleaning logic ...
      let cleanUsername = username.trim();
      cleanUsername = cleanUsername.replace(/^https?:\/\//, '').replace(/^t\.me\//, '');
      if (cleanUsername.startsWith('s/')) cleanUsername = cleanUsername.substring(2);
      cleanUsername = cleanUsername.replace('@', '').split('/')[0].split('?')[0].trim();
      
      if (!cleanUsername) throw new Error("Inserisci un nome utente o un link Telegram valido.");
      
      const existing = telegramChannels.find(c => c.username.toLowerCase() === cleanUsername.toLowerCase());
      if (existing) throw new Error("Sei già iscritto a questo canale Telegram.");
      
      const channelId = uuidv4();
      const [messages, info] = await Promise.all([
        fetchTelegramMessages(cleanUsername, undefined, undefined, channelId),
        fetchTelegramChannelInfo(cleanUsername)
      ]);
      
      if (!messages || messages.length === 0) {
        throw new Error("Questo canale non ha una preview pubblica o non contiene messaggi accessibili.");
      }
      
      const channel: TelegramChannel = {
        id: channelId,
        name: info.name,
        username: cleanUsername,
        imageUrl: info.imageUrl,
        lastMessageDate: (messages && messages.length > 0) ? messages[messages.length - 1].date : Date.now(),
        lastChecked: Date.now(),
        unreadCount: messages ? messages.length : 0,
        lastOpened: Date.now(),
      };
      await storage.addTelegramChannel(channel);
      setTelegramChannels(prev => [...prev, channel]);
      setTelegramMessages(prev => ({ ...prev, [channel.id]: messages }));
      storage.saveTelegramMessages(channel.id, messages);
    } catch (e: any) {
      console.error('Error adding Telegram channel:', e);
      const errMsg = e.message || "Canale Telegram non trovato o non accessibile. Assicurati che il canale sia pubblico.";
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
    const retentionMs = 1 * 24 * 60 * 60 * 1000; // Force 1 day retention
    const now = Date.now();
    return messages.filter(m => now - m.date < retentionMs);
  }, []);

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
            fetchTelegramMessages(channel.username, sinceDate, undefined, channel.id),
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
    const channel = telegramChannelsRef.current.find(c => c.id === channelId);
    const messages = await storage.getTelegramMessages(channelId, channel?.username);
    setTelegramMessages(prev => ({ ...prev, [channelId]: messages }));
    
    if (messages.length === 0 && channel) {
      refreshTelegramChannels([channel]);
    }
  }, [refreshTelegramChannels]);

  const loadMoreTelegramMessages = useCallback(async (channelId: string) => {
    // Implementation of loadMoreTelegramMessages
  }, []);

  const markAllTelegramAsRead = useCallback(async () => {
    setTelegramChannels(prev => prev.map(c => ({ ...c, unreadCount: 0 })));
    const channels = telegramChannelsRef.current;
    await Promise.all(channels.map(c => storage.updateTelegramChannel(c.id, { unreadCount: 0 })));
  }, []);

  const markTelegramChannelAsRead = useCallback(async (channelId: string) => {
    setTelegramChannels(prev => prev.map(c => 
      c.id === channelId ? { ...c, unreadCount: 0 } : c
    ));
    await storage.updateTelegramChannel(channelId, { unreadCount: 0 });
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
