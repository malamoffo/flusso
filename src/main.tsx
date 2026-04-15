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

// Register Service Worker
const APP_VERSION = '1.0.6';
console.log(`[Flusso] Version ${APP_VERSION} starting...`);

const updateSW = registerSW({
  onNeedRefresh() {
    // Force update if needed
    updateSW(true);
  },
  onOfflineReady() {
  },
});

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
