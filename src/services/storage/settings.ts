import { db } from '../db';
import { Settings } from '../../types';

export const defaultSettings: Settings = {
  swipeLeftAction: 'toggleFavorite',
  swipeRightAction: 'none',
  fontSize: 'large',
  refreshInterval: 0,
  themeColor: '#4f46e5',
  autoCheckUpdates: false,
  theme: 'dark',
  pureBlack: true,
  redditRetentionDays: 3,
  articleRetentionDays: 3,
};

export const settingsStorage = {
  async getSettings(): Promise<Settings> {
    const stored = await db.settings.get('user_settings');
    const settings: Settings = { ...defaultSettings, ...stored };
    let needsUpdate = false;
    if (!settings.articleRetentionDays || settings.articleRetentionDays < 3) {
      settings.articleRetentionDays = 3;
      needsUpdate = true;
    }
    if (!settings.redditRetentionDays || settings.redditRetentionDays < 3) {
      settings.redditRetentionDays = 3;
      needsUpdate = true;
    }
    if (needsUpdate) {
      try {
        await db.settings.put({ id: 'user_settings', ...settings });
      } catch (err) {
        console.warn('Failed to update migrated settings to DB:', err);
      }
    }
    return settings;
  },

  async saveSettings(settings: Settings): Promise<void> {
    await db.settings.put({ id: 'user_settings', ...settings });
  },
};
