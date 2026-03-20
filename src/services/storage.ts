import { get, set } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';
import { Feed, Article, Settings } from '../types';
import { CapacitorHttp } from '@capacitor/core';

const FEEDS_KEY = 'rss_feeds';
const ARTICLES_KEY = 'rss_articles';
const SETTINGS_KEY = 'rss_settings';

// Helper to parse RSS/Atom XML using native DOMParser
function parseRssXml(xmlString: string, feedUrl: string): { feed: Feed; articles: Article[] } {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  // Check for parsing errors
  const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error('Failed to parse XML: ' + parserError.textContent);
  }

  const isAtom = xmlDoc.getElementsByTagName('feed').length > 0;
  const feedId = uuidv4();
  
  if (isAtom) {
    const feedNode = xmlDoc.getElementsByTagName('feed')[0];
    const title = feedNode.getElementsByTagName('title')[0]?.textContent || 'Untitled Atom Feed';
    const description = feedNode.getElementsByTagName('subtitle')[0]?.textContent || '';
    const link = feedNode.getElementsByTagName('link')[0]?.getAttribute('href') || '';
    
    const entries = Array.from(xmlDoc.getElementsByTagName('entry'));
    const articles: Article[] = entries.map(entry => {
      const entryTitle = entry.getElementsByTagName('title')[0]?.textContent || 'Untitled';
      const entryLink = entry.getElementsByTagName('link')[0]?.getAttribute('href') || '';
      const pubDateStr = entry.getElementsByTagName('published')[0]?.textContent || 
                         entry.getElementsByTagName('updated')[0]?.textContent || 
                         new Date().toISOString();
      const pubDate = new Date(pubDateStr).getTime();
      
      const content = entry.getElementsByTagName('content')[0]?.textContent || 
                      entry.getElementsByTagName('summary')[0]?.textContent || '';
      
      // Try to find an image
      let imageUrl = null;
      const mediaContent = entry.getElementsByTagName('media:content')[0];
      if (mediaContent) {
        imageUrl = mediaContent.getAttribute('url');
      }
      
      if (!imageUrl) {
        const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) imageUrl = imgMatch[1];
      }

      return {
        id: uuidv4(),
        feedId,
        title: entryTitle,
        link: entryLink,
        pubDate,
        imageUrl,
        isRead: false,
        isFavorite: false,
        contentSnippet: content.replace(/<[^>]*>/g, '').substring(0, 200),
      };
    });

    return {
      feed: { id: feedId, title, description, link, feedUrl, lastFetched: Date.now() },
      articles
    };
  } else {
    // Assume RSS 2.0
    const channel = xmlDoc.getElementsByTagName('channel')[0];
    if (!channel) throw new Error('Invalid RSS feed: missing <channel>');
    
    const title = channel.getElementsByTagName('title')[0]?.textContent || 'Untitled RSS Feed';
    const description = channel.getElementsByTagName('description')[0]?.textContent || '';
    const link = channel.getElementsByTagName('link')[0]?.textContent || '';
    const feedImage = channel.getElementsByTagName('image')[0]?.getElementsByTagName('url')[0]?.textContent;

    const items = Array.from(xmlDoc.getElementsByTagName('item'));
    const articles: Article[] = items.map(item => {
      const itemTitle = item.getElementsByTagName('title')[0]?.textContent || 'Untitled';
      const itemLink = item.getElementsByTagName('link')[0]?.textContent || '';
      const pubDateStr = item.getElementsByTagName('pubDate')[0]?.textContent || new Date().toISOString();
      const pubDate = new Date(pubDateStr).getTime();
      const content = item.getElementsByTagName('description')[0]?.textContent || 
                      item.getElementsByTagName('content:encoded')[0]?.textContent || '';
      
      let imageUrl = null;
      const enclosure = item.getElementsByTagName('enclosure')[0];
      if (enclosure && enclosure.getAttribute('type')?.startsWith('image/')) {
        imageUrl = enclosure.getAttribute('url');
      }
      
      if (!imageUrl) {
        const mediaContent = item.getElementsByTagName('media:content')[0] || 
                            item.getElementsByTagName('media:thumbnail')[0];
        if (mediaContent) imageUrl = mediaContent.getAttribute('url');
      }

      if (!imageUrl) {
        const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) imageUrl = imgMatch[1];
      }

      return {
        id: uuidv4(),
        feedId,
        title: itemTitle,
        link: itemLink,
        pubDate,
        imageUrl,
        isRead: false,
        isFavorite: false,
        contentSnippet: content.replace(/<[^>]*>/g, '').substring(0, 200),
      };
    });

    return {
      feed: { id: feedId, title, description, link, feedUrl, imageUrl: feedImage || undefined, lastFetched: Date.now() },
      articles
    };
  }
}

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

        const { feed, articles } = parseRssXml(response.data, feedUrl);
        
        const filteredArticles = articles.filter(a => 
          (Date.now() - a.pubDate) <= 2 * 24 * 60 * 60 * 1000 && 
          (!sinceDate || a.pubDate > sinceDate)
        );

        return { feed, articles: filteredArticles };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        logEvent('error', 'Native fetch failed', errorMsg);
        throw e;
      }
    }

    // Web fallback (will likely fail CORS for most sites)
    logEvent('info', `Web direct fetch (CORS restricted): ${feedUrl}`);
    try {
      const response = await fetch(feedUrl);
      const xmlString = await response.text();
      const { feed, articles } = parseRssXml(xmlString, feedUrl);
      
      const filteredArticles = articles.filter(a => 
        (Date.now() - a.pubDate) <= 2 * 24 * 60 * 60 * 1000 && 
        (!sinceDate || a.pubDate > sinceDate)
      );

      return { feed, articles: filteredArticles };
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
