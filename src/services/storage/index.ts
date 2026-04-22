import { db } from '../db';
import { RefreshLog } from '../../types';
import { rssStorage } from './rss';
import { redditStorage } from './reddit';
import { telegramStorage } from './telegram';
import { settingsStorage } from './settings';
import { kvStorage } from './kv';

export * from './rss';
export * from './reddit';
export * from './telegram';
export * from './settings';
export * from './kv';

export async function getRefreshLogs(): Promise<RefreshLog[]> {
  return await db.refreshLogs.orderBy('timestamp').reverse().toArray();
}

export async function saveRefreshLogs(logs: RefreshLog[]): Promise<void> {
  await db.refreshLogs.bulkPut(logs.map(log => ({ ...log, id: log.id || crypto.randomUUID() })));
}

export const storage = {
  ...rssStorage,
  ...redditStorage,
  ...telegramStorage,
  ...settingsStorage,
  ...kvStorage,
  getRefreshLogs,
  saveRefreshLogs,
};
