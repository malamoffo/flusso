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

  async getTelegramMessages(channelId: string, username?: string): Promise<TelegramMessage[]> {
    let messages = await db.telegramMessages.where('channelId').equals(channelId).sortBy('date');
    
    if (messages.length === 0 && username) {
      const legacyMessages = await db.telegramMessages.where('channelId').equals(username).sortBy('date');
      if (legacyMessages.length > 0) {
        const fixedMessages = legacyMessages.map(m => ({ ...m, channelId }));
        db.telegramMessages.bulkPut(fixedMessages).catch(e => console.error('Failed to fix legacy telegram messages:', e));
        return fixedMessages;
      }
    }
    
    return messages;
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
    const oldMessages = await db.telegramMessages
      .filter(m => (now - m.date) > retentionMs)
      .primaryKeys();
    
    if (oldMessages.length > 0) {
      await db.telegramMessages.bulkDelete(oldMessages);
    }
  }
};
