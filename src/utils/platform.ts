import { Capacitor } from '@capacitor/core';
import { Logger } from '../lib/logger';

/**
 * Safely check if a Capacitor plugin is available on the current platform.
 * This prevents "UNIMPLEMENTED" errors on platforms where the plugin isn't installed or supported.
 */
export const isPluginAvailable = (pluginName: string): boolean => {
  try {
    const available = Capacitor.isPluginAvailable(pluginName);
    if (!available) {
      Logger.warn(`Plugin ${pluginName} is not available on this platform (${Capacitor.getPlatform()})`);
    }
    return available;
  } catch (e) {
    Logger.error(`Error checking plugin availability for ${pluginName}`, e);
    return false;
  }
};

/**
 * Check if running on a native platform (Android/iOS) and not just web.
 */
export const isNative = (): boolean => {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios';
};
