
// src/workers/dataProcessor.worker.ts

self.onmessage = (e) => {
  try {
    const { type, prev, incoming, requestId } = e.data;

    if (type === 'mergeArticles') {
      const merged = Array.isArray(prev) ? [...prev] : [];
      const incomingArr = Array.isArray(incoming) ? incoming : [];
      const existingLinks = new Set<string>();
      for (let i = 0; i < merged.length; i++) {
        existingLinks.add(merged[i].link);
      }
      let hasNew = false;

      for (const newArticle of incomingArr) {
        if (!existingLinks.has(newArticle.link)) {
          hasNew = true;
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
      self.postMessage({ type: 'mergedArticles', merged, hasNew, requestId });
    } else if (type === 'mergeRedditPosts') {
      const { sort } = e.data;
      const merged = Array.isArray(prev) ? [...prev] : [];
      const incomingArr = Array.isArray(incoming) ? incoming : [];
      const existingMap = new Map<string, number>();
      for (let i = 0; i < merged.length; i++) {
        existingMap.set(merged[i].id, i);
      }
      let hasNew = false;

      for (const newPost of incomingArr) {
        const existingIdx = existingMap.get(newPost.id);
        if (existingIdx === undefined) {
          hasNew = true;
          merged.push(newPost);
          existingMap.set(newPost.id, merged.length - 1);
        } else {
          // Update metadata but preserve user state (isRead, isFavorite)
          const existingPost = merged[existingIdx];
          merged[existingIdx] = {
            ...newPost,
            isRead: existingPost.isRead,
            isFavorite: existingPost.isFavorite
          };
        }
      }

      if (hasNew || sort) {
        if (sort === 'new') {
          merged.sort((a, b) => b.createdUtc - a.createdUtc);
        } else {
          merged.sort((a, b) => (b.score || 0) - (a.score || 0));
        }
      }
      self.postMessage({ type: 'mergedRedditPosts', merged, hasNew, requestId });
    } else if (type === 'mergeTelegramMessages') {
      const merged = Array.isArray(prev) ? [...prev] : [];
      const incomingArr = Array.isArray(incoming) ? incoming : [];
      const existingIds = new Set<string>();
      for (let i = 0; i < merged.length; i++) {
        existingIds.add(merged[i].id);
      }
      let hasNew = false;

      for (const newMessage of incomingArr) {
        if (!existingIds.has(newMessage.id)) {
          hasNew = true;
          existingIds.add(newMessage.id);
          merged.push(newMessage);
        }
      }

      if (hasNew) {
        merged.sort((a, b) => a.date - b.date);
      }
      self.postMessage({ type: 'mergedTelegramMessages', merged, hasNew, requestId });
    }
  } catch (error) {
    self.postMessage({ type: 'error', error: String(error), requestId: e.data.requestId });
  }
};

