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
const updateSW = registerSW({
  onNeedRefresh() {
  },
  onOfflineReady() {
  },
});

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
