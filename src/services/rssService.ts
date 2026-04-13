import { Feed, Article } from '../types';
import { storage } from './storage';
import { v4 as uuidv4 } from 'uuid';

export const rssService = {
  async refreshFeeds(
    feedsToRefresh: Feed[],
    currentArticles: Article[],
    worker: Worker,
    onProgress: (progress: { current: number; total: number; status?: string }) => void,
    onUpdateFeeds: (updater: (prev: Feed[]) => Feed[]) => void,
    onUpdateArticles: (updater: (prev: Article[]) => Article[]) => void,
    onSetIsLoading: (isLoading: boolean) => void
  ): Promise<{ finalArticles: Article[], finalFeeds: Feed[] }> {
    onSetIsLoading(true);
    let latestArticles = currentArticles;
    let latestFeeds = [...feedsToRefresh];
    
    try {
      if (feedsToRefresh.length === 0) {
        onSetIsLoading(false);
        return { finalArticles: latestArticles, finalFeeds: latestFeeds };
      }
      
      onProgress({ current: 0, total: feedsToRefresh.length });
      let completed = 0;
      
      const latestArticleDateByFeedId = new Map<string, number>();
      for (const article of currentArticles) {
        const currentLatest = latestArticleDateByFeedId.get(article.feedId) || 0;
        if (article.pubDate > currentLatest) {
          latestArticleDateByFeedId.set(article.feedId, article.pubDate);
        }
      }
      
      const queue = [...feedsToRefresh];
      let queueIndex = 0;
      const FEED_TIMEOUT = 12000;
      const CONCURRENCY = Math.min(6, queue.length);
      
      let mergeChain = Promise.resolve();
      
      const workers = Array(CONCURRENCY).fill(null).map(async () => {
        while (true) {
          const feed = queue[queueIndex++];
          if (!feed) break;
          
          try {
            const latestArticleDate = latestArticleDateByFeedId.get(feed.id);
            const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
            const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
            const hardSinceDate = Date.now() - (feed.type === 'podcast' ? ONE_WEEK : THREE_DAYS);
            const sinceDate = Math.max(latestArticleDate || feed.lastArticleDate || 0, hardSinceDate);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FEED_TIMEOUT);
            
            try {
              const data = await storage.fetchFeedData(feed.feedUrl, sinceDate, controller.signal);
              if (data) {
                const articlesWithCorrectId = (data.articles || []).map(a => ({ 
                  ...a, 
                  feedId: feed.id,
                  type: feed.type === 'podcast' ? 'podcast' : a.type
                }));
                
                if (articlesWithCorrectId.length > 0) {
                  await (mergeChain = mergeChain.then(async () => {
                    const { merged, hasNew } = await new Promise<{ merged: Article[], hasNew: boolean }>((resolve, reject) => {
                      const requestId = uuidv4();
                      const timeout = setTimeout(() => {
                        worker.removeEventListener('message', handler);
                        reject(new Error('Worker timeout'));
                      }, 10000);

                      const handler = (e: MessageEvent) => {
                        if (e.data.type === 'mergedArticles' && e.data.requestId === requestId) {
                          clearTimeout(timeout);
                          worker.removeEventListener('message', handler);
                          resolve(e.data);
                        }
                      };
                      worker.addEventListener('message', handler);
                      worker.postMessage({ 
                        type: 'mergeArticles', 
                        prev: latestArticles, 
                        incoming: articlesWithCorrectId, 
                        requestId 
                      });
                    }).catch(err => {
                      console.error('Merge failed:', err);
                      return { merged: latestArticles, hasNew: false };
                    });
                    
                    if (hasNew) {
                      latestArticles = merged;
                      onUpdateArticles(() => merged);
                    }
                  }));
                }
                
                const updateFeedFn = (prev: Feed[]) => {
                  const next = [...prev];
                  const idx = next.findIndex(f => f.id === feed.id);
                  if (idx !== -1) {
                    const existingFeed = next[idx];
                    next[idx] = {
                      ...existingFeed,
                      ...data.feed,
                      title: existingFeed.title,
                      id: feed.id,
                      lastFetched: Date.now(),
                      lastArticleDate: articlesWithCorrectId.length > 0 ? Math.max(...articlesWithCorrectId.map(a => a.pubDate)) : feed.lastArticleDate,
                      lastRefreshStatus: 'success'
                    };
                  }
                  latestFeeds = next;
                  return next;
                };
                onUpdateFeeds(updateFeedFn);
              }
            } finally {
              clearTimeout(timeoutId);
            }
          } catch (e: any) {
            const updateFeedFn = (prev: Feed[]) => {
              const next = [...prev];
              const idx = next.findIndex(f => f.id === feed.id);
              if (idx !== -1) {
                next[idx] = { ...next[idx], lastRefreshStatus: 'error' };
              }
              latestFeeds = next;
              return next;
            };
            onUpdateFeeds(updateFeedFn);
          } finally {
            completed++;
            onProgress({ current: completed, total: feedsToRefresh.length });
          }
        }
      });
      
      await Promise.all(workers);
      await mergeChain;
      return { finalArticles: latestArticles, finalFeeds: latestFeeds };
    } finally {
      onSetIsLoading(false);
      onProgress({ current: feedsToRefresh.length, total: feedsToRefresh.length, status: "Finalizing..." });
    }
  }
};
