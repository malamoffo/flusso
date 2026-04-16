import { rssStorage } from './rss';
import { redditStorage } from './reddit';
import { telegramStorage } from './telegram';
import { settingsStorage } from './settings';
import { db } from '../db';
import { RefreshLog } from '../../types';

export const storage = {
  ...rssStorage,
  ...redditStorage,
  ...telegramStorage,
  ...settingsStorage,

  async getRefreshLogs(): Promise<RefreshLog[]> {
    return await db.refreshLogs.orderBy('timestamp').reverse().toArray();
  },

  async saveRefreshLogs(logs: RefreshLog[]): Promise<void> {
    await db.refreshLogs.bulkPut(logs.map(log => ({ ...log, id: log.id || crypto.randomUUID() })));
  },
};
