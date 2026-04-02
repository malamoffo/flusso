import { get, set } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';
import { Feed, Article, Settings, PodcastChapter } from '../types';
import { CapacitorHttp } from '@capacitor/core';
import { fetchWithProxy } from '../utils/proxy';
import DOMPurify from 'dompurify';
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
  const textOnly = DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  return textOnly.trim().substring(0, 200);
}

// Helper to extract the best image from HTML content, avoiding tracking pixels and icons
export function extractBestImage(content: string, baseUrl?: string): string | null {
  if (!content) return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  
  const resolveUrl = (url: string | null): string | null => {
    if (!url) return null;
    if (!baseUrl) return url;
    try {
      return new URL(url, baseUrl).href;
    } catch (e) {
      return url;
    }
  };

  // Try og:image
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (ogImage) return resolveUrl(ogImage);

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
    return resolveUrl(url);
  }
  
  return null;
}

function parseTime(timeStr: string | null): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').reverse();
  let seconds = 0;
  for (let i = 0; i < parts.length; i++) {
    seconds += parseFloat(parts[i]) * Math.pow(60, i);
  }
  return seconds;
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
            mediaUrl: getSafeUrl(mediaUrl, undefined),
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
  // We keep this for feed-level tags, but bypass it for item-level parsing which is optimized
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

  // Optimized single-pass text retrieval using a pre-computed tag dictionary
  function getSingleTagText(tagDict: Record<string, Element[]>, tags: string[]): string {
    for (let t = 0; t < tags.length; t++) {
      const elements = tagDict[tags[t].toLowerCase()];
      if (elements && elements.length > 0 && elements[0].textContent) {
        return elements[0].textContent.trim();
      }
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
    const articles: Article[] = [];
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      
      // Single-pass iteration to build a dictionary of immediate children
      const tagDict: Record<string, Element[]> = {};
      const children = entry.children;
      for (let c = 0; c < children.length; c++) {
        const child = children[c];
        const nodeName = child.nodeName.toLowerCase();
        
        let elements = tagDict[nodeName];
        if (!elements) {
          elements = [];
          tagDict[nodeName] = elements;
        }
        elements.push(child);
        
        const colonIndex = nodeName.indexOf(':');
        if (colonIndex !== -1) {
          const localName = nodeName.substring(colonIndex + 1);
          let localElements = tagDict[localName];
          if (!localElements) {
            localElements = [];
            tagDict[localName] = localElements;
          }
          localElements.push(child);
        }
      }

      const content = getSingleTagText(tagDict, ['content:encoded', 'content', 'itunes:summary', 'summary', 'description']) || '';
      let entryTitle = getSingleTagText(tagDict, ['title', 'dc:title']);
      
      if (!entryTitle) {
        const plainText = sanitizeSnippet(decodeHtmlEntities(content));
        entryTitle = plainText.length > 50 ? plainText.substring(0, 50) + '...' : plainText;
        if (!entryTitle) entryTitle = 'Untitled';
      }
      
      const linkElements = tagDict['link'] || [];
      const entryLink = linkElements.length > 0 ? (linkElements[0].getAttribute('href') || '') : '';
      const pubDateStr = getSingleTagText(tagDict, ['published', 'updated', 'pubDate']) || new Date().toISOString();
      const pubDate = new Date(pubDateStr).getTime();
      
      let imageUrl: string | null = null;
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;
      
      for (let j = 0; j < linkElements.length; j++) {
        const l = linkElements[j];
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

      const groupElements = tagDict['media:group'] || tagDict['group'] || [];
      const mediaContentElements = [...(tagDict['media:content'] || tagDict['content'] || [])];
      
      for (let j = 0; j < groupElements.length; j++) {
        const groupChildren = groupElements[j].children;
        for (let k = 0; k < groupChildren.length; k++) {
          const nn = groupChildren[k].nodeName.toLowerCase();
          if (nn === 'media:content' || nn.endsWith(':content') || nn === 'content') {
            mediaContentElements.push(groupChildren[k]);
          }
        }
      }

      if (mediaContentElements.length > 0) {
        const mediaContent = mediaContentElements[0];
        const type = mediaContent.getAttribute('type');
        const url = mediaContent.getAttribute('url');
        if (type?.startsWith('image/')) {
          if (!imageUrl && url) imageUrl = url;
        } else if (type?.startsWith('audio/') || type?.startsWith('video/')) {
          if (url) {
            mediaUrl = url;
            mediaType = type;
          }
        } else if (!type && url && (url.endsWith('.jpg') || url.endsWith('.png'))) {
          if (!imageUrl) imageUrl = url;
        }
      }
      
      if (!imageUrl) {
        // We need to allow img tags to extract the best image
        const sanitizedForImage = DOMPurify.sanitize(content, {
          ALLOWED_TAGS: ['img', 'figure', 'picture', 'source'],
          ALLOWED_ATTR: ['src', 'data-src', 'data-lazy-src', 'data-original', 'width', 'height', 'alt', 'srcset', 'data-srcset']
        });
        imageUrl = extractBestImage(sanitizedForImage, entryLink);
      }

      let duration = getSingleTagText(tagDict, ['itunes:duration', 'duration', 'media:duration']);
      if (!duration && mediaContentElements.length > 0) {
        duration = mediaContentElements[0].getAttribute('duration') || '';
      }

      let chapters: PodcastChapter[] | undefined = undefined;
      let chaptersUrl: string | undefined = undefined;

      const pscChaptersElements = tagDict['psc:chapters'] || tagDict['chapters'] || [];
      if (pscChaptersElements.length > 0) {
        const chapterNodes = pscChaptersElements[0].getElementsByTagName('psc:chapter');
        const fallbackNodes = pscChaptersElements[0].getElementsByTagName('chapter');
        const nodesToUse = chapterNodes.length > 0 ? chapterNodes : fallbackNodes;
        
        if (nodesToUse.length > 0) {
          chapters = [];
          for (let k = 0; k < nodesToUse.length; k++) {
            const node = nodesToUse[k];
            const start = node.getAttribute('start');
            const title = node.getAttribute('title');
            const href = node.getAttribute('href');
            const image = node.getAttribute('image');
            if (start && title) {
              chapters.push({
                startTime: parseTime(start),
                title: title,
                url: href || undefined,
                imageUrl: image || undefined
              });
            }
          }
        }
      }

      const podcastChaptersElements = tagDict['podcast:chapters'] || [];
      if (podcastChaptersElements.length > 0) {
        const url = podcastChaptersElements[0].getAttribute('url');
        if (url) {
          chaptersUrl = getSafeUrl(url);
        }
      }

      articles.push({
        id: uuidv4(),
        feedId,
        title: decodeHtmlEntities(entryTitle),
        link: getSafeUrl(entryLink),
        pubDate,
        imageUrl: imageUrl ? getSafeUrl(imageUrl) : undefined,
        duration,
        mediaUrl: getSafeUrl(mediaUrl, undefined),
        mediaType,
        isRead: false,
        isFavorite: false,
        isQueued: false,
        type: mediaType?.startsWith('audio/') ? 'podcast' : 'article',
        chapters,
        chaptersUrl,
        contentSnippet: sanitizeSnippet(decodeHtmlEntities(content)),
        content: content,
      });
    }

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
    const articles: Article[] = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      const tagDict: Record<string, Element[]> = {};
      const children = item.children;
      for (let c = 0; c < children.length; c++) {
        const child = children[c];
        const nodeName = child.nodeName.toLowerCase();
        
        let elements = tagDict[nodeName];
        if (!elements) {
          elements = [];
          tagDict[nodeName] = elements;
        }
        elements.push(child);
        
        const colonIndex = nodeName.indexOf(':');
        if (colonIndex !== -1) {
          const localName = nodeName.substring(colonIndex + 1);
          let localElements = tagDict[localName];
          if (!localElements) {
            localElements = [];
            tagDict[localName] = localElements;
          }
          localElements.push(child);
        }
      }
      
      const content = getSingleTagText(tagDict, ['content:encoded', 'content', 'itunes:summary', 'summary', 'description', 'itunes:subtitle']) || '';
      let itemTitle = getSingleTagText(tagDict, ['title', 'dc:title']);
      if (!itemTitle) {
        const plainText = sanitizeSnippet(decodeHtmlEntities(content));
        itemTitle = plainText.length > 50 ? plainText.substring(0, 50) + '...' : plainText;
        if (!itemTitle) itemTitle = 'Untitled';
      }
      
      const itemLink = getSingleTagText(tagDict, ['link']) || '';
      const pubDateStr = getSingleTagText(tagDict, ['pubDate', 'published', 'updated']) || new Date().toISOString();
      const pubDate = new Date(pubDateStr).getTime();
      
      let imageUrl: string | null = null;
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;
      
      const itunesImageElements = tagDict['itunes:image'] || tagDict['image'] || [];
      if (itunesImageElements.length > 0) {
        const itunesImage = itunesImageElements[0].getAttribute('href');
        if (itunesImage) imageUrl = itunesImage;
      }

      const enclosures = tagDict['enclosure'] || [];
      for (let j = 0; j < enclosures.length; j++) {
        const enclosure = enclosures[j];
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
      
      const groupElements = tagDict['media:group'] || tagDict['group'] || [];
      const mediaContentElements = [...(tagDict['media:content'] || tagDict['content'] || tagDict['media:thumbnail'] || tagDict['thumbnail'] || [])];
      
      for (let j = 0; j < groupElements.length; j++) {
        const groupChildren = groupElements[j].children;
        for (let k = 0; k < groupChildren.length; k++) {
          const nn = groupChildren[k].nodeName.toLowerCase();
          if (nn === 'media:content' || nn.endsWith(':content') || nn === 'content' || nn === 'media:thumbnail' || nn.endsWith(':thumbnail') || nn === 'thumbnail') {
            mediaContentElements.push(groupChildren[k]);
          }
        }
      }

      if (!imageUrl && mediaContentElements.length > 0) {
        const mediaContent = mediaContentElements[0];
        const type = mediaContent.getAttribute('type');
        const url = mediaContent.getAttribute('url');
        if (type?.startsWith('image/')) {
          if (url) imageUrl = url;
        } else if (type?.startsWith('audio/') || type?.startsWith('video/')) {
          if (url) {
            mediaUrl = url;
            mediaType = type;
          }
        } else if (url) {
          imageUrl = url;
        }
      }

      if (!imageUrl) {
        imageUrl = extractBestImage(content, itemLink);
      }

      let duration = getSingleTagText(tagDict, ['itunes:duration', 'duration', 'media:duration']);
      if (!duration && mediaContentElements.length > 0) {
        duration = mediaContentElements[0].getAttribute('duration') || '';
      }

      let chapters: PodcastChapter[] | undefined = undefined;
      let chaptersUrl: string | undefined = undefined;

      const pscChaptersElements = tagDict['psc:chapters'] || tagDict['chapters'] || [];
      if (pscChaptersElements.length > 0) {
        const chapterNodes = pscChaptersElements[0].getElementsByTagName('psc:chapter');
        const fallbackNodes = pscChaptersElements[0].getElementsByTagName('chapter');
        const nodesToUse = chapterNodes.length > 0 ? chapterNodes : fallbackNodes;
        
        if (nodesToUse.length > 0) {
          chapters = [];
          for (let k = 0; k < nodesToUse.length; k++) {
            const node = nodesToUse[k];
            const start = node.getAttribute('start');
            const title = node.getAttribute('title');
            const href = node.getAttribute('href');
            const image = node.getAttribute('image');
            if (start && title) {
              chapters.push({
                startTime: parseTime(start),
                title: title,
                url: href || undefined,
                imageUrl: image || undefined
              });
            }
          }
        }
      }

      const podcastChaptersElements = tagDict['podcast:chapters'] || [];
      if (podcastChaptersElements.length > 0) {
        const url = podcastChaptersElements[0].getAttribute('url');
        if (url) {
          chaptersUrl = getSafeUrl(url);
        }
      }

      articles.push({
        id: uuidv4(),
        feedId,
        title: decodeHtmlEntities(itemTitle),
        link: getSafeUrl(itemLink),
        pubDate,
        imageUrl: imageUrl ? getSafeUrl(imageUrl) : undefined,
        duration,
        mediaUrl: getSafeUrl(mediaUrl, undefined),
        mediaType,
        isRead: false,
        isFavorite: false,
        isQueued: false,
        type: mediaType?.startsWith('audio/') ? 'podcast' : 'article',
        chapters,
        chaptersUrl,
        contentSnippet: sanitizeSnippet(decodeHtmlEntities(content)),
        content: content,
      });
    }

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
  swipeRightAction: 'none',
  imageDisplay: 'small',
  fontSize: 'medium',
  refreshInterval: 60, // Default to 1 hour
  themeColor: '#4f46e5', // Indigo-600
  autoCheckUpdates: true,
  theme: 'dark',
  pureBlack: true,
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
    if (articles.length === 0) return [];

    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    const validArticles: Article[] = [];
    let hasChanged = false;

    for (let i = 0; i < articles.length; i++) {
      const a = articles[i];
      let keep = false;

      if (a.isFavorite || a.isQueued) {
        keep = true;
      } else {
        const limit = !a.isRead 
          ? (a.type === 'podcast' ? 30 * 24 * 60 * 60 * 1000 : 14 * 24 * 60 * 60 * 1000)
          : (a.type === 'podcast' ? SEVEN_DAYS : THREE_DAYS);
        
        const referenceTime = (a.isRead && a.readAt) ? a.readAt : a.pubDate;
        if ((now - referenceTime) <= limit) {
          keep = true;
        }
      }

      if (keep) {
        // Normalize only if necessary to avoid object creation
        if (a.type === undefined || a.isQueued === undefined) {
          validArticles.push({
            ...a,
            type: a.type || (a.mediaType?.startsWith('audio/') ? 'podcast' : 'article'),
            isQueued: a.isQueued || false
          });
          hasChanged = true;
        } else {
          validArticles.push(a);
        }
      } else {
        hasChanged = true;
      }
    }
    
    if (hasChanged) {
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

  async fetchFeedData(feedUrl: string, sinceDate?: number, signal?: AbortSignal): Promise<{ feed: Feed; articles: Article[] } | null> {
    // Check if we are on a native platform (Android/iOS)
    const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();
    
    if (isNative) {
      // On native, we ALWAYS use direct fetch via CapacitorHttp as it bypasses CORS
      try {
        if (signal?.aborted) return null;

        const headers: Record<string, string> = { 
          'Accept': 'application/xml, text/xml, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };

        if (sinceDate) {
          headers['If-Modified-Since'] = new Date(sinceDate).toUTCString();
        }

        const options = {
          url: feedUrl,
          headers,
          connectTimeout: 15000,
          readTimeout: 15000,
        };
        
        const response = await CapacitorHttp.get(options);
        
        if (response.status === 304) {
          console.log(`[STORAGE] Feed not modified since ${sinceDate} for ${feedUrl}`);
          return null; // No new articles
        }

        if (response.status === 200) {
          const dataString = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          const { feed, articles } = parseRssXml(dataString, feedUrl);
          
          const filteredArticles = articles.filter(a => {
            // When fetching, we use a slightly more generous limit to catch 
            // articles missed during a weekend or short break.
            const limit = a.type === 'podcast' ? 14 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
            return (Date.now() - a.pubDate) <= limit && 
                   (!sinceDate || a.pubDate > sinceDate);
          });

          return { feed, articles: filteredArticles };
        } else {
          console.warn(`Feed fetch failed with status ${response.status} for ${feedUrl}`);
          return null;
        }
      } catch (e) {
        console.warn(`[STORAGE] Native direct fetch failed for ${feedUrl}:`, e);
        return null;
      }
    }

    // Web fallback (using CORS proxy to avoid "Failed to fetch" errors in browser preview)
    try {
      const xmlString = await fetchWithProxy(feedUrl, true, sinceDate, signal);
      if (!xmlString) return null; // 304 or empty

      const { feed, articles } = parseRssXml(xmlString, feedUrl);
      
      const filteredArticles = articles.filter(a => {
        // When fetching, we use a slightly more generous limit to catch 
        // articles missed during a weekend or short break.
        const limit = a.type === 'podcast' ? 14 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
        return (Date.now() - a.pubDate) <= limit && 
               (!sinceDate || a.pubDate > sinceDate);
      });

      return { feed, articles: filteredArticles };
    } catch (e) {
      console.warn(`[STORAGE] Web fetch error for ${feedUrl}:`, e);
      return null;
    }
  },

  async saveFeedData(feed: Feed, articles: Article[]): Promise<void> {
    await this.saveAllFeedData([{ feed, articles }]);
  },

  async saveAllFeedData(
    results: { feed: Feed; articles: Article[] }[],
    existingFeeds?: Feed[],
    existingArticles?: Article[]
  ): Promise<{ updatedFeeds: Feed[]; allNewArticles: Article[] }> {
    const feeds = existingFeeds || await this.getFeeds();
    const articles = existingArticles || await this.getArticles();
    
    // Create a set of all existing links for fast lookup
    const existingLinks = new Set(articles.map(a => a.link));
    
    let updatedFeeds = [...feeds];
    let allNewArticles: Article[] = [];
    
    for (const { feed, articles: newArticles } of results) {
      const existingFeedIndex = updatedFeeds.findIndex(f => f.feedUrl === feed.feedUrl);
      
      // Calculate the latest article date from the new articles using reduce for performance
      const latestFromNew = newArticles.length > 0 
        ? newArticles.reduce((max, a) => Math.max(max, a.pubDate), 0)
        : 0;
      
      if (existingFeedIndex === -1) {
        updatedFeeds.push({
          ...feed,
          lastArticleDate: latestFromNew
        });
        // Still check for duplicates even for new feeds
        const trulyNewArticles = newArticles.filter(a => !existingLinks.has(a.link));
        allNewArticles.push(...trulyNewArticles);
      } else {
        const feedId = updatedFeeds[existingFeedIndex].id;
        const currentLastArticleDate = updatedFeeds[existingFeedIndex].lastArticleDate || 0;
        
        updatedFeeds[existingFeedIndex] = {
          ...updatedFeeds[existingFeedIndex],
          lastFetched: Date.now(),
          lastArticleDate: Math.max(currentLastArticleDate, latestFromNew),
          title: feed.title,
          imageUrl: feed.imageUrl || updatedFeeds[existingFeedIndex].imageUrl
        };
        
        const trulyNewArticles = newArticles.filter(a => !existingLinks.has(a.link)).map(a => ({
          ...a,
          feedId
        }));
        
        allNewArticles.push(...trulyNewArticles);
      }
    }
    
    if (allNewArticles.length > 0) {
      await this.saveArticles([...articles, ...allNewArticles]);
    }
    await this.saveFeeds(updatedFeeds);
    
    return { updatedFeeds, allNewArticles };
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

  async addFeed(url: string, append: boolean = true): Promise<{ feed: Feed; articles: Article[] } | null> {
    const discoveredUrl = await this.discoverFeedUrl(url);
    const data = await this.fetchFeedData(discoveredUrl);
    if (!data) return null;
    
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