import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { TelegramChannel, TelegramMessage } from '../types';
import { storage } from '../services/storage';
import DataWorker from '../workers/dataProcessor.worker.ts?worker';
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
  enforceRetention: () => Promise<void>;
}

const TelegramContext = createContext<TelegramContextType | undefined>(undefined);

export const TelegramProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [telegramChannels, setTelegramChannels] = useState<TelegramChannel[]>([]);
  const [telegramMessages, setTelegramMessages] = useState<Record<string, TelegramMessage[]>>({});
  const { settings } = useSettings();
  
  const telegramChannelsRef = useRef<TelegramChannel[]>([]);
  const telegramMessagesRef = useRef<Record<string, TelegramMessage[]>>({});
  const worker = useRef<Worker | undefined>(undefined);
  const telegramMessageOffsets = useRef<Record<string, number>>({});
  const PAGE_SIZE = 25;

  useEffect(() => {
    worker.current = new DataWorker();
    return () => worker.current?.terminate();
  }, []);

  useEffect(() => {
    telegramChannelsRef.current = telegramChannels;
    telegramMessagesRef.current = telegramMessages;
  }, [telegramChannels, telegramMessages]);

  const loadData = useCallback(async () => {
    await storage.cleanupOldTelegramMessages(1);
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
      
      const channelId = crypto.randomUUID();
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
    const retentionMs = 1 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    // Filter by retention, but ALWAYS keep at least the 5 most recent messages
    // to ensure the user can see something and trigger "load more" if needed.
    const filtered = messages.filter(m => now - m.date < retentionMs);
    
    if (filtered.length < 5 && messages.length > 0) {
      // Sort to get the most recent ones
      const sorted = [...messages].sort((a, b) => b.date - a.date);
      return sorted.slice(0, 5).sort((a, b) => a.date - b.date);
    }
    
    return filtered;
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
                const requestId = crypto.randomUUID();
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
              
              // Save ALL merged messages to storage first to ensure we have a history,
              // then the cleanup logic in loadData will handle long-term retention.
              // This ensures that even if 'cleaned' is small, the database has the messages.
              await storage.saveTelegramMessages(channel.id, merged);
              
              // Also update the channel's last message date
              if (merged.length > 0) {
                const lastDate = Math.max(...merged.map(m => m.date));
                await storage.updateTelegramChannel(channel.id, { lastMessageDate: lastDate });
              }
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
    const messages = await storage.getTelegramMessages(channelId, 0, PAGE_SIZE);
    setTelegramMessages(prev => ({ ...prev, [channelId]: messages }));
    telegramMessageOffsets.current[channelId] = messages.length;
    
    if (messages.length === 0 && channel) {
      refreshTelegramChannels([channel]);
    }
  }, [refreshTelegramChannels]);

  const loadMoreTelegramMessages = useCallback(async (channelId: string) => {
    const channel = telegramChannelsRef.current.find(c => c.id === channelId);
    if (!channel) return;

    // 1. Try to load more from local storage first
    const currentOffset = telegramMessageOffsets.current[channelId] || 0;
    const moreLocalMessages = await storage.getTelegramMessages(channelId, currentOffset, PAGE_SIZE);
    
    if (moreLocalMessages.length > 0) {
      setTelegramMessages(prev => {
        const existing = prev[channelId] || [];
        const combined = [...moreLocalMessages, ...existing];
        const next = { ...prev, [channelId]: combined };
        telegramMessagesRef.current = next;
        return next;
      });
      telegramMessageOffsets.current[channelId] = currentOffset + moreLocalMessages.length;
      return;
    }

    // 2. If no more local messages, fetch from network
    const currentMessages = telegramMessagesRef.current[channelId] || [];
    if (currentMessages.length === 0) return;

    // Find the date of the oldest message to target one day before
    const oldestMessageInState = currentMessages[0];
    const targetDateBoundary = oldestMessageInState.date - (24 * 60 * 60 * 1000);
    
    let allNewMessages: TelegramMessage[] = [];
    let reachedBoundary = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    let currentBeforeId: string | undefined = undefined;

    // Find the initial oldest message ID to use as 'before' parameter
    const idParts = oldestMessageInState.id.split('/');
    currentBeforeId = idParts.length > 1 ? idParts[1] : oldestMessageInState.id;

    console.log(`[Telegram] Loading older messages before: ${currentBeforeId} targeting day boundary`);

    try {
      while (!reachedBoundary && attempts < MAX_ATTEMPTS) {
        attempts++;
        const olderMessages = await fetchTelegramMessages(channel.username, undefined, currentBeforeId, channel.id);
        
        if (olderMessages.length === 0) break;
        
        allNewMessages = [...olderMessages, ...allNewMessages];
        
        // Update beforeId for next attempt
        const oldestInBatch = olderMessages[0];
        const nextIdParts = oldestInBatch.id.split('/');
        currentBeforeId = nextIdParts.length > 1 ? nextIdParts[1] : oldestInBatch.id;
        
        // Check if we reached the boundary
        const minDateInBatch = Math.min(...olderMessages.map(m => m.date));
        if (minDateInBatch <= targetDateBoundary) {
          reachedBoundary = true;
        }
      }

      console.log(`[Telegram] Found ${allNewMessages.length} older messages across ${attempts} attempts`);
      
      if (allNewMessages.length > 0) {
        setTelegramMessages(prev => {
          const existing = prev[channelId] || [];
          // Prepend older messages, avoiding duplicates
          const existingIds = new Set(existing.map(m => m.id));
          const filteredNew = allNewMessages.filter(m => !existingIds.has(m.id));
          
          const combined = [...filteredNew, ...existing];
          const next = { ...prev, [channelId]: combined };
          telegramMessagesRef.current = next;
          
          // Save the combined set to storage
          storage.saveTelegramMessages(channelId, combined);
          return next;
        });
        telegramMessageOffsets.current[channelId] = (telegramMessageOffsets.current[channelId] || 0) + allNewMessages.length;
      }
    } catch (e) {
      console.error(`Failed to load older messages for ${channel.username}`, e);
    }
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

  const enforceRetention = useCallback(async () => {
    await storage.cleanupOldTelegramMessages(1);
    
    // We only want to clear from memory the ones that got deleted.
    // The easiest way is to reload latest state from IndexedDB for loaded channels
    const channelsToReload = Object.keys(telegramMessagesRef.current);
    for (const channelId of channelsToReload) {
        const messages = await storage.getTelegramMessages(channelId, 0, PAGE_SIZE);
        setTelegramMessages(prev => ({ ...prev, [channelId]: messages }));
        telegramMessageOffsets.current[channelId] = messages.length;
    }
  }, []);

  return (
    <TelegramContext.Provider value={{
      telegramChannels, telegramMessages,
      addTelegramChannel, removeTelegramChannel, refreshTelegramChannels,
      loadTelegramMessages, loadMoreTelegramMessages,
      markAllTelegramAsRead, markTelegramChannelAsRead, enforceRetention
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
