import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { RssProvider } from './context/RssContext';
import { AudioPlayerProvider } from './context/AudioPlayerContext.tsx';
import { entries } from 'idb-keyval';

entries().then(e => console.log('All keys:', e.map(x => x[0])));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RssProvider>
      <AudioPlayerProvider>
        <App />
      </AudioPlayerProvider>
    </RssProvider>
  </StrictMode>,
);
