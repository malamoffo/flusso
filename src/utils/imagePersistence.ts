import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { db } from '../services/db';

const CACHE_DIR = 'image_cache';

/**
 * Utility for persistent image caching on the device's filesystem.
 */
export const imagePersistence = {
  resolvedLocalUrls: new Map<string, string>(),
  memoryCache: new Map<string, string>(),
  loadedUrls: new Set<string>(),
  isInitialized: false,

  async init() {
    if (this.isInitialized) return;
    try {
      const savedMap = await db.kv.get('image_cache_map');
      if (savedMap && savedMap.value) {
        this.resolvedLocalUrls = new Map(JSON.parse(savedMap.value));
      }
    } catch (e) {
    }
    this.isInitialized = true;
  },

  async saveMap() {
    try {
      await db.kv.put({ id: 'image_cache_map', value: JSON.stringify(Array.from(this.resolvedLocalUrls.entries())) });
    } catch (e) {
      // Ignore save errors
    }
  },

  /**
   * Generates a safe filename from a URL.
   */
  getFilename(url: string): string {
    try {
      let hash = 0;
      for (let i = 0; i < url.length; i++) {
        const char = url.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      // Use only hash and a safe extension to avoid filesystem issues
      const ext = url.split('.').pop()?.split('?')[0].substring(0, 4) || 'img';
      return `cache_${Math.abs(hash)}.${ext}`;
    } catch (e) {
      return 'fallback_' + Math.random().toString(36).substring(7);
    }
  },

  /**
   * Checks if an image is already cached locally and returns its URI.
   * Returns null if not cached.
   */
  async getCachedUrl(url: string): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) return null;
    
    if (!this.isInitialized) await this.init();
    if (this.resolvedLocalUrls.has(url)) return this.resolvedLocalUrls.get(url)!;

    const filename = this.getFilename(url);
    const path = `${CACHE_DIR}/${filename}`;

    try {
      const stat = await Filesystem.stat({
        path,
        directory: Directory.Data
      });
      
      if (stat.size > 0) {
        const uriResult = await Filesystem.getUri({
          path,
          directory: Directory.Data
        });
        const localUrl = Capacitor.convertFileSrc(uriResult.uri);
        this.resolvedLocalUrls.set(url, localUrl);
        this.saveMap();
        return localUrl;
      }
    } catch (e) {
      // File doesn't exist
      return null;
    }
    return null;
  },

  /**
   * Retrieves an image from the local filesystem or downloads it if not found.
   */
  async getLocalUrl(url: string): Promise<string> {
    if (!Capacitor.isNativePlatform()) return url;

    const filename = this.getFilename(url);
    const path = `${CACHE_DIR}/${filename}`;

    try {
      // Check if file exists and has content
      const stat = await Filesystem.stat({
        path,
        directory: Directory.Data
      });
      
      if (stat.size > 0) {
        const uriResult = await Filesystem.getUri({
          path,
          directory: Directory.Data
        });
        return Capacitor.convertFileSrc(uriResult.uri);
      }
    } catch (e) {
      // File doesn't exist or is empty, proceed to download and cache it
    }

    // Download and cache
    try {
      const downloadResult = await CapacitorHttp.get({
        url,
        responseType: 'arraybuffer'
      });

      if (downloadResult.status === 200) {
        // Convert arraybuffer to base64
        const base64Data = await this.arrayBufferToBase64(downloadResult.data);
        
        // Ensure directory exists
        try {
          await Filesystem.mkdir({
            path: CACHE_DIR,
            directory: Directory.Data,
            recursive: true
          });
        } catch (dirErr) {
          // Directory might already exist
        }

        await Filesystem.writeFile({
          path,
          data: base64Data,
          directory: Directory.Data
        });

        const uriResult = await Filesystem.getUri({
          path,
          directory: Directory.Data
        });
        const localUrl = Capacitor.convertFileSrc(uriResult.uri);
        this.resolvedLocalUrls.set(url, localUrl);
        this.saveMap();
        return localUrl;
      }
    } catch (downloadErr) {
      console.error('[IMAGE_CACHE] Failed to download/cache image:', url, downloadErr);
    }

    return url;
  },

  /**
   * Clears the image cache directory.
   */
  async clearCache(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const exists = await Filesystem.stat({
        path: CACHE_DIR,
        directory: Directory.Data
      }).catch(() => null);

      if (exists) {
        await Filesystem.rmdir({
          path: CACHE_DIR,
          directory: Directory.Data,
          recursive: true
        });
      }
    } catch (e) {
    }
  },

  /**
   * Helper to convert ArrayBuffer to Base64 efficiently and safely using FileReader.
   */
  async arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const blob = new Blob([buffer]);
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },
};
