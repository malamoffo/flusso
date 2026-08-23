import { useMemo } from 'react';
import { Article } from '../types';

interface UseFeedFilteringProps {
  articles: Article[];
  inboxUnreadOnly: boolean;
  savedUnreadOnly: boolean;
  deferredSearchQuery: string;
  sourceFilter: string;
  timeFilter: string;
  isSearchOpen: boolean;
  temporarilyVisibleUnreadIds?: Set<string>;
}

export const useFeedFiltering = ({
  articles,
  inboxUnreadOnly,
  savedUnreadOnly,
  deferredSearchQuery,
  sourceFilter,
  timeFilter,
  isSearchOpen,
  temporarilyVisibleUnreadIds
}: UseFeedFilteringProps) => {
  return useMemo(() => {
    const inbox: Article[] = [];
    const saved: Article[] = [];
    
    const now = Date.now();
    const query = deferredSearchQuery.toLowerCase();
    const DAY_MS = 1000 * 60 * 60 * 24;
    const timeThresholds: Record<string, number> = {
      today: now - DAY_MS,
      week: now - (DAY_MS * 7),
      month: now - (DAY_MS * 30),
    };

    const seenInboxIds = new Set<string>();
    const seenSavedIds = new Set<string>();

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      if (!article || !article.id) continue;
      
      // Common filters (Search & Metadata)
      if (isSearchOpen) {
        if (sourceFilter !== 'all' && article.feedId !== sourceFilter) continue;
        if (timeFilter !== 'all') {
          const threshold = timeThresholds[timeFilter];
          // Robustly handle string or number pubDate
          const pubTime = typeof article.pubDate === 'string' ? new Date(article.pubDate).getTime() : article.pubDate;
          if (threshold && pubTime < threshold) continue;
        }
      }
      
      if (query) {
        const matchesQuery = article.title.toLowerCase().includes(query) || 
                            (article.contentSnippet?.toLowerCase().includes(query) ?? false) ||
                            (article.content?.toLowerCase().includes(query) ?? false);
        if (!matchesQuery) continue;
      }

      // Inbox specific filtering
      let matchesInbox = true;
      if (inboxUnreadOnly && article.isRead) {
        // Only allow if it was recently marked as read in this "session"
        if (!temporarilyVisibleUnreadIds?.has(article.id)) {
          matchesInbox = false;
        }
      }
      if (matchesInbox && !seenInboxIds.has(article.id)) {
        seenInboxIds.add(article.id);
        inbox.push(article);
      }

      // Saved specific filtering
      if (article.isFavorite) {
        let matchesSaved = true;
        if (savedUnreadOnly && article.isRead) matchesSaved = false;
        if (matchesSaved && !seenSavedIds.has(article.id)) {
          seenSavedIds.add(article.id);
          saved.push(article);
        }
      }
    }

    return { inboxArticles: inbox, savedArticles: saved };
  }, [articles, inboxUnreadOnly, savedUnreadOnly, deferredSearchQuery, sourceFilter, timeFilter, isSearchOpen, temporarilyVisibleUnreadIds]);
};
