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
    // Check if we are on a native platform (Android/iOS)
    const isNative = (window as any).Capacitor?.isNativePlatform();
    
    const logEvent = (level: 'info' | 'warn' | 'error', message: string, details?: string) => {
      window.dispatchEvent(new CustomEvent('app-log', { 
        detail: { level, message, details, url: feedUrl, timestamp: Date.now() } 
      }));
    };

    if (isNative) {
      logEvent('info', `Native direct fetch: ${feedUrl}`);
      try {
        const options = {
          url: feedUrl,
          headers: { 'Accept': 'application/xml, text/xml, */*' },
        };
        
        const response = await CapacitorHttp.get(options);
        
        if (response.status !== 200) {
          throw new Error(`Direct fetch failed with status ${response.status}`);
        }

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
        const errorMsg = e instanceof Error ? e.message : String(e);
        logEvent('error', 'Native fetch failed', errorMsg);
        throw e;
      }
    }

    // Web fallback (will likely fail CORS for most sites)
    logEvent('info', `Web direct fetch (CORS restricted): ${feedUrl}`);
    try {
      const parser = new RSSParser();
      const data = await parser.parseURL(feedUrl);
      
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
      const errorMsg = e instanceof Error ? e.message : String(e);
      logEvent('error', 'Web fetch failed (CORS)', errorMsg);
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
