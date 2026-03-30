import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface QueuePlugin {
  setQueue(options: { queue: any[] }): Promise<void>;
  addListener(eventName: 'playRequest', listenerFunc: (data: { id: string }) => void): Promise<PluginListenerHandle>;
}

const Queue = registerPlugin<QueuePlugin>('QueuePlugin');

export default Queue;
