import { CapacitorHttp } from '@capacitor/core';
import { fetchWithProxy } from './proxy';
import { getSafeUrl } from '../lib/utils';
import { Readability } from '@mozilla/readability';
import { FullArticleContent } from '../types';
import { db } from '../services/db';

class ContentFetcherQueue {
  private queue: { id: string, url: string }[] = [];
  private activeCount = 0;
  private maxConcurrent = 2; // Reduced concurrency to avoid rate limits
  private memoryCache = new Map<string, FullArticleContent>();

  async getCachedContent(articleId: string): Promise<FullArticleContent | null> {
    if (this.memoryCache.has(articleId)) {
      return this.memoryCache.get(articleId)!;
    }
    const fromDb = await db.articleContents.get(articleId) || null;
    if (fromDb) {
      this.memoryCache.set(articleId, fromDb);
    }
    return fromDb;
  }

  getCachedContentSync(articleId: string): FullArticleContent | null {
    return this.memoryCache.get(articleId) || null;
  }

  async setCachedContent(articleId: string, content: FullArticleContent): Promise<void> {
    this.memoryCache.set(articleId, content);
    await db.articleContents.put({ id: articleId, ...content });
  }

  enqueue(articleId: string, url: string) {
    // Prefetch disabled
  }

  private async processQueue() {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) return;

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount++;

    try {
      const cached = await this.getCachedContent(item.id);
      if (!cached) {
        // Add a small delay between prefetches to be polite to servers and proxies
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.fetchWithRetry(item.id, item.url);
      }
    } catch (error) {
      // Use warn for prefetch issues as they are non-critical optimizations
      console.warn(`[PREFETCH] Failed to prefetch ${item.url}. It will be fetched on demand.`, error);
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }

  private async fetchWithRetry(articleId: string, url: string, retries = 2) {
    try {
      await this.fetchAndCache(articleId, url);
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.fetchWithRetry(articleId, url, retries - 1);
      } else {
        throw error;
      }
    }
  }

  private async fetchAndCache(articleId: string, url: string) {
    const isNativePlatform = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();
    const isWeb = typeof window !== 'undefined' && (window as any).Capacitor?.getPlatform() === 'web';
    
    const isNativeHttp = !isWeb && isNativePlatform && (() => {
      try {
        return (window as any).Capacitor?.isPluginAvailable?.('CapacitorHttp');
      } catch (e) {
        return false;
      }
    })();
    
    let html = '';
    const safeUrl = getSafeUrl(url, url);

    if (isNativeHttp) {
      try {
        let currentUrl = safeUrl;
        let maxRedirects = 3;
        
        while (maxRedirects > 0) {
          const response = await CapacitorHttp.get({ 
            url: currentUrl,
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            }
          });
          if (response.status === 200) {
            html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            break;
          } else if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers['Location'] || response.headers['location'];
            if (location) {
              currentUrl = getSafeUrl(location, location);
              maxRedirects--;
            } else {
              throw new Error(`Redirect without location: ${response.status}`);
            }
          } else {
            throw new Error(`Failed to fetch article: ${response.status}`);
          }
        }
      } catch (e: any) {
        // Fallback to proxy natively
        const res = await fetchWithProxy(safeUrl, false, undefined, undefined, undefined, undefined, true);
        html = res.data;
      }
    } else {
      const res = await fetchWithProxy(safeUrl, false, undefined, undefined, undefined, undefined, true);
      html = res.data;
    }

    if (html) {
      // Transform <media:thumbnail url="..."> and <media:content url="..."> to <img src="...">
      // These are non-standard tags that Readability might strip
      html = html.replace(/<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*\/?>/gi, '<img src="$1" />');
      html = html.replace(/<media:content[^>]+url=["']([^"']+)["'][^>]*\/?>/gi, '<img src="$1" />');

      // Parse HTML
      const doc = new DOMParser().parseFromString(html, 'text/html');
      
      // Add base tag to help resolve relative URLs during parsing
      const base = doc.createElement('base');
      base.href = url;
      doc.head.appendChild(base);

      const reader = new Readability(doc);
      let articleData = reader.parse();

      if (articleData && articleData.content && articleData.content.length > 200) {
        const fullContent: FullArticleContent = {
          title: articleData.title || '',
          content: articleData.content || '',
          textContent: articleData.textContent || '',
          length: articleData.length || 0,
          excerpt: articleData.excerpt || '',
          byline: articleData.byline || '',
          dir: articleData.dir || '',
          siteName: articleData.siteName || '',
          lang: articleData.lang || '',
        };
        await this.setCachedContent(articleId, fullContent);
      }
    }
  }
}

export const contentFetcher = new ContentFetcherQueue();
