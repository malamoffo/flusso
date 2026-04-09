import { get, set } from 'idb-keyval';
import { v4 as uuidv4 } from 'uuid';
import { Feed, Article, Settings, PodcastChapter, FullArticleContent, RefreshLog, Subreddit, RedditPost } from '../types';
import { CapacitorHttp } from '@capacitor/core';
import { fetchWithProxy } from '../utils/proxy';
import DOMPurify from 'dompurify';
import { getSafeUrl, resolveUrl } from '../lib/utils';

import he from 'he';
import { parseRssXml, escapeXml, extractBestImage } from './rssParser';

const FEEDS_KEY = 'rss_feeds';
const ARTICLES_KEY = 'rss_articles';
const SETTINGS_KEY = 'rss_settings';
const REFRESH_LOGS_KEY = 'rss_refresh_logs';
const CONTENT_PREFIX = 'article_content_';
const SUBREDDITS_KEY = 'reddit_subs';
const REDDIT_POSTS_KEY = 'reddit_posts';



// Helper to parse RSS/Atom XML using native DOMParser


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

  async getArticles(offset = 0, limit = 0): Promise<Article[]> {
    const articles = (await get<Article[]>(ARTICLES_KEY)) || [];
    if (articles.length === 0) return [];

    // If limit is 0, return all (for internal use or legacy support)
    // But we still want to apply the cleanup logic if it's the first load
    
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
        const limitTime = a.type === 'podcast' ? SEVEN_DAYS : THREE_DAYS;
        
        const referenceTime = (a.isRead && a.readAt) ? a.readAt : a.pubDate;
        if ((now - referenceTime) <= limitTime) {
          keep = true;
        }
      }

      if (keep) {
        // Normalize and ensure content is NOT in the main list
        if (a.content || a.type === undefined || a.isQueued === undefined) {
          const { content, ...lightArticle } = a;
          validArticles.push({
            ...lightArticle,
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
      
      // Yield to main thread every 500 articles to keep UI responsive
      if (i % 500 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    if (hasChanged) {
      await this.saveArticles(validArticles);
      // Also trigger a cleanup of orphaned content in the background
      // Use a small delay to not block the main thread during initial load
      setTimeout(() => {
        this.cleanupOrphanedContent(validArticles).catch(err => console.error('Failed to cleanup orphaned content', err));
      }, 2000);
    }
    
    // Sort by date descending
    validArticles.sort((a, b) => b.pubDate - a.pubDate);

    if (limit > 0) {
      return validArticles.slice(offset, offset + limit);
    }
    
    return validArticles;
  },

  async cleanUpOldArticles(): Promise<void> {
    // This is essentially what getArticles(0, 0) does now, 
    // but we can make it more explicit and run it in background
    console.log('[STORAGE] Running garbage collection...');
    await this.getArticles(0, 0);
  },

  async getArticleContent(id: string): Promise<string | null> {
    const fullContent = await get<FullArticleContent>(`${CONTENT_PREFIX}${id}`);
    return fullContent?.content || null;
  },

  async saveArticleContent(id: string, content: string): Promise<void> {
    // We only save if it's not already there or we want to update it
    // Usually handled by contentFetcher, but good to have here
    const existing = await get<FullArticleContent>(`${CONTENT_PREFIX}${id}`);
    if (existing) {
      await set(`${CONTENT_PREFIX}${id}`, { ...existing, content });
    } else {
      // Create a minimal FullArticleContent if it doesn't exist
      await set(`${CONTENT_PREFIX}${id}`, { 
        title: '', 
        content, 
        textContent: '', 
        length: content.length, 
        excerpt: '', 
        byline: '', 
        dir: '', 
        siteName: '', 
        lang: '' 
      });
    }
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
          connectTimeout: 25000,
          readTimeout: 25000,
        };
        
        const response = await CapacitorHttp.get(options);
        
        if (response.status === 304) {
          console.log(`[STORAGE] Feed not modified since ${sinceDate} for ${feedUrl}`);
          return null; // No new articles
        }

        if (response.status === 200) {
          const dataString = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          const { feed, articles } = parseRssXml(dataString, feedUrl, sinceDate);
          
          // Strictly follow the rule: only articles newer than sinceDate
          // No arbitrary 7/14 day limit here to respect user request
          const filteredArticles = articles.filter(a => {
            return !sinceDate || a.pubDate > sinceDate;
          });

          return { feed, articles: filteredArticles };
        } else {
          throw new Error(`Feed fetch failed with status ${response.status}`);
        }
      } catch (e) {
        if (signal?.aborted) return null;
        console.warn(`[STORAGE] Native direct fetch failed for ${feedUrl}:`, e);
        throw e;
      }
    }

    // Web fallback (using CORS proxy to avoid "Failed to fetch" errors in browser preview)
    try {
      let xmlString = await fetchWithProxy(feedUrl, true, sinceDate, signal);
      
      // If failed and URL doesn't end with slash, try adding it (or vice versa)
      if (!xmlString && !signal?.aborted) {
        const alternativeUrl = feedUrl.endsWith('/') ? feedUrl.slice(0, -1) : feedUrl + '/';
        console.log(`[STORAGE] Retrying with alternative URL: ${alternativeUrl}`);
        xmlString = await fetchWithProxy(alternativeUrl, true, sinceDate, signal);
      }

      if (!xmlString) return null; // 304 or empty

      const { feed, articles } = parseRssXml(xmlString, feedUrl, sinceDate);
      
      // Strictly follow the rule: only articles newer than sinceDate
      const filteredArticles = articles.filter(a => {
        return !sinceDate || a.pubDate > sinceDate;
      });

      return { feed, articles: filteredArticles };
    } catch (e) {
      if (signal?.aborted) return null;
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
    let articlesModified = false;
    
    for (const { feed, articles: newArticles } of results) {
      const existingFeedIndex = updatedFeeds.findIndex(f => f.feedUrl === feed.feedUrl);
      const isNewFeed = existingFeedIndex === -1;
      const feedId = isNewFeed ? feed.id : updatedFeeds[existingFeedIndex].id;
      
      let latestFromNew = 0;
      
      for (const a of newArticles) {
        if (a.pubDate > latestFromNew) {
          latestFromNew = a.pubDate;
        }

        if (!existingLinks.has(a.link)) {
          const { content, ...lightArticle } = a;
          if (content) {
            this.saveArticleContent(a.id, content).catch(err => console.error('Failed to save article content', err));
          }
          if (isNewFeed) {
            allNewArticles.push(lightArticle as Article);
          } else {
            allNewArticles.push({
              ...lightArticle,
              feedId
            } as Article);
          }
        } else if (!isNewFeed && a.chaptersUrl) {
          // Update existing articles if they are missing chaptersUrl
          const idx = articles.findIndex(ex => ex.link === a.link);
          if (idx !== -1 && !articles[idx].chaptersUrl) {
            articles[idx] = { ...articles[idx], chaptersUrl: a.chaptersUrl };
            articlesModified = true;
          }
        }
      }

      if (isNewFeed) {
        updatedFeeds.push({
          ...feed,
          lastArticleDate: latestFromNew
        });
      } else {
        const currentLastArticleDate = updatedFeeds[existingFeedIndex].lastArticleDate || 0;
        updatedFeeds[existingFeedIndex] = {
          ...updatedFeeds[existingFeedIndex],
          lastFetched: Date.now(),
          lastArticleDate: Math.max(currentLastArticleDate, latestFromNew),
          title: feed.title,
          imageUrl: feed.imageUrl || updatedFeeds[existingFeedIndex].imageUrl,
          type: feed.type || updatedFeeds[existingFeedIndex].type
        };
      }
    }
    
    if (allNewArticles.length > 0 || articlesModified) {
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
  },

  async getRefreshLogs(): Promise<RefreshLog[]> {
    return (await get<RefreshLog[]>(REFRESH_LOGS_KEY)) || [];
  },

  // --- REDDIT METHODS ---
  
  async fetchJsonWithProxy(url: string, signal?: AbortSignal): Promise<any> {
    const response = await fetchWithProxy(url, false, undefined, signal);
    if (!response || response.trim() === '') return null;
    
    let trimmed = response.trim();
    
    // Some proxies might prepend garbage or wrap in something, try to find the first { or [
    const firstBrace = trimmed.indexOf('{');
    const firstBracket = trimmed.indexOf('[');
    let startIndex = -1;
    
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIndex = firstBrace;
    } else if (firstBracket !== -1) {
      startIndex = firstBracket;
    }
    
    if (startIndex === -1) {
      // If it's HTML, it's likely a proxy error page or a redirect
      throw new Error(`Invalid JSON response (starts with ${trimmed.substring(0, 5)}). The service might be temporarily unavailable via proxy.`);
    }
    
    if (startIndex > 0) {
      trimmed = trimmed.substring(startIndex);
    }
    
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      console.error(`Failed to parse JSON from ${url}:`, e);
      throw new Error(`Malformed JSON response from ${url}`);
    }
  },

  async getSubreddits(): Promise<Subreddit[]> {
    return (await get<Subreddit[]>(SUBREDDITS_KEY)) || [];
  },

  async saveSubreddits(subs: Subreddit[]): Promise<void> {
    await set(SUBREDDITS_KEY, subs);
  },

  async getRedditPosts(): Promise<RedditPost[]> {
    return (await get<RedditPost[]>(REDDIT_POSTS_KEY)) || [];
  },

  async saveRedditPosts(posts: RedditPost[]): Promise<void> {
    await set(REDDIT_POSTS_KEY, posts);
  },

  async addSubreddit(name: string): Promise<Subreddit | null> {
    try {
      // Clean name (remove r/ or https://reddit.com/r/)
      let cleanName = name.trim();
      const lowerName = cleanName.toLowerCase();
      if (lowerName.includes('reddit.com/r/')) {
        cleanName = cleanName.split(/reddit\.com\/r\//i)[1].split('/')[0];
      } else if (lowerName.startsWith('r/')) {
        cleanName = cleanName.substring(2);
      }
      cleanName = cleanName.replace(/[^a-zA-Z0-9_]/g, '');

      if (!cleanName) return null;

      // Fetch about.json to verify and get icon
      const url = `https://www.reddit.com/r/${cleanName}/about.json`;
      const data = await this.fetchJsonWithProxy(url);

      if (!data || data.error || !data.data) {
        console.error('Subreddit not found or error:', data);
        return null;
      }

      const subData = data.data;
      let iconUrl = subData.icon_img || subData.community_icon || undefined;
      if (iconUrl) {
        // Reddit icons often have query params that break them, clean it up
        iconUrl = iconUrl.split('?')[0];
        iconUrl = he.decode(iconUrl);
      }

      const newSub: Subreddit = {
        id: uuidv4(),
        name: subData.display_name || cleanName,
        iconUrl,
        addedAt: Date.now(),
      };

      const subs = await this.getSubreddits();
      if (!subs.find(s => s.name.toLowerCase() === newSub.name.toLowerCase())) {
        subs.push(newSub);
        await this.saveSubreddits(subs);
      }

      return newSub;
    } catch (e) {
      console.error('Failed to add subreddit:', e);
      return null;
    }
  },

  async fetchSubredditPosts(subredditName: string, sinceDate?: number, after?: string, sort: 'new' | 'hot' | 'top' = 'new'): Promise<RedditPost[]> {
    try {
      let url = `https://www.reddit.com/r/${subredditName}/${sort}.json?limit=25`;
      if (after) {
        url += `&after=t3_${after}`;
      }
      const data = await this.fetchJsonWithProxy(url);

      if (!data || !data.data || !data.data.children) return [];

      const posts: RedditPost[] = data.data.children.map((child: any) => {
        const post = child.data;
        const createdUtc = post.created_utc * 1000;

        if (sinceDate && createdUtc <= sinceDate) return null;

        let imageUrl = undefined;
        // Try to get the highest resolution image
        if (post.preview && post.preview.images && post.preview.images.length > 0) {
          const preview = post.preview.images[0];
          // source.url is the original high-res image
          imageUrl = preview.source.url;
        } else if (post.url && (post.url.match(/\.(jpg|jpeg|png|gif|webp)$/) || post.url.includes('imgur.com'))) {
          imageUrl = post.url;
        } else if (post.thumbnail && post.thumbnail.startsWith('http')) {
          imageUrl = post.thumbnail;
        } else {
          console.log('No image found for post:', post.title, post.preview);
        }

        return {
          id: post.id,
          subredditId: post.subreddit_id,
          subredditName: post.subreddit,
          title: he.decode(post.title),
          author: post.author,
          url: post.url,
          permalink: post.permalink,
          score: post.score,
          numComments: post.num_comments,
          createdUtc,
          selftextHtml: post.selftext_html ? he.decode(post.selftext_html) : undefined,
          imageUrl: imageUrl ? he.decode(imageUrl) : undefined,
          isRead: false,
          isFavorite: false,
        };
      }).filter(Boolean) as RedditPost[];

      return posts;
    } catch (e) {
      console.error(`Failed to fetch posts for r/${subredditName}:`, e);
      return [];
    }
  },

  async fetchRedditComments(permalink: string): Promise<any[]> {
    try {
      // permalink already includes leading slash, e.g., /r/soloboardgaming/comments/...
      const url = `https://www.reddit.com${permalink}.json`;
      const data = await this.fetchJsonWithProxy(url);

      // data is an array: [0] is the post, [1] is the comments
      if (!data || !Array.isArray(data) || data.length < 2) return [];

      return data[1].data.children;
    } catch (e) {
      console.error(`Failed to fetch comments for ${permalink}:`, e);
      return [];
    }
  },

  async saveRefreshLogs(logs: RefreshLog[]): Promise<void> {
    await set(REFRESH_LOGS_KEY, logs);
  }
};
