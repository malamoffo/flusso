import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
// Correzione TS2305: Uso l'import di default dato che il named export 'fetchFeed' non esiste
import fetchFeed from '../fetch-feed';

export interface FeedItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  content?: string;
  contentSnippet?: string;
}

// Correzione TS2339 e TS2353: Aggiunta la proprietà 'url' all'interfaccia Feed
export interface Feed {
  id?: string;
  title: string;
  description?: string;
  link?: string;
  url: string; // Aggiunto per risolvere gli errori alle righe 48, 76, 129
  items: FeedItem[];
}

interface RssContextType {
  feeds: Feed[];
  isLoading: boolean;
  addFeed: (url: string) => Promise<void>;
  removeFeed: (url: string) => void;
  refreshFeeds: () => Promise<void>;
}

const RssContext = createContext<RssContextType | undefined>(undefined);

export const RssProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const addFeed = async (url: string) => {
    setIsLoading(true);
    try {
      // Fetch del feed tramite la funzione importata
      const feedData = await fetchFeed(url);
      
      if (feedData) {
        // Ora TypeScript riconosce 'url' come proprietà valida del tipo Feed
        const newFeed: Feed = { 
          ...feedData, 
          url: url 
        };
        
        setFeeds(prevFeeds => {
          // Evita duplicati basandosi sull'url
          if (prevFeeds.some(f => f.url === url)) return prevFeeds;
          return [...prevFeeds, newFeed];
        });
      }
    } catch (error) {
      console.error(`Errore nell'aggiunta del feed da ${url}:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  const removeFeed = (url: string) => {
    // Ora è possibile filtrare correttamente usando la proprietà 'url'
    setFeeds(prevFeeds => prevFeeds.filter(feed => feed.url !== url));
  };

  const refreshFeeds = async () => {
    setIsLoading(true);
    try {
      const updatedFeeds = await Promise.all(
        feeds.map(async (feed) => {
          try {
            const updatedData = await fetchFeed(feed.url);
            return { ...updatedData, url: feed.url };
          } catch (e) {
            console.error(`Errore durante l'aggiornamento di ${feed.url}`, e);
            return feed; // In caso di errore, mantieni il feed vecchio
          }
        })
      );
      setFeeds(updatedFeeds);
    } finally {
      setIsLoading(false);
    }
  };

  // Logica di inizializzazione base
  useEffect(() => {
    // Qui potresti inserire un caricamento iniziale da localStorage
  }, []);

  return (
    <RssContext.Provider value={{ feeds, isLoading, addFeed, removeFeed, refreshFeeds }}>
      {children}
    </RssContext.Provider>
  );
};

export const useRss = () => {
  const context = useContext(RssContext);
  if (!context) {
    throw new Error("useRss deve essere utilizzato all'interno di un RssProvider");
  }
  return context;
};