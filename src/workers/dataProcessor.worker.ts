
// src/workers/dataProcessor.worker.ts
import DOMPurify from 'dompurify';

self.onmessage = (e) => {
  const { type, prev, incoming } = e.data;

  if (type === 'mergeArticles') {
    const merged = [...prev];
    const existingLinks = new Set<string>();
    for (let i = 0; i < merged.length; i++) {
      existingLinks.add(merged[i].link);
    }
    let hasNew = false;

    for (const newArticle of incoming) {
      if (!existingLinks.has(newArticle.link)) {
        hasNew = true;
        
        // Sanitize title in the worker
        newArticle.title = DOMPurify.sanitize(newArticle.title, { FORBID_ATTR: ['id', 'name'] });
        
        existingLinks.add(newArticle.link);

        // Binary Search for correct position
        if (merged.length === 0 || newArticle.pubDate >= merged[0].pubDate) {
          merged.unshift(newArticle);
          continue;
        }

        let low = 0;
        let high = merged.length;
        while (low < high) {
          const mid = (low + high) >>> 1;
          if (merged[mid].pubDate > newArticle.pubDate) {
            low = mid + 1;
          } else {
            high = mid;
          }
        }
        merged.splice(low, 0, newArticle);
      }
    }
    self.postMessage({ type: 'mergedArticles', merged, hasNew });
  } else if (type === 'mergeRedditPosts') {
    const { sort } = e.data;
    const merged = [...prev];
    const existingIds = new Set<string>();
    for (let i = 0; i < merged.length; i++) {
      existingIds.add(merged[i].id);
    }
    let hasNew = false;

    for (const newPost of incoming) {
      if (!existingIds.has(newPost.id)) {
        hasNew = true;
        existingIds.add(newPost.id);
        merged.push(newPost);
      }
    }

    if (hasNew || sort) {
      if (sort === 'new') {
        merged.sort((a, b) => b.createdUtc - a.createdUtc);
      } else {
        merged.sort((a, b) => (b.score || 0) - (a.score || 0));
      }
    }
    self.postMessage({ type: 'mergedRedditPosts', merged, hasNew });
  }
};
