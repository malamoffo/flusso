import { get, set } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';
import { Feed, Article, Settings } from '../types';
import { CapacitorHttp } from '@capacitor/core';
import RSSParser from 'rss-parser';

const FEEDS_KEY = 'rss_feeds';
const ARTICLES_KEY = 'rss_articles';
const SETTINGS_KEY = 'rss_settings';

export const defaultSettings: Settings = {
  theme: 'system',
  swipeLeftAction: 'toggleFavorite',
  swipeRightAction: 'toggleRead',
  imageDisplay: 'small',
  fontSize: 'medium',
  font: 'sans',
  refreshInterval: 60 // Default to 1 hour
};

export const storage = {
  async getSettings(): Promise<Settings> {
    const stored = await get<Settings>(SETTINGS_KEY);
    return { ...defaultSettings, ...stored };
  },

  async saveSettings(settings: Settings): Promise<void> {
    await set(SETTINGS_KEY, settings);
  },

  async getFeeds(): Promise<Feed[]> {
    return (await get<Feed[]>(FEEDS_KEY)) || [];
  },

  async saveFeeds(feeds: Feed[]): Promise<void> {
    await set(FEEDS_KEY, feeds);
  },

  async getArticles(): Promise<Article[]> {
    const articles = (await get<Article[]>(ARTICLES_KEY)) || [];
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    // Filter out read articles older than 3 days
    const validArticles = articles.filter(a => {
      if (!a.isRead) return true;
      const readTime = a.readAt || a.pubDate;
      return (now - readTime) <= THREE_DAYS;
    });
    
    // If we filtered out some articles, save the cleaned up list
    if (validArticles.length !== articles.length) {
      await this.saveArticles(validArticles);
    }
    
    return validArticles;
  },

  async saveArticles(articles: Article[]): Promise<void> {
    await set(ARTICLES_KEY, articles);
  },

  async fetchFeedData(feedUrl: string, sinceDate?: number): Promise<{ feed: Feed; articles: Article[] }> {
    const settings = await this.getSettings();
    
    // Check if we are on a native platform (Android/iOS)
    const isNative = (window as any).Capacitor?.isNativePlatform();
    
    if (isNative) {
      console.log(`[STORAGE] Native platform detected. Using CapacitorHttp for direct fetch: ${feedUrl}`);
      try {
        const options = {
          url: feedUrl,
          headers: { 'Accept': 'application/xml, text/xml, */*' },
        };
        
        const response = await CapacitorHttp.get(options);
        
        if (response.status !== 200) {
          throw new Error(`Direct fetch failed with status ${response.status}`);
        }

        // We need to parse the XML locally since we bypassed the server
        const parser = new RSSParser();
        const data = await parser.parseString(response.data);
        
        const newFeed: Feed = {
          id: uuidv4(),
          title: data.title || 'Unknown Feed',
          description: data.description,
          link: data.link,
          feedUrl,
          imageUrl: data.image?.url,
          lastFetched: Date.now(),
        };

        const newArticles: Article[] = (data.items || []).map((item: any) => ({
          id: uuidv4(),
          feedId: newFeed.id,
          title: item.title || 'Untitled',
          link: item.link,
          pubDate: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
          imageUrl: item.enclosure?.url || null,
          isRead: false,
          isFavorite: false,
          contentSnippet: item.contentSnippet || item.content || '',
        })).filter(a => (Date.now() - a.pubDate) <= 2 * 24 * 60 * 60 * 1000 && (!sinceDate || a.pubDate > sinceDate));

        return { feed: newFeed, articles: newArticles };
      } catch (e) {
        console.error('[STORAGE] Native direct fetch failed, falling back to server', e);
        // Fall back to server if native fetch fails
      }
    }

    // Fallback to server proxy for Web or if native fetch failed
    const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL || '';
    const hardcodedUrl = 'https://ais-dev-l4iutvfnf6f3lmjbx77q6c-53306626833.europe-west3.run.app';
    const baseUrl = settings.backendUrl || envBaseUrl || hardcodedUrl;
    const apiUrl = `${baseUrl.replace(/\/$/, '')}/api/v1/feed?url=${encodeURIComponent(feedUrl)}`;
    
    // We use a custom event to send logs to the UI since storage.ts is not a React component
    const logEvent = (level: string, message: string, details?: string) => {
      window.dispatchEvent(new CustomEvent('app-log', { 
        detail: { level, message, details, url: apiUrl, timestamp: Date.now() } 
      }));
    };

    logEvent('info', `Attempting fetch`, `Base URL: ${baseUrl || '(empty - using relative)'}\nTarget Feed: ${feedUrl}`);

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      const text = await response.text();
      const contentType = response.headers.get('content-type');
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = JSON.parse(text);
        } catch (e) {
          errorData = { error: text || `HTTP error ${response.status}` };
        }
        const errorMsg = errorData.error || errorData.details || `Failed to fetch feed: ${response.status}`;
        logEvent('error', `API Error (${response.status}): ${errorMsg}`, text);
        console.error(`[STORAGE] API Error: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      if (contentType && !contentType.includes('application/json')) {
        const errorMsg = `Expected JSON response from server but got ${contentType} (Status: ${response.status}). Response start: ${text.substring(0, 500)}`;
        logEvent('error', 'Invalid Content-Type received', errorMsg);
        console.error(`[STORAGE] API Error: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        const errorMsg = `Failed to parse JSON response from server. Status: ${response.status}. Content-Type: ${contentType}. Response start: ${text.substring(0, 500)}`;
        logEvent('error', 'JSON Parse Error', errorMsg);
        throw new Error(errorMsg);
      }
      
      const newFeed: Feed = {
        id: uuidv4(),
        title: data.title || 'Unknown Feed',
        description: data.description,
        link: data.link,
        feedUrl,
        imageUrl: data.image?.url,
        lastFetched: Date.now(),
      };

      const newArticles: Article[] = (data.items || []).map((item: any) => {
        let imageUrl = null;
        if (item['media:content'] && item['media:content']['$'] && item['media:content']['$'].url) {
          imageUrl = item['media:content']['$'].url;
        } else if (item['media:thumbnail'] && item['media:thumbnail']['$'] && item['media:thumbnail']['$'].url) {
          imageUrl = item['media:thumbnail']['$'].url;
        } else if (item.enclosure && item.enclosure.url && item.enclosure.type?.startsWith('image/')) {
          imageUrl = item.enclosure.url;
        } else {
          const content = item['content:encoded'] || item.content || item.description || '';
          const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
          if (imgMatch) {
            imageUrl = imgMatch[1];
          }
        }

        return {
          id: uuidv4(),
          feedId: newFeed.id,
          title: item.title || 'Untitled',
          link: item.link,
          pubDate: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
          imageUrl,
          isRead: false,
          isFavorite: false,
          contentSnippet: item.contentSnippet || item.description || '',
        };
      }).filter(a => (Date.now() - a.pubDate) <= 2 * 24 * 60 * 60 * 1000 && (!sinceDate || a.pubDate > sinceDate));

      logEvent('info', `Successfully fetched feed`, `Items: ${newArticles.length}`);
      return { feed: newFeed, articles: newArticles };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      logEvent('error', 'Fetch Operation Failed', `Error: ${errorMsg}\nURL: ${apiUrl}`);
      throw e;
    }
  },

  async saveFeedData(feed: Feed, articles: Article[]): Promise<void> {
    const existingFeeds = await this.getFeeds();
    const existingArticles = await this.getArticles();

    const existingFeedIndex = existingFeeds.findIndex(f => f.feedUrl === feed.feedUrl);
    
    if (existingFeedIndex === -1) {
      await this.saveFeeds([...existingFeeds, feed]);
      await this.saveArticles([...existingArticles, ...articles]);
    } else {
      const updatedFeeds = [...existingFeeds];
      updatedFeeds[existingFeedIndex] = {
        ...updatedFeeds[existingFeedIndex],
        lastFetched: Date.now(),
        title: feed.title,
        imageUrl: feed.imageUrl || updatedFeeds[existingFeedIndex].imageUrl
      };
      
      const existingLinks = new Set(existingArticles.filter(a => a.feedId === updatedFeeds[existingFeedIndex].id).map(a => a.link));
      const trulyNewArticles = articles.filter(a => !existingLinks.has(a.link)).map(a => ({
        ...a,
        feedId: updatedFeeds[existingFeedIndex].id
      }));
      
      if (trulyNewArticles.length > 0) {
        await this.saveArticles([...existingArticles, ...trulyNewArticles]);
      }
      await this.saveFeeds(updatedFeeds);
    }
  },

  async addFeed(feedUrl: string): Promise<{ feed: Feed; articles: Article[] }> {
    const data = await this.fetchFeedData(feedUrl);
    await this.saveFeedData(data.feed, data.articles);
    return data;
  },

  async parseOpml(opmlText: string): Promise<string[]> {
    console.log('Parsing OPML text, length:', opmlText.length);
    const parser = new DOMParser();
    let doc = parser.parseFromString(opmlText, 'text/xml');
    
    // If XML parsing fails (common with malformed OPML), try text/html which is more lenient
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      console.warn('OPML XML parsing failed, trying HTML mode:', parserError.textContent);
      doc = parser.parseFromString(opmlText, 'text/html');
    }

    const outlines = doc.querySelectorAll('outline');
    console.log('Found total outlines:', outlines.length);
    const urls: string[] = [];
    
    outlines.forEach((outline, index) => {
      // OPML attributes can be case-sensitive in XML but case-insensitive in HTML
      // We check common variations
      const url = outline.getAttribute('xmlUrl') || 
                  outline.getAttribute('xmlURL') || 
                  outline.getAttribute('xmlurl') || 
                  outline.getAttribute('url');
                  
      if (url && url.trim().startsWith('http')) {
        urls.push(url.trim());
      } else if (url) {
        console.warn(`Outline ${index} has invalid URL:`, url);
      }
    });
    
    const uniqueUrls = Array.from(new Set(urls));
    console.log('Extracted unique URLs:', uniqueUrls.length);
    return uniqueUrls;
  }
};
