
// src/workers/dataProcessor.worker.ts

self.onmessage = (e) => {
  try {
    const { type, prev, incoming, requestId } = e.data;

    if (type === 'mergeArticles') {
      const merged = Array.isArray(prev) ? [...prev] : [];
      const incomingArr = Array.isArray(incoming) ? incoming : [];
      const existingLinks = new Set<string>();
      
      // First pass: identify existing and deduplicate 'prev' if it has duplicates
      const initialUnique = [];
      for (let i = 0; i < merged.length; i++) {
        if (!existingLinks.has(merged[i].link)) {
          existingLinks.add(merged[i].link);
          initialUnique.push(merged[i]);
        }
      }
      
      // Use clean version of merged
      const finalMerged = initialUnique;
      let hasNew = false;

      for (const newArticle of incomingArr) {
        if (!existingLinks.has(newArticle.link)) {
          hasNew = true;
          existingLinks.add(newArticle.link);

          // Binary Search for correct position in the finalMerged array
          if (finalMerged.length === 0 || newArticle.pubDate >= finalMerged[0].pubDate) {
            finalMerged.unshift(newArticle);
            continue;
          }

          let low = 0;
          let high = finalMerged.length;
          while (low < high) {
            const mid = (low + high) >>> 1;
            if (finalMerged[mid].pubDate > newArticle.pubDate) {
              low = mid + 1;
            } else {
              high = mid;
            }
          }
          finalMerged.splice(low, 0, newArticle);
        }
      }
      self.postMessage({ type: 'mergedArticles', merged: finalMerged, hasNew, requestId });
    } else if (type === 'mergeRedditPosts') {
      const sort = e.data.sort;
      const merged = Array.isArray(prev) ? [...prev] : [];
      const incomingArr = Array.isArray(incoming) ? incoming : [];
      const existingMap = new Map<string, number>();
      
      const initialUnique = [];
      for (let i = 0; i < merged.length; i++) {
        if (!existingMap.has(merged[i].id)) {
          existingMap.set(merged[i].id, initialUnique.length);
          initialUnique.push(merged[i]);
        }
      }
      
      const finalMerged = initialUnique;
      let hasNew = false;

      for (const newPost of incomingArr) {
        const existingIdx = existingMap.get(newPost.id);
        if (existingIdx === undefined) {
          hasNew = true;
          finalMerged.push(newPost);
          existingMap.set(newPost.id, finalMerged.length - 1);
        } else {
          // Update metadata but preserve user state (isRead, isFavorite)
          const existingPost = finalMerged[existingIdx];
          
          // Reset isRead if comments increased
          const wasRead = existingPost.isRead;
          const nowRead = wasRead && newPost.numComments <= existingPost.numComments;
          if (wasRead && !nowRead) hasNew = true; // Signal update

          finalMerged[existingIdx] = {
            ...newPost,
            isRead: nowRead,
            isFavorite: existingPost.isFavorite
          };
        }
      }

      if (hasNew || sort) {
        if (sort === 'new') {
          finalMerged.sort((a, b) => b.createdUtc - a.createdUtc);
        } else {
          finalMerged.sort((a, b) => (b.score || 0) - (a.score || 0));
        }
      }
      self.postMessage({ type: 'mergedRedditPosts', merged: finalMerged, hasNew, requestId });
    } else if (type === 'mergeTelegramMessages') {
      const merged = Array.isArray(prev) ? [...prev] : [];
      const incomingArr = Array.isArray(incoming) ? incoming : [];
      const existingIds = new Set<string>();
      
      const initialUnique = [];
      for (let i = 0; i < merged.length; i++) {
        if (!existingIds.has(merged[i].id)) {
          existingIds.add(merged[i].id);
          initialUnique.push(merged[i]);
        }
      }
      
      const finalMerged = initialUnique;
      let hasNew = false;

      for (const newMessage of incomingArr) {
        if (!existingIds.has(newMessage.id)) {
          hasNew = true;
          existingIds.add(newMessage.id);
          finalMerged.push(newMessage);
        }
      }

      if (hasNew) {
        finalMerged.sort((a, b) => a.date - b.date);
      }
      self.postMessage({ type: 'mergedTelegramMessages', merged: finalMerged, hasNew, requestId });
    }
  } catch (error) {
    self.postMessage({ type: 'error', error: String(error), requestId: e.data.requestId });
  }
};

