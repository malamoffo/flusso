import { Feed, Article } from '../types';
import { storage } from './storage';

export const rssService = {
  async refreshFeeds(
    feedsToRefresh: Feed[],
    worker: Worker,
    onProgress: (progress: { current: number; total: number; status?: string; bytesDownloaded?: number }) => void,
    onUpdateFeeds: (updater: (prev: Feed[]) => Feed[]) => void,
    onUpdateArticles: (updater: (prev: Article[]) => Article[]) => void,
    onSetIsLoading: (isLoading: boolean) => void
  ): Promise<{ finalArticles: Article[], finalFeeds: Feed[] }> {
    onSetIsLoading(true);
    let latestFeeds = [...feedsToRefresh];
    let totalBytesDownloaded = 0;
    
    // We'll collect new articles returned by the merge step
    let allFinalArticles: Article[] = [];
    
    try {
      if (feedsToRefresh.length === 0) {
        onSetIsLoading(false);
        return { finalArticles: [], finalFeeds: latestFeeds };
      }
      
      onProgress({ current: 0, total: feedsToRefresh.length, bytesDownloaded: 0 });
      let completed = 0;
      
      const queue = [...feedsToRefresh];
      let queueIndex = 0;
      const FEED_TIMEOUT = 22500;
      const CONCURRENCY = Math.min(6, queue.length);
      
      let mergeChain = Promise.resolve();
      
      const workers = Array(CONCURRENCY).fill(null).map(async () => {
        while (true) {
          const feed = queue[queueIndex++];
          if (!feed) break;
          
          try {
            const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
            const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
            const hardSinceDate = Date.now() - (feed.type === 'podcast' ? ONE_WEEK : THREE_DAYS);
            const sinceDate = Math.max(feed.lastArticleDate || 0, hardSinceDate);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FEED_TIMEOUT);
            
            try {
              const data = await storage.fetchFeedData(feed.feedUrl, sinceDate, controller.signal);
              if (data) {
                if (data.bytesDownloaded !== undefined) {
                  totalBytesDownloaded += data.bytesDownloaded;
                  onProgress({ current: completed, total: feedsToRefresh.length, bytesDownloaded: totalBytesDownloaded });
                }
                const articlesWithCorrectId = (data.articles || []).map(a => ({ 
                  ...a, 
                  feedId: feed.id,
                  type: feed.type || 'article'
                })) as Article[];
                
                let hasNew = false;
                if (articlesWithCorrectId.length > 0) {
                  await (mergeChain = mergeChain.then(async () => {
                    // Update state with just the new ones for smooth UI updates
                    onUpdateArticles(prev => {
                       const merged = [...prev];
                       const uniqueLinks = new Set(merged.map(a => a.link));
                       let stateChanged = false;
                       for (const a of articlesWithCorrectId) {
                         if (!uniqueLinks.has(a.link)) {
                           merged.unshift(a);
                           uniqueLinks.add(a.link);
                           stateChanged = true;
                           hasNew = true;
                         }
                       }
                       // keep UI tidy
                       if (stateChanged) {
                         merged.sort((a,b) => b.pubDate - a.pubDate);
                       }
                       return stateChanged ? merged : prev;
                    });
                    
                    // Push to the final collection that will be saved to db
                    if (hasNew) {
                       allFinalArticles.push(...articlesWithCorrectId);
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
                      type: existingFeed.type,
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
            onProgress({ current: completed, total: feedsToRefresh.length, bytesDownloaded: totalBytesDownloaded });
          }
        }
      });
      
      await Promise.all(workers);
      await mergeChain;
      return { finalArticles: allFinalArticles, finalFeeds: latestFeeds };
    } finally {
      onSetIsLoading(false);
      onProgress({ current: feedsToRefresh.length, total: feedsToRefresh.length, status: "Finalizing..." });
    }
  }
};
