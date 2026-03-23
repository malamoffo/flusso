import { get, set } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';
import { Feed, Article, Settings } from '../types';
import { CapacitorHttp } from '@capacitor/core';
import { fetchWithProxy } from '../utils/proxy';

const FEEDS_KEY = 'rss_feeds';
const ARTICLES_KEY = 'rss_articles';
const SETTINGS_KEY = 'rss_settings';

// Helper to decode HTML entities
function decodeHtmlEntities(text: string): string {
  const textArea = document.createElement('textarea');
  textArea.innerHTML = text;
  return textArea.value;
}

// Helper to parse RSS/Atom XML using native DOMParser
function parseRssXml(xmlString: string, feedUrl: string): { feed: Feed; articles: Article[] } {
  if (!xmlString || xmlString.trim() === '') {
    throw new Error('Received empty response from the feed URL.');
  }

  // Check if it's a JSON response from rss2json fallback
  if (xmlString.trim().startsWith('{')) {
    try {
      const data = JSON.parse(xmlString);
      if (data.status === 'ok' && data.feed && data.items) {
        const feedId = uuidv4();
        const articles: Article[] = data.items.map((item: any) => {
          let imageUrl = item.thumbnail || null;
          if (!imageUrl && item.enclosure && item.enclosure.link && item.enclosure.type && item.enclosure.type.startsWith('image/')) {
            imageUrl = item.enclosure.link;
          }
          if (!imageUrl) {
            const content = item.content || item.description || '';
            const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
            if (imgMatch) imageUrl = imgMatch[1];
          }

          let pubDate = Date.now();
          if (item.pubDate) {
            // rss2json returns dates like "2026-03-22 07:01:18" which might need parsing
            pubDate = new Date(item.pubDate.replace(' ', 'T') + 'Z').getTime();
            if (isNaN(pubDate)) pubDate = new Date(item.pubDate).getTime();
            if (isNaN(pubDate)) pubDate = Date.now();
          }

          return {
            id: uuidv4(),
            feedId,
            title: decodeHtmlEntities(item.title || 'Untitled'),
            link: item.link || '',
            pubDate,
            imageUrl,
            isRead: false,
            isFavorite: false,
            contentSnippet: decodeHtmlEntities((item.content || item.description || '').replace(/<[^>]*>/g, '').substring(0, 200)),
          };
        });

        return {
          feed: {
            id: feedId,
            title: data.feed.title || 'Untitled Feed',
            description: data.feed.description || '',
            link: data.feed.link || '',
            feedUrl,
            imageUrl: data.feed.image || undefined,
            lastFetched: Date.now()
          },
          articles
        };
      }
    } catch (e) {
      // Fall through to XML parsing if JSON parsing fails
    }
  }

  const parser = new DOMParser();
  let xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  // Check for parsing errors
  let parserError = xmlDoc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    console.warn('XML parsing failed, trying HTML mode:', parserError.textContent);
    xmlDoc = parser.parseFromString(xmlString, 'text/html');
  }
  
  // Check again for parsing errors
  parserError = xmlDoc.getElementsByTagName('parsererror')[0];
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
        title: decodeHtmlEntities(entryTitle),
        link: entryLink,
        pubDate,
        imageUrl,
        isRead: false,
        isFavorite: false,
        contentSnippet: decodeHtmlEntities(content.replace(/<[^>]*>/g, '').substring(0, 200)),
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
        title: decodeHtmlEntities(itemTitle),
        link: itemLink,
        pubDate,
        imageUrl,
        isRead: false,
        isFavorite: false,
        contentSnippet: decodeHtmlEntities(content.replace(/<[^>]*>/g, '').substring(0, 200)),
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
  refreshInterval: 60, // Default to 1 hour
  pureBlack: false,
  themeColor: '#4f46e5' // Indigo-600
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
    const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();
    
    // Always try direct fetch first, as native platforms don't have CORS issues
    try {
      const options = {
        url: feedUrl,
        headers: { 'Accept': 'application/xml, text/xml, */*' },
        connectTimeout: 10000,
        readTimeout: 10000,
      };
      
      const response = await CapacitorHttp.get(options);
      
      if (response.status === 200) {
        const { feed, articles } = parseRssXml(response.data, feedUrl);
        
        const filteredArticles = articles.filter(a => 
          (Date.now() - a.pubDate) <= 2 * 24 * 60 * 60 * 1000 && 
          (!sinceDate || a.pubDate > sinceDate)
        );

        return { feed, articles: filteredArticles };
      }
    } catch (e) {
      console.warn(`Direct fetch failed for ${feedUrl}, falling back to proxy:`, e);
    }

    // Web fallback (using CORS proxy to avoid "Failed to fetch" errors in browser preview)
    try {
      const xmlString = await fetchWithProxy(feedUrl);
      const { feed, articles } = parseRssXml(xmlString, feedUrl);
      
      const filteredArticles = articles.filter(a => 
        (Date.now() - a.pubDate) <= 2 * 24 * 60 * 60 * 1000 && 
        (!sinceDate || a.pubDate > sinceDate)
      );

      return { feed, articles: filteredArticles };
    } catch (e) {
      console.error(`[STORAGE] Web fetch error for ${feedUrl}:`, e);
      throw e;
    }
  },

  async saveFeedData(feed: Feed, articles: Article[]): Promise<void> {
    await this.saveAllFeedData([{ feed, articles }]);
  },

  async saveAllFeedData(results: { feed: Feed; articles: Article[] }[]): Promise<void> {
    const existingFeeds = await this.getFeeds();
    const existingArticles = await this.getArticles();
    
    let updatedFeeds = [...existingFeeds];
    let allNewArticles: Article[] = [];
    
    for (const { feed, articles } of results) {
      const existingFeedIndex = updatedFeeds.findIndex(f => f.feedUrl === feed.feedUrl);
      
      if (existingFeedIndex === -1) {
        updatedFeeds.push(feed);
        allNewArticles.push(...articles);
      } else {
        const feedId = updatedFeeds[existingFeedIndex].id;
        updatedFeeds[existingFeedIndex] = {
          ...updatedFeeds[existingFeedIndex],
          lastFetched: Date.now(),
          title: feed.title,
          imageUrl: feed.imageUrl || updatedFeeds[existingFeedIndex].imageUrl
        };
        
        const existingLinks = new Set(existingArticles.filter(a => a.feedId === feedId).map(a => a.link));
        const trulyNewArticles = articles.filter(a => !existingLinks.has(a.link)).map(a => ({
          ...a,
          feedId
        }));
        
        allNewArticles.push(...trulyNewArticles);
      }
    }
    
    if (allNewArticles.length > 0) {
      await this.saveArticles([...existingArticles, ...allNewArticles]);
    }
    await this.saveFeeds(updatedFeeds);
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
