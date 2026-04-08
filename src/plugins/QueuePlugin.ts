import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface QueuePlugin {
  setQueue(options: { 
    queue?: any[];
    recent?: any[];
    favorites?: any[];
  }): Promise<void>;
  getPendingMediaId(): Promise<{ mediaId: string | null }>;
  addListener(eventName: 'playRequest', listenerFunc: (data: { id: string }) => void): Promise<PluginListenerHandle>;
}

const Queue = registerPlugin<QueuePlugin>('QueuePlugin');

export default Queue;
