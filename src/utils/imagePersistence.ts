import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

const CACHE_DIR = 'image_cache';

/**
 * Utility for persistent image caching on the device's filesystem.
 */
export const imagePersistence = {
  /**
   * Generates a safe filename from a URL.
   */
  getFilename(url: string): string {
    try {
      // Use a simple hash-like string to avoid btoa issues with non-latin1 chars
      let hash = 0;
      for (let i = 0; i < url.length; i++) {
        const char = url.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return `img_${Math.abs(hash)}_${url.split('/').pop()?.split('?')[0].substring(0, 30) || 'image'}`;
    } catch (e) {
      return 'fallback_name_' + Math.random().toString(36).substring(7);
    }
  },

  /**
   * Retrieves an image from the local filesystem or downloads it if not found.
   */
  async getLocalUrl(url: string): Promise<string> {
    if (!Capacitor.isNativePlatform()) return url;

    const filename = this.getFilename(url);
    const path = `${CACHE_DIR}/${filename}`;

    try {
      // Check if file exists
      const result = await Filesystem.readFile({
        path,
        directory: Directory.Data
      });
      
      // On some platforms, result.data is already a base64 string or a blob URL
      if (result.data) {
        // Return a data URL or convert as needed. 
        // For simplicity and speed in <img> tags, we use the local file URI if possible.
        const uriResult = await Filesystem.getUri({
          path,
          directory: Directory.Data
        });
        return Capacitor.convertFileSrc(uriResult.uri);
      }
    } catch (e) {
      // File doesn't exist, download and cache it
      try {
        const downloadResult = await CapacitorHttp.get({
          url,
          responseType: 'arraybuffer'
        });

        if (downloadResult.status === 200) {
          // Convert arraybuffer to base64
          const base64Data = this.arrayBufferToBase64(downloadResult.data);
          
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
          return Capacitor.convertFileSrc(uriResult.uri);
        }
      } catch (downloadErr) {
        console.error('[IMAGE_CACHE] Failed to download/cache image:', url, downloadErr);
      }
    }

    return url;
  },

  /**
   * Helper to convert ArrayBuffer to Base64 efficiently.
   */
  arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk_size = 0x8000;
    
    for (let i = 0; i < bytes.length; i += chunk_size) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk_size) as unknown as number[]);
    }
    return btoa(binary);
  }
};
