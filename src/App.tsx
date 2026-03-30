import React, { useState, useEffect } from 'react';
import { SwipeableArticle } from './components/SwipeableArticle';
import { ArticleReader } from './components/ArticleReader';
import { AddFeedModal } from './components/AddFeedModal';
import { SettingsModal } from './components/SettingsModal';
import { PersistentPlayer } from './components/PersistentPlayer';
import { HeaderWidgets } from './components/HeaderWidgets';
import { RssProvider } from './context/RssContext';

export default function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddFeedOpen, setIsAddFeedOpen] = useState(false);

  useEffect(() => {
    // Eventuale logica di inizializzazione al montaggio dell'app
    // (es. caricamento preferenze utente, analytics, ecc.)
  }, []);

  return (
    <RssProvider>
      <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 font-sans">
        <header className="flex justify-between items-center p-4 bg-white shadow-sm z-10">
          <h1 className="text-2xl font-bold tracking-tight text-blue-600">Flusso</h1>
          <HeaderWidgets 
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenAddFeed={() => setIsAddFeedOpen(true)}
          />
        </header>

        <main className="flex-1 overflow-hidden relative">
          {/* Struttura base per ospitare la logica di lettura */}
          <SwipeableArticle />
          <div className="hidden">
            <ArticleReader />
          </div>
        </main>

        <PersistentPlayer />

        {/* Modali */}
        {isAddFeedOpen && (
          <AddFeedModal onClose={() => setIsAddFeedOpen(false)} />
        )}
        
        {isSettingsOpen && (
          <SettingsModal onClose={() => setIsSettingsOpen(false)} />
        )}
      </div>
    </RssProvider>
  );
}