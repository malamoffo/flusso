import { db } from '../db';
import { Settings } from '../../types';

export const defaultSettings: Settings = {
  swipeLeftAction: 'toggleFavorite',
  swipeRightAction: 'none',
  fontSize: 'large',
  refreshInterval: 60,
  themeColor: '#4f46e5',
  autoCheckUpdates: true,
  theme: 'dark',
  pureBlack: true,
  redditRetentionDays: 1,
  telegramRetentionDays: 1,
  articleRetentionDays: 30,
};

export const settingsStorage = {
  async getSettings(): Promise<Settings> {
    const stored = await db.settings.get('user_settings');
    return { ...defaultSettings, ...stored };
  },

  async saveSettings(settings: Settings): Promise<void> {
    await db.settings.put({ id: 'user_settings', ...settings });
  },
};
