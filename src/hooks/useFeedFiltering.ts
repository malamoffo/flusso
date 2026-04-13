import { useMemo } from 'react';
import { Article } from '../types';

interface UseFeedFilteringProps {
  articles: Article[];
  inboxTypeFilter: 'all' | 'article' | 'podcast';
  inboxUnreadOnly: boolean;
  savedTypeFilter: 'all' | 'article' | 'podcast';
  savedUnreadOnly: boolean;
  deferredSearchQuery: string;
  sourceFilter: string;
  timeFilter: string;
  isSearchOpen: boolean;
}

export const useFeedFiltering = ({
  articles,
  inboxTypeFilter,
  inboxUnreadOnly,
  savedTypeFilter,
  savedUnreadOnly,
  deferredSearchQuery,
  sourceFilter,
  timeFilter,
  isSearchOpen
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

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      
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
      if (inboxUnreadOnly && article.isRead) matchesInbox = false;
      if (inboxTypeFilter !== 'all' && article.type !== inboxTypeFilter) matchesInbox = false;
      if (matchesInbox) inbox.push(article);

      // Saved specific filtering
      if (article.isFavorite || article.isQueued) {
        let matchesSaved = true;
        if (savedUnreadOnly && article.isRead) matchesSaved = false;
        if (savedTypeFilter !== 'all' && article.type !== savedTypeFilter) matchesSaved = false;
        if (matchesSaved) saved.push(article);
      }
    }

    return { inboxArticles: inbox, savedArticles: saved };
  }, [articles, inboxTypeFilter, inboxUnreadOnly, savedTypeFilter, savedUnreadOnly, deferredSearchQuery, sourceFilter, timeFilter, isSearchOpen]);
};
