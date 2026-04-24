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

  async getCachedContent(articleId: string): Promise<FullArticleContent | null> {
    return await db.articleContents.get(articleId) || null;
  }

  async setCachedContent(articleId: string, content: FullArticleContent): Promise<void> {
    await db.articleContents.put({ id: articleId, ...content });
  }

  enqueue(articleId: string, url: string) {
    if (!this.queue.some(item => item.id === articleId)) {
      this.queue.push({ id: articleId, url });
      this.processQueue();
    }
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
    const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();
    let html = '';
    const safeUrl = getSafeUrl(url, url);

    if (isNative) {
      let currentUrl = safeUrl;
      let maxRedirects = 3;
      
      while (maxRedirects > 0) {
        const response = await CapacitorHttp.get({ url: currentUrl });
        if (response.status === 200) {
          html = response.data;
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
    } else {
      const res = await fetchWithProxy(safeUrl, false, undefined, undefined, undefined, undefined, true);
      html = res.data;
    }

    if (html) {
      // Parse HTML
      const doc = new DOMParser().parseFromString(html, 'text/html');
      
      // Add base tag to help resolve relative URLs during parsing
      const base = doc.createElement('base');
      base.href = url;
      doc.head.appendChild(base);

      const reader = new Readability(doc);
      let articleData = reader.parse();

      // Check for "read more" link and fetch full content if detected
      if (articleData && articleData.content) {
        const findFullArticleLink = (doc: Document): string | null => {
          const links = Array.from(doc.querySelectorAll('a'));
          const patterns = [/leggi tutto/i, /read more/i, /continua a leggere/i, /full article/i];
          // Look at the last few links in the document
          for (let i = links.length - 1; i >= Math.max(0, links.length - 5); i--) {
            const link = links[i];
            if (patterns.some(p => p.test(link.textContent || ''))) {
              return link.getAttribute('href');
            }
          }
          return null;
        };

        const fullArticleUrl = findFullArticleLink(doc);
        if (fullArticleUrl) {
          try {
            const resolvedUrl = new URL(fullArticleUrl, url).toString();
            const fullResData = isNative ? (await CapacitorHttp.get({ url: resolvedUrl })).data : (await fetchWithProxy(resolvedUrl, false, undefined, undefined, undefined, undefined, true)).data;
            const fullDoc = new DOMParser().parseFromString(fullResData, 'text/html');
            const fullReader = new Readability(fullDoc);
            const fullArticleData = fullReader.parse();
            if (fullArticleData && fullArticleData.content) {
              articleData = fullArticleData;
            }
          } catch (e) {
            console.warn(`[PREFETCH] Failed to fetch full article link: ${fullArticleUrl}`, e);
          }
        }
      }

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

        // Prefetch images found in the content
        const imgTags = doc.querySelectorAll('img');
        const imageUrls = Array.from(imgTags)
          .map(img => img.getAttribute('src'))
          .filter((src): src is string => !!src && src.startsWith('http'));

        // Limit to first 5 images to avoid excessive bandwidth
        for (const imgUrl of imageUrls.slice(0, 5)) {
          try {
            // On native, this will download to filesystem. On web, it will trigger browser cache.
            const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();
            if (isNative) {
              const { imagePersistence } = await import('./imagePersistence');
              await imagePersistence.getLocalUrl(imgUrl);
            } else {
              // Just fetch to trigger Service Worker / Browser Cache
              fetch(imgUrl, { mode: 'no-cors' }).catch(() => {});
            }
          } catch (e) {
            // Ignore image prefetch errors
          }
        }
      }
    }
  }
}

export const contentFetcher = new ContentFetcherQueue();
