import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { RssProvider } from './context/RssContext';
import { AudioPlayerProvider } from './context/AudioPlayerContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RssProvider>
      <AudioPlayerProvider>
        <App />
      </AudioPlayerProvider>
    </RssProvider>
  </StrictMode>,
);
