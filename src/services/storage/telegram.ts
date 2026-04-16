import { db } from '../db';
import { TelegramChannel, TelegramMessage } from '../../types';

export const telegramStorage = {
  async getTelegramChannels(): Promise<TelegramChannel[]> {
    return await db.telegramChannels.toArray();
  },

  async saveTelegramChannels(channels: TelegramChannel[]): Promise<void> {
    await db.telegramChannels.bulkPut(channels);
  },

  async addTelegramChannel(channel: TelegramChannel): Promise<void> {
    const channels = await db.telegramChannels.toArray();
    if (!channels.find(c => c.username === channel.username)) {
      await db.telegramChannels.put(channel);
    }
  },

  async updateTelegramChannel(id: string, updates: Partial<TelegramChannel>): Promise<void> {
    await db.telegramChannels.update(id, updates);
  },

  async getTelegramMessages(channelId: string, offset = 0, limit = 0): Promise<TelegramMessage[]> {
    const allMessages = await db.telegramMessages.where('channelId').equals(channelId).sortBy('date');
    // allMessages is [oldest, ..., newest] because sortBy is ascending
    
    if (limit > 0) {
      // We want the 'latest' messages first (offset 0), then older ones.
      // Offset 0 -> last 'limit' messages
      // Offset 25 -> messages from index (length - 50) to (length - 25)
      const end = Math.max(0, allMessages.length - offset);
      const start = Math.max(0, end - limit);
      return allMessages.slice(start, end);
    }
    
    return allMessages;
  },

  async saveTelegramMessages(channelId: string, messages: TelegramMessage[]): Promise<void> {
    const normalized = messages.map(m => ({ ...m, channelId }));
    await db.telegramMessages.bulkPut(normalized);
  },

  async removeTelegramChannel(channelId: string): Promise<void> {
    await db.telegramChannels.delete(channelId);
    const messagesToDelete = await db.telegramMessages.where('channelId').equals(channelId).primaryKeys();
    await db.telegramMessages.bulkDelete(messagesToDelete);
  },

  async cleanupOldTelegramMessages(retentionDays: number = 1): Promise<void> {
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    const channels = await this.getTelegramChannels();
    for (const channel of channels) {
      const messages = await this.getTelegramMessages(channel.id);
      if (messages.length <= 5) continue;

      const oldMessages = messages
        .filter(m => (now - m.date) > retentionMs)
        .sort((a, b) => b.date - a.date); // Newest first
      
      if (oldMessages.length > 0) {
        // If after filtering we have less than 5 messages, keep the most recent ones to reach 5
        const messagesToKeep = 5;
        const messagesAfterCleanup = messages.length - oldMessages.length;
        
        let idsToDelete;
        if (messagesAfterCleanup < messagesToKeep) {
          const numberToRemove = oldMessages.length - (messagesToKeep - messagesAfterCleanup);
          if (numberToRemove <= 0) continue;
          // Delete the oldest ones among the "old" messages
          idsToDelete = oldMessages.slice(oldMessages.length - numberToRemove).map(m => m.id);
        } else {
          idsToDelete = oldMessages.map(m => m.id);
        }

        if (idsToDelete.length > 0) {
          await db.telegramMessages.bulkDelete(idsToDelete);
        }
      }
    }
  }
};
