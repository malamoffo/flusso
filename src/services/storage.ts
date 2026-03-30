import { get, set } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';
import { Feed, Article, Settings } from '../types';
import { CapacitorHttp } from '@capacitor/core';
import { fetchWithProxy } from '../utils/proxy';
import sanitizeHtml from 'sanitize-html';
import { getSafeUrl } from '../lib/utils';

import he from 'he';

const FEEDS_KEY = 'rss_feeds';
const ARTICLES_KEY = 'rss_articles';
const SETTINGS_KEY = 'rss_settings';

// Helper to decode HTML entities safely
function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return he.decode(text);
}

// Helper to escape XML special characters
function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

// Helper to sanitize article content into a safe text snippet
function sanitizeSnippet(input: string): string {
  if (!input) return '';
  const textOnly = sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
  return textOnly.trim().substring(0, 200);
}

// Helper to extract the best image from HTML content, avoiding tracking pixels and icons
export function extractBestImage(content: string): string | null {
  if (!content) return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  
  // Try og:image
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (ogImage) return ogImage;

  const imgTags = doc.getElementsByTagName('img');
  
  for (let i = 0; i < imgTags.length; i++) {
    const imgTag = imgTags[i];
    const url = imgTag.getAttribute('data-src') || 
                imgTag.getAttribute('data-lazy-src') ||
                imgTag.getAttribute('data-original') ||
                imgTag.getAttribute('src');
    if (!url) continue;
    
    // Skip likely tracking pixels or icons based on URL
    const lowerUrl = url.toLowerCase();
    if (
      lowerUrl.includes('1x1') ||
      lowerUrl.includes('pixel') ||
      lowerUrl.includes('tracker') ||
      lowerUrl.includes('feedburner') ||
      lowerUrl.includes('stats') ||
      lowerUrl.includes('gravatar') ||
      lowerUrl.includes('avatar') ||
      lowerUrl.includes('favicon') ||
      lowerUrl.includes('icon') ||
      lowerUrl.includes('logo') ||
      lowerUrl.includes('wp-includes/images/smilies') ||
      lowerUrl.includes('share') ||
      lowerUrl.includes('button') ||
      lowerUrl.includes('badge')
    ) {
      continue;
    }

    // Check for width/height attributes that suggest a 1x1 pixel
    const width = parseInt(imgTag.getAttribute('width') || '0', 10);
    const height = parseInt(imgTag.getAttribute('height') || '0', 10);
    if (width > 0 && width <= 10) continue;
    if (height > 0 && height <= 10) continue;

    // First valid image found
    return url;
  }
  
  return null;
}

