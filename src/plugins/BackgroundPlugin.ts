import { registerPlugin } from '@capacitor/core';

export interface BackgroundPluginInterface {
  setupBackgroundSync(options: { feeds: { id: string; url: string; title: string; lastFetched: number }[], intervalMinutes: number }): Promise<void>;
  stopBackgroundSync(): Promise<void>;
}

export const BackgroundPlugin = registerPlugin<BackgroundPluginInterface>('BackgroundPlugin');
