import { create } from 'zustand';
import { Settings } from '../types';
import { storage, defaultSettings } from '../services/storage';
import React, { ReactNode } from 'react';

interface SettingsStore {
  settings: Settings;
  isLoading: boolean;
  initSettings: () => Promise<void>;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: defaultSettings,
  isLoading: true,
  initSettings: async () => {
    try {
      const storedSettings = await storage.getSettings();
      set({ settings: storedSettings, isLoading: false });
    } catch (e) {
      console.error('Failed to load settings:', e);
      set({ isLoading: false });
    }
  },
  updateSettings: async (updates) => {
    const current = get().settings;
    const newSettings = { ...current, ...updates };
    set({ settings: newSettings });
    try {
      await storage.saveSettings(newSettings);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  }
}));

// Initialize settings immediately when the store is loaded
useSettingsStore.getState().initSettings();

// Export a custom hook that behaves exactly like the previous context hook
// to facilitate 100% backward compatibility.
export const useSettings = () => {
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const isLoading = useSettingsStore((state) => state.isLoading);
  
  return { settings, updateSettings, isLoading };
};

// Export a passthrough provider to preserve React tree structures without introducing breaking changes or regressions.
export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <>{children}</>;
};
