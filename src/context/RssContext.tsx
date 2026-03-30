import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface FeedItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  content?: string;
  contentSnippet?: string;
}

export interface Feed {
  id?: string;
  title: string;
  description?: string;
  link?: string;
  url: string;
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

// Sostituiamo l'importazione del file Node.js con una funzione client-side sicura.
// Utilizziamo un servizio proxy pubblico (rss2json) per aggirare i blocchi CORS del browser
// e convertire nativamente l'XML del feed in JSON.
const fetchFeed = async (url: string): Promise<Feed> => {
  const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
  
  const response = await fetch(proxyUrl);
  if (!response.ok) {
    throw new Error('Errore di rete durante il fetch del feed');
  }
  
  const data = await response.json();
  if (data.status !== 'ok') {
    throw new Error('Impossibile parsare il feed RSS');
  }

  // Mappiamo la risposta nel nostro formato Feed standard
  return {
    title: data.feed.title,
    description: data.feed.description,
    link: data.feed.link,
    url: url,
    items: data.items.map((item: any) => ({
      id: item.guid || item.link,
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      content: item.content,
      // Usiamo una versione pulita o la descrizione breve per lo snippet
      contentSnippet: item.description?.replace(/(<([^>]+)>)/gi, "") || '' 
    }))
  };
};

export const RssProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const addFeed = async (url: string) => {
    setIsLoading(true);
    try {
      const feedData = await fetchFeed(url);
      
      if (feedData) {
        setFeeds(prevFeeds => {
          if (prevFeeds.some(f => f.url === url)) return prevFeeds;
          return [...prevFeeds, feedData];
        });
      }
    } catch (error) {
      console.error(`Errore nell'aggiunta del feed da ${url}:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  const removeFeed = (url: string) => {
    setFeeds(prevFeeds => prevFeeds.filter(feed => feed.url !== url));
  };

  const refreshFeeds = async () => {
    setIsLoading(true);
    try {
      const updatedFeeds = await Promise.all(
        feeds.map(async (feed) => {
          try {
            const updatedData = await fetchFeed(feed.url);
            return updatedData;
          } catch (e) {
            console.error(`Errore durante l'aggiornamento di ${feed.url}`, e);
            return feed; 
          }
        })
      );
      setFeeds(updatedFeeds);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Inizializzazione (es. caricamento dei feed pregressi dal DB locale)
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