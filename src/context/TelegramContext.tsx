import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef, useMemo } from 'react';
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
  telegramUnreadCount: number;
}

const TelegramContext = createContext<TelegramContextType | undefined>(undefined);

export const TelegramProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [telegramChannels, setTelegramChannels] = useState<TelegramChannel[]>([]);
  const [telegramMessages, setTelegramMessages] = useState<Record<string, TelegramMessage[]>>({});
  const { settings } = useSettings();
  
  const telegramUnreadCount = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < telegramChannels.length; i++) {
      sum += (telegramChannels[i].unreadCount || 0);
    }
    return sum;
  }, [telegramChannels]);
  
  const telegramChannelsRef = useRef<TelegramChannel[]>([]);
  const telegramMessagesRef = useRef<Record<string, TelegramMessage[]>>({});
  const worker = useRef<Worker | undefined>(undefined);
  const telegramMessageOffsets = useRef<Record<string, number>>({});
  const PAGE_SIZE = 25;
  const channelsRefreshAbortController = useRef<AbortController | null>(null);
  const addChannelAbortController = useRef<AbortController | null>(null);
  const loadMoreAbortController = useRef<Record<string, AbortController | null>>({});

  useEffect(() => {
    worker.current = new DataWorker();
    return () => {
      worker.current?.terminate();
      if (channelsRefreshAbortController.current) channelsRefreshAbortController.current.abort();
      if (addChannelAbortController.current) addChannelAbortController.current.abort();
      Object.values(loadMoreAbortController.current).forEach(c => c?.abort());
    };
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
    if (addChannelAbortController.current) {
      addChannelAbortController.current.abort();
    }
    const controller = new AbortController();
    addChannelAbortController.current = controller;

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
        fetchTelegramMessages(cleanUsername, undefined, undefined, channelId, controller.signal),
        fetchTelegramChannelInfo(cleanUsername, controller.signal)
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
      if (e.name === 'AbortError') return;
      console.error('Error adding Telegram channel:', e);
      const errMsg = e.message || "Canale Telegram non trovato o non accessibile. Assicurati che il canale sia pubblico.";
      throw new Error(errMsg);
    } finally {
      if (addChannelAbortController.current === controller) {
        addChannelAbortController.current = null;
      }
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
    if (channelsRefreshAbortController.current) {
      channelsRefreshAbortController.current.abort();
    }
    const controller = new AbortController();
    channelsRefreshAbortController.current = controller;

    try {
      const channels = channelsToRefresh || telegramChannelsRef.current;
      
      const queue = [...channels];
      let queueIndex = 0;
      const CONCURRENCY = Math.min(3, queue.length);
      
      let mergeChain = Promise.resolve();
      
      const workers = Array(CONCURRENCY).fill(null).map(async () => {
        while (true) {
          if (controller.signal.aborted) break;
          const channel = queue[queueIndex++];
          if (!channel) break;
          
          try {
            const currentMessages = telegramMessagesRef.current[channel.id] || [];
            const sinceDate = currentMessages.length > 0 ? currentMessages[currentMessages.length - 1].date : undefined;

            const [messages, info] = await Promise.all([
              fetchTelegramMessages(channel.username, sinceDate, undefined, channel.id, controller.signal),
              fetchTelegramChannelInfo(channel.username, controller.signal)
            ]);
            
            if (controller.signal.aborted) break;
            
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
                
                if (controller.signal.aborted) return;

                const cleaned = cleanupTelegramMessages(channel, merged);
                
                const lastDate = merged.length > 0 ? Math.max(...merged.map(m => m.date)) : channel.lastMessageDate;
                const newUnreadCount = merged.filter(m => m.date > channel.lastOpened).length;

                const updates: Partial<any> = { 
                  lastMessageDate: lastDate, 
                  unreadCount: newUnreadCount 
                };
                
                if (info && info.imageUrl && info.imageUrl !== channel.imageUrl) {
                  updates.imageUrl = info.imageUrl;
                }

                setTelegramChannels(prev => prev.map(c => 
                  c.id === channel.id ? { ...c, ...updates } : c
                ));

                setTelegramMessages(prev => {
                  const next = { ...prev, [channel.id]: cleaned };
                  telegramMessagesRef.current = next;
                  return next;
                });
                
                // Save ALL merged messages to storage first to ensure we have a history,
                // then the cleanup logic in loadData will handle long-term retention.
                // This ensures that even if 'cleaned' is small, the database has the messages.
                await storage.saveTelegramMessages(channel.id, merged);
                
                // Also update the channel's last message date and unread count in DB
                await storage.updateTelegramChannel(channel.id, updates);
              }));
            }
          } catch (e: any) {
            if (e.name !== 'AbortError') {
              console.error(`Failed to refresh channel ${channel.username}`, e);
            }
          }
        }
      });

      await Promise.all(workers);
      await mergeChain;
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Error refreshing Telegram channels:', e);
      }
    } finally {
      if (channelsRefreshAbortController.current === controller) {
        channelsRefreshAbortController.current = null;
      }
    }
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
        const all = [...moreLocalMessages, ...existing];
        
        // ⚡ Bolt: Replaced Array.from(new Map(...)) with a faster Set + filter deduplication
        const seen = new Set();
        const deduplicated = all.filter(m => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });

        const sorted = deduplicated.sort((a, b) => a.date - b.date);
        
        const next = { ...prev, [channelId]: sorted };
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

    if (loadMoreAbortController.current[channelId]) {
      loadMoreAbortController.current[channelId]!.abort();
    }
    const controller = new AbortController();
    loadMoreAbortController.current[channelId] = controller;

    try {
      while (!reachedBoundary && attempts < MAX_ATTEMPTS) {
        if (controller.signal.aborted) break;
        attempts++;
        const olderMessages = await fetchTelegramMessages(channel.username, undefined, currentBeforeId, channel.id, controller.signal);
        
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

      if (controller.signal.aborted) return;

      // ⚡ Bolt: Replaced Array.from(new Map(...)) with a faster Set + filter deduplication
      const seen = new Set();
      const deduplicated = allNewMessages.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
      
      if (deduplicated.length > 0) {
        setTelegramMessages(prev => {
          const existing = prev[channelId] || [];
          // Prepend older messages, avoiding duplicates
          const existingIds = new Set(existing.map(m => m.id));
          const filteredNew = deduplicated.filter(m => !existingIds.has(m.id));
          
          const combined = [...filteredNew, ...existing];
          const next = { ...prev, [channelId]: combined };
          telegramMessagesRef.current = next;
          
          // Save the combined set to storage
          storage.saveTelegramMessages(channelId, combined);
          return next;
        });
        telegramMessageOffsets.current[channelId] = (telegramMessageOffsets.current[channelId] || 0) + deduplicated.length;
      }
    } catch (e) {
      console.error(`Failed to load older messages for ${channel.username}`, e);
    }
  }, []);

  const markAllTelegramAsRead = useCallback(async () => {
    const now = Date.now();
    setTelegramChannels(prev => prev.map(c => ({ ...c, unreadCount: 0, lastOpened: now })));
    const channels = telegramChannelsRef.current;
    await Promise.all(channels.map(c => storage.updateTelegramChannel(c.id, { unreadCount: 0, lastOpened: now })));
  }, []);

  const markTelegramChannelAsRead = useCallback(async (channelId: string) => {
    const now = Date.now();
    setTelegramChannels(prev => prev.map(c => 
      c.id === channelId ? { ...c, unreadCount: 0, lastOpened: now } : c
    ));
    await storage.updateTelegramChannel(channelId, { unreadCount: 0, lastOpened: now });
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

  // Independent triggers for Telegram (startup, 5min period, resume)
  useEffect(() => {
    const loadRefresh = async () => {
      const loadedChannels = await storage.getTelegramChannels();
      if (loadedChannels.length > 0) {
        refreshTelegramChannels(loadedChannels);
      }
    };
    loadRefresh();
  }, [refreshTelegramChannels]);

  useEffect(() => {
    const TELEGRAM_REFRESH_INTERVAL = 5 * 60 * 1000;
    const interval = setInterval(() => {
      if (telegramChannelsRef.current.length > 0) {
        refreshTelegramChannels();
      }
    }, TELEGRAM_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refreshTelegramChannels]);

  useEffect(() => {
    const handleResume = () => {
      refreshTelegramChannels();
    };
    window.addEventListener('app-resume', handleResume);
    return () => window.removeEventListener('app-resume', handleResume);
  }, [refreshTelegramChannels]);

  const value = useMemo(() => ({
    telegramChannels, telegramMessages,
    addTelegramChannel, removeTelegramChannel, refreshTelegramChannels,
    loadTelegramMessages, loadMoreTelegramMessages,
    markAllTelegramAsRead, markTelegramChannelAsRead, enforceRetention,
    telegramUnreadCount
  }), [
    telegramChannels, telegramMessages,
    addTelegramChannel, removeTelegramChannel, refreshTelegramChannels,
    loadTelegramMessages, loadMoreTelegramMessages,
    markAllTelegramAsRead, markTelegramChannelAsRead, enforceRetention,
    telegramUnreadCount
  ]);

  return (
    <TelegramContext.Provider value={value}>
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
