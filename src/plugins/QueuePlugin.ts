import { registerPlugin } from '@capacitor/core';

export interface QueueItem {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
  artworkFilename?: string;
  uri?: string;
  duration?: number;
}

export interface QueuePluginPlugin {
  setQueue(options: {
    queue?: QueueItem[];
    recent?: QueueItem[];
    favorites?: QueueItem[];
  }): Promise<void>;

  updateMediaSession(options: {
    mediaId?: string;
    title?: string;
    artist?: string;
    album?: string;
    artwork?: string;
    artworkFilename?: string;
    duration?: number;
    position?: number;
    isPlaying?: boolean;
  }): Promise<void>;

  getPendingMediaId(): Promise<{ mediaId: string | null }>;

  addListener(
    eventName: 'playRequest',
    listenerFunc: (data: { id: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;

  addListener(
    eventName: 'actionRequest',
    listenerFunc: (data: { action: 'play' | 'pause' | 'stop' | 'next' | 'previous' | 'seek', position?: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;

  addListener(
    eventName: 'seekRequest',
    listenerFunc: (data: { position: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

export const WebQueuePlugin: QueuePluginPlugin = {
  async setQueue() {},
  async updateMediaSession() {},
  async getPendingMediaId() { return { mediaId: null }; },
  async addListener() {
    return { remove: async () => {} };
  }
};

export const QueuePlugin = registerPlugin<QueuePluginPlugin>('FlussoQueue', {
  web: () => Promise.resolve(WebQueuePlugin)
});
