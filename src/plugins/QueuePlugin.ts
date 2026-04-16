import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface QueuePluginInterface {
  setQueue(options: { queue: any[], recent: any[], favorites: any[] }): Promise<void>;
  getPendingMediaId(): Promise<{ mediaId: string | null }>;
  updateMediaSession(options: { 
    title: string; 
    artist: string; 
    album: string; 
    artwork?: string;
    artworkFilename?: string;
    duration?: number; 
    position?: number; 
    isPlaying: boolean; 
  }): Promise<void>;
  addListener(eventName: 'playRequest', listenerFunc: (data: { id: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'actionRequest', listenerFunc: (data: { action: string }) => void): Promise<PluginListenerHandle>;
}

const QueuePlugin = registerPlugin<QueuePluginInterface>('QueuePlugin');

export default QueuePlugin;