// Helper to parse RSS/Atom XML using native DOMParser
function parseRssXml(xmlString: string, feedUrl: string): { feed: Feed; articles: Article[] } {
  if (typeof xmlString !== 'string') {
    xmlString = JSON.stringify(xmlString);
  }
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
          let mediaUrl = null;
          let mediaType = null;
          if (item.enclosure && item.enclosure.link && item.enclosure.type) {
            if (item.enclosure.type.startsWith('image/')) {
              if (!imageUrl) imageUrl = item.enclosure.link;
            } else if (item.enclosure.type.startsWith('audio/') || item.enclosure.type.startsWith('video/')) {
              mediaUrl = item.enclosure.link;
              mediaType = item.enclosure.type;
            }
          }
          if (!imageUrl) {
            const content = item.content || item.description || '';
            imageUrl = extractBestImage(content);
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
            link: getSafeUrl(item.link),
            pubDate,
            imageUrl: imageUrl ? getSafeUrl(imageUrl) : undefined,
            mediaUrl: getSafeUrl(mediaUrl, null as any),
            mediaType,
            isRead: false,
            isFavorite: false,
            isQueued: false,
            type: mediaType?.startsWith('audio/') ? 'podcast' : 'article',
            contentSnippet: sanitizeSnippet(decodeHtmlEntities(item.content || item.description || '')),
          };
        });

        return {
          feed: {
            id: feedId,
            title: data.feed.title || 'Untitled Feed',
            description: data.feed.description || '',
            link: getSafeUrl(data.feed.link),
            feedUrl: getSafeUrl(feedUrl),
            imageUrl: getSafeUrl(data.feed.image, undefined),
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

  // Helper to get text content from a list of possible tags, including namespaced ones
  function getTagText(element: Element, tags: string[]): string {
    for (const tag of tags) {
      // Try exact match (for namespaced tags in XML mode)
      let el = element.getElementsByTagName(tag)[0];
      
      // If not found and tag contains a colon, try local name (for HTML mode or different prefix handling)
      if (!el && tag.includes(':')) {
        const localName = tag.split(':')[1];
        el = element.getElementsByTagName(localName)[0];
      }
      
      if (el && el.textContent) return el.textContent.trim();
    }
    return '';
  }

  const isAtom = xmlDoc.getElementsByTagName('feed').length > 0;
  const feedId = uuidv4();
  
  if (isAtom) {
    const feedNode = xmlDoc.getElementsByTagName('feed')[0];
    const title = getTagText(feedNode, ['title', 'dc:title']) || 'Untitled Atom Feed';
    const description = getTagText(feedNode, ['subtitle', 'description', 'summary']) || '';
    const link = feedNode.getElementsByTagName('link')[0]?.getAttribute('href') || '';
    
    const entries = Array.from(xmlDoc.getElementsByTagName('entry'));
    const articles: Article[] = entries.map(entry => {
      const content = getTagText(entry, ['content', 'summary', 'description', 'content:encoded']) || '';
      let entryTitle = getTagText(entry, ['title', 'dc:title']);
      if (!entryTitle) {
        const plainText = sanitizeSnippet(decodeHtmlEntities(content));
        entryTitle = plainText.length > 50 ? plainText.substring(0, 50) + '...' : plainText;
        if (!entryTitle) entryTitle = 'Untitled';
      }
      const entryLink = entry.getElementsByTagName('link')[0]?.getAttribute('href') || '';
      const pubDateStr = getTagText(entry, ['published', 'updated', 'pubDate']) || new Date().toISOString();
      const pubDate = new Date(pubDateStr).getTime();
      
      // Try to find an image or media
      let imageUrl = null;
      let mediaUrl = null;
      let mediaType = null;
      
      const links = Array.from(entry.getElementsByTagName('link'));
      for (const l of links) {
        const rel = l.getAttribute('rel');
        const type = l.getAttribute('type');
        const href = l.getAttribute('href');
        if (rel === 'enclosure' && type && href) {
          if (type.startsWith('image/')) {
            if (!imageUrl) imageUrl = href;
          } else if (type.startsWith('audio/') || type.startsWith('video/')) {
            mediaUrl = href;
            mediaType = type;
          }
        }
      }

      const mediaContent = entry.getElementsByTagName('media:content')[0];
      if (mediaContent) {
        const type = mediaContent.getAttribute('type');
        const url = mediaContent.getAttribute('url');
        if (type?.startsWith('image/')) {
          if (!imageUrl) imageUrl = url;
        } else if (type?.startsWith('audio/') || type?.startsWith('video/')) {
          mediaUrl = url;
          mediaType = type;
        } else if (!type && url && (url.endsWith('.jpg') || url.endsWith('.png'))) {
          if (!imageUrl) imageUrl = url;
        }
      }
      
      if (!imageUrl) {
        imageUrl = extractBestImage(content);
      }

      let duration = getTagText(entry, ['itunes:duration', 'duration', 'media:duration']);
      if (!duration) {
        // Try to find duration in media:content or enclosure
        const mediaContent = entry.getElementsByTagName('media:content')[0];
        if (mediaContent) {
          duration = mediaContent.getAttribute('duration') || '';
        }
      }

      return {
        id: uuidv4(),
        feedId,
        title: decodeHtmlEntities(entryTitle),
        link: getSafeUrl(entryLink),
        pubDate,
        imageUrl: imageUrl ? getSafeUrl(imageUrl) : undefined,
        duration,
        mediaUrl: getSafeUrl(mediaUrl, null as any),
        mediaType,
        isRead: false,
        isFavorite: false,
        isQueued: false,
        type: mediaType?.startsWith('audio/') ? 'podcast' : 'article',
        contentSnippet: sanitizeSnippet(decodeHtmlEntities(content)),
        content: content,
      };
    });

    return {
      feed: {
        id: feedId,
        title,
        description,
        link: getSafeUrl(link),
        feedUrl: getSafeUrl(feedUrl),
        lastFetched: Date.now()
      },
      articles
    };
  } else {
    // Assume RSS 2.0
    const channel = xmlDoc.getElementsByTagName('channel')[0];
    if (!channel) throw new Error('Invalid RSS feed: missing <channel>');
    
    const title = getTagText(channel, ['title', 'dc:title']) || 'Untitled RSS Feed';
    const description = getTagText(channel, ['description', 'subtitle', 'summary']) || '';
    const link = getTagText(channel, ['link']) || '';
    
    // Try itunes:image first for feed image, fallback to image/url
    const itunesFeedImage = channel.getElementsByTagName('itunes:image')[0]?.getAttribute('href');
    const feedImage = itunesFeedImage || channel.getElementsByTagName('image')[0]?.getElementsByTagName('url')[0]?.textContent;

    const items = Array.from(xmlDoc.getElementsByTagName('item'));
    const articles: Article[] = items.map(item => {
      const content = getTagText(item, ['description', 'content:encoded', 'content', 'summary', 'itunes:summary', 'itunes:subtitle']) || '';
      let itemTitle = getTagText(item, ['title', 'dc:title']);
      if (!itemTitle) {
        const plainText = sanitizeSnippet(decodeHtmlEntities(content));
        itemTitle = plainText.length > 50 ? plainText.substring(0, 50) + '...' : plainText;
        if (!itemTitle) itemTitle = 'Untitled';
      }
      const itemLink = getTagText(item, ['link']) || '';
      const pubDateStr = getTagText(item, ['pubDate', 'published', 'updated']) || new Date().toISOString();
      const pubDate = new Date(pubDateStr).getTime();
      
      let imageUrl = null;
      let mediaUrl = null;
      let mediaType = null;
      
      // Try itunes:image first for podcasts
      const itunesImage = item.getElementsByTagName('itunes:image')[0]?.getAttribute('href');
      if (itunesImage) imageUrl = itunesImage;

      const enclosures = Array.from(item.getElementsByTagName('enclosure'));
      for (const enclosure of enclosures) {
        const type = enclosure.getAttribute('type');
        const url = enclosure.getAttribute('url');
        if (type && url) {
          if (type.startsWith('image/')) {
            if (!imageUrl) imageUrl = url;
          } else if (type.startsWith('audio/') || type.startsWith('video/')) {
            mediaUrl = url;
            mediaType = type;
          }
        }
      }
      
      if (!imageUrl) {
        const mediaContent = item.getElementsByTagName('media:content')[0] || 
                            item.getElementsByTagName('media:thumbnail')[0];
        if (mediaContent) {
          const type = mediaContent.getAttribute('type');
          const url = mediaContent.getAttribute('url');
          if (type?.startsWith('image/')) {
            imageUrl = url;
          } else if (type?.startsWith('audio/') || type?.startsWith('video/')) {
            mediaUrl = url;
            mediaType = type;
          } else if (url) {
            imageUrl = url; // fallback
          }
        }
      }

      if (!imageUrl) {
        imageUrl = extractBestImage(content);
      }

      let duration = getTagText(item, ['itunes:duration', 'duration', 'media:duration']);
      if (!duration) {
        // Try to find duration in media:content or enclosure
        const mediaContent = item.getElementsByTagName('media:content')[0];
        if (mediaContent) {
          duration = mediaContent.getAttribute('duration') || '';
        }
      }

      return {
        id: uuidv4(),
        feedId,
        title: decodeHtmlEntities(itemTitle),
        link: getSafeUrl(itemLink),
        pubDate,
        imageUrl: imageUrl ? getSafeUrl(imageUrl) : undefined,
        duration,
        mediaUrl: getSafeUrl(mediaUrl, null as any),
        mediaType,
        isRead: false,
        isFavorite: false,
        isQueued: false,
        type: mediaType?.startsWith('audio/') ? 'podcast' : 'article',
        contentSnippet: sanitizeSnippet(decodeHtmlEntities(content)),
        content: content,
      };
    });

    return {
      feed: {
        id: feedId,
        title,
        description,
        link: getSafeUrl(link),
        feedUrl: getSafeUrl(feedUrl),
        imageUrl: getSafeUrl(feedImage, undefined),
        lastFetched: Date.now()
      },
      articles
    };
  }
}

export const defaultSettings: Settings = {
  swipeLeftAction: 'toggleFavorite',
  swipeRightAction: 'toggleRead',
  imageDisplay: 'small',
  fontSize: 'medium',
  refreshInterval: 60, // Default to 1 hour
  themeColor: '#4f46e5', // Indigo-600
  autoCheckUpdates: true,
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
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    // Filter out articles older than their respective limits
    // to prevent storage saturation as requested by the user.
    // Podcasts get 7 days, articles get 3 days.
    const validArticles = articles.filter(a => {
      const articleTime = a.readAt || a.pubDate;
      const limit = a.type === 'podcast' ? SEVEN_DAYS : THREE_DAYS;
      return (now - articleTime) <= limit;
    }).map(a => ({
      ...a,
      type: a.type || (a.mediaType?.startsWith('audio/') ? 'podcast' : 'article'),
      isQueued: a.isQueued || false
    }));
    
    // If we filtered out some articles, save the cleaned up list
    if (validArticles.length !== articles.length) {
      await this.saveArticles(validArticles);
      // Also trigger a cleanup of orphaned content in the background
      this.cleanupOrphanedContent(validArticles).catch(err => console.error('Failed to cleanup orphaned content', err));
    }
    
    return validArticles;
  },

  async cleanupOrphanedContent(validArticles: Article[]): Promise<void> {
    const { keys, del } = await import('idb-keyval');
    const allKeys = await keys();
    const validIds = new Set(validArticles.map(a => a.id));
    const CONTENT_PREFIX = 'article_content_';
    
    for (const key of allKeys) {
      const keyStr = String(key);
      if (keyStr.startsWith(CONTENT_PREFIX)) {
        const id = keyStr.substring(CONTENT_PREFIX.length);
        if (!validIds.has(id)) {
          await del(key);
        }
      }
    }
  },

  async saveArticles(articles: Article[]): Promise<void> {
    await set(ARTICLES_KEY, articles);
  },

  async fetchFeedData(feedUrl: string, sinceDate?: number): Promise<{ feed: Feed; articles: Article[] }> {
    // Check if we are on a native platform (Android/iOS)
    const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();
    
    if (isNative) {
      // On native, we ALWAYS use direct fetch via CapacitorHttp as it bypasses CORS
      try {
        const options = {
          url: feedUrl,
          headers: { 
            'Accept': 'application/xml, text/xml, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          connectTimeout: 30000,
          readTimeout: 30000,
        };
        
        const response = await CapacitorHttp.get(options);
        
        if (response.status === 200) {
          const dataString = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          const { feed, articles } = parseRssXml(dataString, feedUrl);
          
          const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
          const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

          const filteredArticles = articles.filter(a => {
            const limit = a.type === 'podcast' ? SEVEN_DAYS : THREE_DAYS;
            return (Date.now() - a.pubDate) <= limit && 
                   (!sinceDate || a.pubDate > sinceDate);
          });

          return { feed, articles: filteredArticles };
        } else {
          throw new Error(`Feed fetch failed with status ${response.status}`);
        }
      } catch (e) {
        console.error(`[STORAGE] Native direct fetch failed for ${feedUrl}:`, e);
        throw e;
      }
    }

    // Web fallback (using CORS proxy to avoid "Failed to fetch" errors in browser preview)
    try {
      const xmlString = await fetchWithProxy(feedUrl);
      const { feed, articles } = parseRssXml(xmlString, feedUrl);
      
      const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

      const filteredArticles = articles.filter(a => {
        const limit = a.type === 'podcast' ? SEVEN_DAYS : THREE_DAYS;
        return (Date.now() - a.pubDate) <= limit && 
               (!sinceDate || a.pubDate > sinceDate);
      });

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
    
    // Create a set of all existing links for fast lookup
    const existingLinks = new Set(existingArticles.map(a => a.link));
    
    let updatedFeeds = [...existingFeeds];
    let allNewArticles: Article[] = [];
    
    for (const { feed, articles } of results) {
      const existingFeedIndex = updatedFeeds.findIndex(f => f.feedUrl === feed.feedUrl);
      
      if (existingFeedIndex === -1) {
        updatedFeeds.push(feed);
        // Still check for duplicates even for new feeds
        const trulyNewArticles = articles.filter(a => !existingLinks.has(a.link));
        allNewArticles.push(...trulyNewArticles);
      } else {
        const feedId = updatedFeeds[existingFeedIndex].id;
        updatedFeeds[existingFeedIndex] = {
          ...updatedFeeds[existingFeedIndex],
          lastFetched: Date.now(),
          title: feed.title,
          imageUrl: feed.imageUrl || updatedFeeds[existingFeedIndex].imageUrl
        };
        
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

  async fetchUrlContent(url: string): Promise<string> {
    const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();
    if (isNative) {
      const options = {
        url,
        headers: { 
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        connectTimeout: 30000,
        readTimeout: 30000,
      };
      const response = await CapacitorHttp.get(options);
      if (response.status === 200) {
        return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      }
      throw new Error(`Fetch failed with status ${response.status}`);
    }
    return await fetchWithProxy(url, false);
  },

  async discoverFeedUrl(url: string): Promise<string> {
    try {
      const content = await this.fetchUrlContent(url);
      const trimmedContent = content.trim();

      // If it looks like XML or JSON, it might already be a feed
      if (trimmedContent.startsWith('<?xml') || trimmedContent.startsWith('<rss') || trimmedContent.startsWith('<feed') || trimmedContent.startsWith('{')) {
        return url;
      }

      // It's likely HTML, try to find feed links
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      
      // Look for <link rel="alternate" type="application/rss+xml" ...>
      const feedLinks = doc.querySelectorAll('link[rel="alternate"]');
      for (const link of Array.from(feedLinks)) {
        const type = link.getAttribute('type');
        const href = link.getAttribute('href');
        if (href && (type === 'application/rss+xml' || type === 'application/atom+xml' || type === 'application/json')) {
          // Resolve relative URL
          try {
            return new URL(href, url).href;
          } catch (e) {
            return href;
          }
        }
      }

      // Try common paths as a fallback
      const commonPaths = ['feed', 'rss', 'rss.xml', 'index.xml', 'atom.xml', 'feed.xml', '/feed', '/rss', '/rss.xml', '/index.xml', '/atom.xml', '/feed.xml'];
      const baseUrl = new URL(url);
      const baseSearchUrl = baseUrl.href.endsWith('/') ? baseUrl.href : baseUrl.href + '/';
      
      for (const path of commonPaths) {
        try {
          const testUrl = new URL(path, baseSearchUrl).href;
          const testContent = await this.fetchUrlContent(testUrl);
          const trimmed = testContent.trim();
          if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed')) {
            return testUrl;
          }
        } catch (e) {
          // Ignore failures for common paths
        }
      }

      return url; // Return original if nothing found
    } catch (e) {
      console.warn('Feed discovery failed, using original URL:', e);
      return url;
    }
  },

  async addFeed(url: string, append: boolean = true): Promise<{ feed: Feed; articles: Article[] }> {
    const discoveredUrl = await this.discoverFeedUrl(url);
    const data = await this.fetchFeedData(discoveredUrl);
    if (!append) {
      // If not appending, we might want to clear existing feeds, 
      // but usually "Import from scratch" means replace the whole list.
      // This is handled in saveAllFeedData if we pass a flag or clear first.
    }
    await this.saveFeedData(data.feed, data.articles);
    return data;
  },

  async parseOpml(opmlText: string): Promise<string[]> {
    console.log('Parsing OPML text, length:', opmlText.length);
    const parser = new DOMParser();
    const doc = parser.parseFromString(opmlText, 'application/xml');
    
    // If XML parsing fails (common with malformed OPML), treat as invalid and return no URLs
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      console.warn('OPML XML parsing failed, treating file as invalid:', parserError.textContent);
      return [];
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
  },

  async exportOpml(): Promise<string> {
    const feeds = await this.getFeeds();
    let opml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    opml += '<opml version="1.0">\n';
    opml += '  <head>\n';
    opml += '    <title>Flusso Feeds</title>\n';
    opml += '  </head>\n';
    opml += '  <body>\n';
    feeds.forEach(feed => {
      const title = escapeXml(feed.title || 'Untitled');
      const xmlUrl = escapeXml(feed.feedUrl || '');
      const htmlUrl = escapeXml(feed.link || '');
      opml += `    <outline text="${title}" title="${title}" type="rss" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}"/>\n`;
    });
    opml += '  </body>\n';
    opml += '</opml>';
    return opml;
  }
};