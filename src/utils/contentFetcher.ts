import { CapacitorHttp } from '@capacitor/core';
import { fetchWithProxy } from './proxy';
import { Readability } from '@mozilla/readability';
import { get, set } from 'idb-keyval';
import { FullArticleContent } from '../types';

const CONTENT_PREFIX = 'article_content_';

class ContentFetcherQueue {
  private queue: { id: string, url: string }[] = [];
  private activeCount = 0;
  private maxConcurrent = 2; // Reduced concurrency to avoid rate limits

  async getCachedContent(articleId: string): Promise<FullArticleContent | null> {
    return await get<FullArticleContent>(`${CONTENT_PREFIX}${articleId}`) || null;
  }

  async setCachedContent(articleId: string, content: FullArticleContent): Promise<void> {
    await set(`${CONTENT_PREFIX}${articleId}`, content);
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
      console.error(`[PREFETCH] Failed to prefetch ${item.url}:`, error);
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
        console.log(`[PREFETCH] Retrying ${url}... (${retries} left)`);
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

    if (isNative) {
      const response = await CapacitorHttp.get({ url });
      if (response.status === 200) {
        html = response.data;
      } else {
        throw new Error(`Failed to fetch article: ${response.status}`);
      }
    } else {
      html = await fetchWithProxy(url, false);
    }

    if (html) {
      // Parse HTML
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const reader = new Readability(doc);
      const articleData = reader.parse();

      if (articleData) {
        const fullContent: FullArticleContent = {
          title: articleData.title,
          content: articleData.content,
          textContent: articleData.textContent,
          length: articleData.length,
          excerpt: articleData.excerpt,
          byline: articleData.byline,
          dir: articleData.dir,
          siteName: articleData.siteName,
          lang: articleData.lang,
        };
        await this.setCachedContent(articleId, fullContent);
        console.log(`[PREFETCH] Successfully cached ${url}`);
      }
    }
  }
}

export const contentFetcher = new ContentFetcherQueue();
