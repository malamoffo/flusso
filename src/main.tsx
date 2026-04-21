import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { TelegramProvider } from './context/TelegramContext';
import { RedditProvider } from './context/RedditContext';
import { RssProvider } from './context/RssContext';
import { SettingsProvider } from './context/SettingsContext';
import { AudioPlayerProvider } from './context/AudioPlayerContext.tsx';
import { imagePersistence } from './utils/imagePersistence';
import { registerSW } from 'virtual:pwa-register';

// Version and Build information from environment (GitHub Actions) or fallback to package.json
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.1.0';
export const APP_BUILD = import.meta.env.VITE_APP_BUILD || 'dev';
console.log(`[Flusso] Version ${APP_VERSION} (Build ${APP_BUILD}) starting...`);

export const updateSW = registerSW({
  onNeedRefresh() {
    updateSW(true);
  },
  onOfflineReady() {
  },
});

// Use Capacitor App plugin to detect resume and check for updates
import { App as CapacitorApp } from '@capacitor/app';

if (typeof window !== 'undefined' && 'Capacitor' in window) {
  CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      updateSW();
      
      // Also potentially trigger a feed refresh if we haven't in a while
      // This is handled by RssContext internally usually, but we can signal it.
      window.dispatchEvent(new CustomEvent('app-resume'));
    }
  });
}

// Check for updates every hour
setInterval(() => {
  updateSW();
}, 60 * 60 * 1000);

// Initialize image persistence cache map
imagePersistence.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <RedditProvider>
        <TelegramProvider>
          <RssProvider>
            <AudioPlayerProvider>
              <App />
            </AudioPlayerProvider>
          </RssProvider>
        </TelegramProvider>
      </RedditProvider>
    </SettingsProvider>
  </StrictMode>,
);
