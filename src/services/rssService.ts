import { Feed, Article } from '../types';
import { storage } from './storage';

export const rssService = {
  async refreshFeeds(
    feedsToRefresh: Feed[],
    worker: Worker,
    currentArticlesMemory: Article[],
    onProgress: (progress: { current: number; total: number; status?: string; bytesDownloaded?: number }) => void,
    onUpdateFeeds: (updater: (prev: Feed[]) => Feed[]) => void,
    onUpdateArticles: (updater: (prev: Article[]) => Article[]) => void,
    onSetIsLoading: (isLoading: boolean) => void,
    signal?: AbortSignal
  ): Promise<{ finalArticles: Article[], finalFeeds: Feed[], failedFeeds: { feedUrl: string; error: string }[] }> {
    onSetIsLoading(true);
    let latestFeeds = [...feedsToRefresh];
    let totalBytesDownloaded = 0;
    
    // We'll collect new articles returned by the merge step
    let allFinalArticles: Article[] = [];
    const failedFeeds: { feedUrl: string; error: string }[] = [];
    
    // Copy the memory links to track what's new synchronously
    const knownLinks = new Set(currentArticlesMemory.map(a => a.link));
    
    let completed = 0;
    try {
      if (feedsToRefresh.length === 0) {
        onSetIsLoading(false);
        return { finalArticles: [], finalFeeds: latestFeeds, failedFeeds };
      }
      
      onProgress({ current: 0, total: feedsToRefresh.length, bytesDownloaded: 0 });
      
      const queue = [...feedsToRefresh];
      const FEED_TIMEOUT = 60000;
      const CONCURRENCY = Math.min(6, queue.length);
      
      let mergeChain = Promise.resolve();
      
      const workers = Array(CONCURRENCY).fill(null).map(async () => {
        while (true) {
          if (signal?.aborted) break;
          const feed = queue.shift();
          if (!feed) break;
          
          let handleSignalAbort: (() => void) | undefined;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), FEED_TIMEOUT);
          
          try {
            const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
            const hardSinceDate = Date.now() - THREE_DAYS;
            const sinceDate = Math.max(feed.lastArticleDate || 0, hardSinceDate);
            
            handleSignalAbort = () => {
              controller.abort();
            };
            
            if (signal) {
              if (signal.aborted) {
                controller.abort();
              } else {
                signal.addEventListener('abort', handleSignalAbort);
              }
            }
            
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
                const genuinelyNewArticles: Article[] = [];
                for (const a of articlesWithCorrectId) {
                  if (!knownLinks.has(a.link)) {
                    hasNew = true;
                    genuinelyNewArticles.push(a);
                    knownLinks.add(a.link);
                  }
                }
                
                if (hasNew) {
                  await (mergeChain = mergeChain.then(async () => {
                    // Push to the final collection that will be saved to db
                    allFinalArticles.push(...genuinelyNewArticles);
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
              if (signal && handleSignalAbort) {
                signal.removeEventListener('abort', handleSignalAbort);
              }
              clearTimeout(timeoutId);
            }
          } catch (e: any) {
            if (signal?.aborted || e.name === 'AbortError' || e.message === 'Aborted' || e.message?.toLowerCase().includes('abort')) {
              break;
            }
            failedFeeds.push({ feedUrl: feed.feedUrl, error: e.message || 'Unknown error' });
            
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
      
      if (allFinalArticles.length > 0) {
        onUpdateArticles(prev => {
          const merged = [...prev];
          const uniqueLinks = new Set(merged.map(x => x.link));
          let stateChanged = false;
          for (const a of allFinalArticles) {
            if (!uniqueLinks.has(a.link)) {
              merged.push(a);
              uniqueLinks.add(a.link);
              stateChanged = true;
            }
          }
          if (stateChanged) {
            merged.sort((a, b) => {
              const timeA = typeof a.pubDate === 'string' ? new Date(a.pubDate).getTime() : a.pubDate;
              const timeB = typeof b.pubDate === 'string' ? new Date(b.pubDate).getTime() : b.pubDate;
              const valA = isNaN(timeA) ? 0 : timeA;
              const valB = isNaN(timeB) ? 0 : timeB;
              if (valB !== valA) return valB - valA;
              return b.id.localeCompare(a.id);
            });
          }
          return stateChanged ? merged : prev;
        });
      }
      
      return { finalArticles: allFinalArticles, finalFeeds: latestFeeds, failedFeeds };
    } finally {
      onSetIsLoading(false);
      onProgress({ 
        current: completed, 
        total: feedsToRefresh.length, 
        status: signal?.aborted ? "Interrotto" : "Finalizing...",
        bytesDownloaded: totalBytesDownloaded 
      });
    }
  }
};
