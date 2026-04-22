import { db } from '../db';
import { Feed, Article, RefreshLog } from '../../types';
import { CapacitorHttp } from '@capacitor/core';
import { fetchWithProxy } from '../../utils/proxy';
import { parseRssXml, escapeXml } from '../rssParser';

export const rssStorage = {
  async getFeeds(): Promise<Feed[]> {
    return await db.feeds.toArray();
  },

  async saveFeeds(feeds: Feed[]): Promise<void> {
    await db.feeds.bulkPut(feeds);
  },

  async getArticles(offset = 0, limit = 0): Promise<Article[]> {
    let query = db.articles.orderBy('pubDate').reverse();
    if (limit > 0) {
      return await query.offset(offset).limit(limit).toArray();
    }
    return await query.toArray();
  },

  async getUnreadCount(): Promise<number> {
    return await db.articles.filter(a => !a.isRead).count();
  },

  async getSavedCount(): Promise<number> {
    return await db.articles.filter(a => !!a.isFavorite || !!a.isQueued).count();
  },

  async getSavedUnreadCount(): Promise<number> {
    return await db.articles.filter(a => (!!a.isFavorite || !!a.isQueued) && !a.isRead).count();
  },

  // Restituisce preferiti E in coda (usato da loadData per precaricare in articles[])
  async getFavorites(): Promise<Article[]> {
    return await db.articles.filter(a => !!a.isFavorite || !!a.isQueued).toArray();
  },

  // Restituisce SOLO i podcast con isFavorite=true — usato per favorites.json in Android Auto
  async getFavoritePodcasts(): Promise<Article[]> {
    const podcasts = await db.articles
      .where('type')
      .equals('podcast')
      .toArray();
    return podcasts.filter(a => !!a.isFavorite);
  },

  async cleanUpOldArticles(articleRetentionDays: number, podcastRetentionDays: number): Promise<void> {
    const ARTICLE_LIMIT = articleRetentionDays * 24 * 60 * 60 * 1000;
    const PODCAST_LIMIT = podcastRetentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const oldArticles = await db.articles
      .filter(a => {
        if (a.isFavorite || a.isQueued) return false;
        const limitTime = a.type === 'podcast' ? PODCAST_LIMIT : ARTICLE_LIMIT;
        const referenceTime = (a.isRead && a.readAt) ? a.readAt : a.pubDate;
        return (now - referenceTime) > limitTime;
      })
      .toArray();

    const idsToDelete = oldArticles.map(a => a.id);
    if (idsToDelete.length > 0) {
      await db.articles.bulkDelete(idsToDelete);
      await db.articleContents.bulkDelete(idsToDelete);
    }
  },

  async getArticleContent(id: string): Promise<string | null> {
    const fullContent = await db.articleContents.get(id);
    return fullContent?.content || null;
  },

  async saveArticleContent(id: string, content: string): Promise<void> {
    const existing = await db.articleContents.get(id);
    if (existing) {
      await db.articleContents.put({ ...existing, content });
    } else {
      await db.articleContents.put({ 
        id,
        title: '', 
        content, 
        textContent: '', 
        length: content.length, 
        excerpt: '', 
        byline: '', 
        dir: '', 
        siteName: '', 
        lang: '' 
      });
    }
  },

  async cleanupOrphanedContent(validArticles: Article[]): Promise<void> {
    const validIds = new Set(validArticles.map(a => a.id));
    const allContentIds = await db.articleContents.toCollection().primaryKeys();
    const idsToDelete = allContentIds.filter(id => !validIds.has(id));
    if (idsToDelete.length > 0) {
      await db.articleContents.bulkDelete(idsToDelete);
    }
  },

  async saveArticles(articles: Article[]): Promise<void> {
    await db.articles.bulkPut(articles);
  },

  async deleteArticle(id: string): Promise<void> {
    await db.articles.delete(id);
    await db.articleContents.delete(id);
  },

  async fetchFeedData(feedUrl: string, sinceDate?: number, signal?: AbortSignal): Promise<{ feed: Feed; articles: Article[]; bytesDownloaded: number } | null> {
    try {
      const feeds = await this.getFeeds();
      const feed = feeds.find(f => f.feedUrl === feedUrl);
      
      let response;
      try {
        response = await fetchWithProxy(feedUrl, true, sinceDate, signal, feed?.etag, feed?.lastModified);
      } catch (e) {
        if (signal?.aborted) throw e;
        const alternativeUrl = feedUrl.endsWith('/') ? feedUrl.slice(0, -1) : feedUrl + '/';
        response = await fetchWithProxy(alternativeUrl, true, sinceDate, signal, feed?.etag, feed?.lastModified);
      }

      if (response.data === '') {
        return {
          feed: { 
            ...feed, 
            etag: response.etag || feed?.etag, 
            lastModified: response.lastModified || feed?.lastModified 
          } as Feed,
          articles: [],
          bytesDownloaded: 0
        };
      }

      if (!response.data) return null;
      
      const bytesDownloaded = new Blob([response.data]).size;

      const { feed: parsedFeed, articles } = parseRssXml(response.data, feedUrl, sinceDate);
      
      const filteredArticles = articles.filter(a => {
        const limit = 7 * 24 * 60 * 60 * 1000;
        return (Date.now() - a.pubDate) <= limit && 
               (!sinceDate || a.pubDate > sinceDate);
      });

      return { 
        feed: { 
          ...parsedFeed, 
          etag: response.etag || feed?.etag, 
          lastModified: response.lastModified || feed?.lastModified 
        }, 
        articles: filteredArticles,
        bytesDownloaded
      };
    } catch (e) {
      console.error(`Failed to fetch feed data for ${feedUrl}:`, e);
      return null;
    }
  },

  async saveFeedData(feed: Feed, articles: Article[]): Promise<void> {
    await this.saveAllFeedData([{ feed, articles }]);
  },

  async saveAllFeedData(
    results: { feed: Feed; articles: Article[] }[],
    existingFeeds?: Feed[]
  ): Promise<{ updatedFeeds: Feed[]; allNewArticles: Article[] }> {
    const feeds = existingFeeds || await this.getFeeds();
    
    let updatedFeeds = [...feeds];
    let allNewArticles: Article[] = [];
    let articlesModified = false;
    
    const articlesToUpdate: Article[] = [];

    for (const { feed, articles: newArticles } of results) {
      const existingFeedIndex = updatedFeeds.findIndex(f => f.feedUrl === feed.feedUrl);
      
      const latestFromNew = newArticles.length > 0 
        ? newArticles.reduce((max, a) => Math.max(max, a.pubDate), 0)
        : 0;
      
      if (existingFeedIndex === -1) {
        const newFeed = {
          ...feed,
          lastArticleDate: latestFromNew
        };
        updatedFeeds.push(newFeed);
        
        const seenLinks = new Set<string>();
        
        for (const a of newArticles) {
          if (!seenLinks.has(a.link)) {
            seenLinks.add(a.link);
            const { content, ...lightArticle } = a;
            if (content !== undefined) {
              this.saveArticleContent(a.id, content).catch(err => console.error('Failed to save article content', err));
            }
            const articleToSave = a.type === 'podcast' ? a : lightArticle;
            allNewArticles.push(articleToSave as Article);
          }
        }
      } else {
        const feedId = updatedFeeds[existingFeedIndex].id;
        const currentLastArticleDate = updatedFeeds[existingFeedIndex].lastArticleDate || 0;
        
        updatedFeeds[existingFeedIndex] = {
          ...updatedFeeds[existingFeedIndex],
          lastFetched: Date.now(),
          lastArticleDate: Math.max(currentLastArticleDate, latestFromNew),
          title: feed.title,
          imageUrl: feed.imageUrl || updatedFeeds[existingFeedIndex].imageUrl,
          etag: feed.etag,
          lastModified: feed.lastModified,
          type: feed.type
        };
        
        const existingForFeed = await db.articles.where('feedId').equals(feedId).toArray();
        const existingLinks = new Set<string>();
        const articleByLinkMap = new Map<string, Article>();
        
        for (const ea of existingForFeed) {
          existingLinks.add(ea.link);
          articleByLinkMap.set(ea.link, ea);
        }
        
        for (const a of newArticles) {
          if (!existingLinks.has(a.link)) {
            existingLinks.add(a.link);
            const { content, ...lightArticle } = a;
            if (content !== undefined) {
              this.saveArticleContent(a.id, content).catch(err => console.error('Failed to save article content', err));
            }
            const articleToSave = a.type === 'podcast' ? a : lightArticle;
            allNewArticles.push({
              ...articleToSave,
              feedId
            } as Article);
          } else {
            const existingMatch = articleByLinkMap.get(a.link);
            if (existingMatch) {
              let modified = false;
              let nextArt = { ...existingMatch };
              
              if (!nextArt.chaptersUrl && a.chaptersUrl) {
                nextArt.chaptersUrl = a.chaptersUrl;
                modified = true;
              }
              
              if (a.type === 'podcast' && !nextArt.content && a.content) {
                nextArt.content = a.content;
                modified = true;
              }

              if (modified) {
                articlesModified = true;
                articlesToUpdate.push(nextArt);
                articleByLinkMap.set(a.link, nextArt);
              }
              
              if (a.content) {
                this.saveArticleContent(nextArt.id, a.content).catch(() => {});
              }
            }
          }
        }
      }
    }
    
    if (allNewArticles.length > 0) {
      await this.saveArticles(allNewArticles);
    }
    if (articlesToUpdate.length > 0) {
      await this.saveArticles(articlesToUpdate);
    }

    await this.saveFeeds(updatedFeeds);
    
    return { updatedFeeds, allNewArticles };
  },

  async fetchUrlContent(url: string): Promise<string> {
    const res = await fetchWithProxy(url, false);
    return res.data;
  },

  async discoverFeedUrl(url: string): Promise<string> {
    try {
      const content = await this.fetchUrlContent(url);
      const trimmedContent = content.trim();

      if (trimmedContent.startsWith('<?xml') || trimmedContent.startsWith('<rss') || trimmedContent.startsWith('<feed') || trimmedContent.startsWith('{')) {
        return url;
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      
      const feedLinks = doc.querySelectorAll('link[rel="alternate"]');
      for (const link of Array.from(feedLinks)) {
        const type = link.getAttribute('type');
        const href = link.getAttribute('href');
        if (href && (type === 'application/rss+xml' || type === 'application/atom+xml' || type === 'application/json')) {
          try {
            return new URL(href, url).href;
          } catch (e) {
            return href;
          }
        }
      }

      const commonPaths = ['feed', 'rss', 'rss.xml', 'index.xml', 'atom.xml', 'feed.xml', '/feed', '/rss', '/rss.xml', '/index.xml', '/atom.xml', '/feed.xml'];
      const baseUrl = new URL(url);
      const baseSearchUrl = baseUrl.href.endsWith('/') ? baseUrl.href : baseUrl.href + '/';
      
      for (const path of commonPaths) {
        try {
          const testUrl = new URL(path, baseSearchUrl).href;
          const testContent = await this.fetchUrlContent(testUrl);
          const trimmed = testContent.trim();
          if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed')) {
            return testUrl;
          }
        } catch (e) {
        }
      }

      return url;
    } catch (e) {
      return url;
    }
  },

  async addFeed(url: string, forcedType?: 'article' | 'podcast'): Promise<{ feed: Feed; articles: Article[] } | null> {
    const discoveredUrl = await this.discoverFeedUrl(url);
    const data = await this.fetchFeedData(discoveredUrl);
    if (!data) return null;
    
    if (forcedType) {
      data.feed.type = forcedType;
      data.articles.forEach(a => a.type = forcedType);
    }
    
    await this.saveFeedData(data.feed, data.articles);
    return data;
  },

  async parseOpml(opmlText: string): Promise<string[]> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(opmlText, 'application/xml');
    
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return [];
    }

    const outlines = doc.querySelectorAll('outline');
    const urls: string[] = [];
    
    outlines.forEach((outline) => {
      const url = outline.getAttribute('xmlUrl') || 
                  outline.getAttribute('xmlURL') || 
                  outline.getAttribute('xmlurl') || 
                  outline.getAttribute('url');
                  
      if (url && url.trim().startsWith('http')) {
        urls.push(url.trim());
      }
    });
    
    const uniqueUrls = Array.from(new Set(urls));
    return uniqueUrls;
  },

  async exportOpml(types?: ('article' | 'podcast')[]): Promise<string> {
    const feeds = await this.getFeeds();
    const filteredFeeds = types ? feeds.filter(f => types.includes(f.type as any)) : feeds;
    
    let opml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    opml += '<opml version="1.0">\n';
    opml += '  <head>\n';
    opml += '    <title>Flusso Feeds</title>\n';
    opml += '  </head>\n';
    opml += '  <body>\n';
    filteredFeeds.forEach(feed => {
      const title = escapeXml(feed.title || 'Untitled');
      const xmlUrl = escapeXml(feed.feedUrl || '');
      const htmlUrl = escapeXml(feed.link || '');
      opml += `    <outline text="${title}" title="${title}" type="rss" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}"/>\n`;
    });
    opml += '  </body>\n';
    opml += '</opml>';
    return opml;
  },

  async getRefreshLogs(offset = 0, limit = 0): Promise<RefreshLog[]> {
    let query = db.refreshLogs.orderBy('timestamp').reverse();
    if (limit > 0) {
      return await query.offset(offset).limit(limit).toArray();
    }
    return await query.toArray();
  },

  async markAllArticlesAsRead(): Promise<void> {
    const now = Date.now();
    await db.articles.filter(a => !a.isRead).modify({ isRead: true, readAt: now });
  },

  async markFilteredArticlesAsRead(filters: {
    type?: 'article' | 'podcast';
    feedId?: string;
    timeThreshold?: number;
    searchQuery?: string;
  }): Promise<void> {
    const now = Date.now();
    let collection = db.articles.filter(a => !a.isRead);

    if (filters.type && filters.type !== 'all' as any) {
      collection = collection.filter(a => a.type === filters.type);
    }
    if (filters.feedId && filters.feedId !== 'all') {
      collection = collection.filter(a => a.feedId === filters.feedId);
    }
    if (filters.timeThreshold) {
      collection = collection.filter(a => {
        const pubTime = typeof a.pubDate === 'string' ? new Date(a.pubDate).getTime() : a.pubDate;
        return pubTime >= filters.timeThreshold!;
      });
    }
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      collection = collection.filter(a => 
        a.title.toLowerCase().includes(q) || 
        (a.contentSnippet?.toLowerCase().includes(q) ?? false) ||
        (a.content?.toLowerCase().includes(q) ?? false)
      );
    }

    await collection.modify({ isRead: true, readAt: now });
  },

  async removeFeed(id: string): Promise<void> {
    await db.feeds.delete(id);
    const articles = await db.articles.where('feedId').equals(id).toArray();
    const idsToDelete = articles.map(a => a.id);
    await db.articles.bulkDelete(idsToDelete);
    await db.articleContents.bulkDelete(idsToDelete);
  },

  async saveRefreshLogs(logs: RefreshLog[]): Promise<void> {
    await db.refreshLogs.bulkPut(logs.map(log => ({ ...log, id: log.id || crypto.randomUUID() })));
  },
};