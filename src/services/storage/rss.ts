import { db } from '../db';
import { Feed, Article, RefreshLog } from '../../types';
import { CapacitorHttp } from '@capacitor/core';
import { fetchWithProxy } from '../../utils/proxy';
import { parseRssXml, escapeXml } from '../rssParser';
import { v4 as uuidv4 } from 'uuid';

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

  async cleanUpOldArticles(): Promise<void> {
    const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const oldArticles = await db.articles
      .filter(a => {
        if (a.type === 'podcast' && (a.isFavorite || a.isQueued)) return false;
        const limitTime = a.type === 'podcast' ? SEVEN_DAYS : TWO_DAYS;
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
    const allContents = await db.articleContents.toArray();
    const idsToDelete = allContents.filter(c => !validIds.has(c.id)).map(c => c.id);
    if (idsToDelete.length > 0) {
      await db.articleContents.bulkDelete(idsToDelete);
    }
  },

  async saveArticles(articles: Article[]): Promise<void> {
    await db.articles.bulkPut(articles);
  },

  async fetchFeedData(feedUrl: string, sinceDate?: number, signal?: AbortSignal): Promise<{ feed: Feed; articles: Article[] } | null> {
    try {
      const feeds = await this.getFeeds();
      const feed = feeds.find(f => f.feedUrl === feedUrl);
      
      let response = await fetchWithProxy(feedUrl, true, sinceDate, signal, feed?.etag, feed?.lastModified);
      
      if (!response.data && !signal?.aborted) {
        const alternativeUrl = feedUrl.endsWith('/') ? feedUrl.slice(0, -1) : feedUrl + '/';
        response = await fetchWithProxy(alternativeUrl, true, sinceDate, signal, feed?.etag, feed?.lastModified);
      }

      if (!response.data) return null;

      const { feed: parsedFeed, articles } = parseRssXml(response.data, feedUrl, sinceDate);
      
      const filteredArticles = articles.filter(a => {
        const limit = 7 * 24 * 60 * 60 * 1000;
        return (Date.now() - a.pubDate) <= limit && 
               (!sinceDate || a.pubDate > sinceDate);
      });

      return { 
        feed: { ...parsedFeed, etag: response.etag, lastModified: response.lastModified }, 
        articles: filteredArticles 
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
    existingFeeds?: Feed[],
    existingArticles?: Article[]
  ): Promise<{ updatedFeeds: Feed[]; allNewArticles: Article[] }> {
    const feeds = existingFeeds || await this.getFeeds();
    const articles = existingArticles || await this.getArticles();
    
    const existingLinks = new Set<string>();
    const articleByLinkMap = new Map<string, number>();
    for (let i = 0; i < articles.length; i++) {
      const link = articles[i].link;
      existingLinks.add(link);
      articleByLinkMap.set(link, i);
    }
    
    let updatedFeeds = [...feeds];
    let allNewArticles: Article[] = [];
    let articlesModified = false;
    
    for (const { feed, articles: newArticles } of results) {
      const existingFeedIndex = updatedFeeds.findIndex(f => f.feedUrl === feed.feedUrl);
      
      const latestFromNew = newArticles.length > 0 
        ? newArticles.reduce((max, a) => Math.max(max, a.pubDate), 0)
        : 0;
      
      if (existingFeedIndex === -1) {
        updatedFeeds.push({
          ...feed,
          lastArticleDate: latestFromNew
        });
        
        for (const a of newArticles) {
          if (!existingLinks.has(a.link)) {
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
        
        for (const a of newArticles) {
          if (!existingLinks.has(a.link)) {
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
            const idx = articleByLinkMap.get(a.link) ?? -1;
            if (idx !== -1) {
              let modified = false;
              
              if (!articles[idx].chaptersUrl && a.chaptersUrl) {
                articles[idx] = { ...articles[idx], chaptersUrl: a.chaptersUrl };
                modified = true;
              }
              
              if (a.type === 'podcast' && !articles[idx].content && a.content) {
                articles[idx] = { ...articles[idx], content: a.content };
                modified = true;
              }

              if (modified) {
                articlesModified = true;
              }
              
              if (a.content) {
                this.saveArticleContent(articles[idx].id, a.content).catch(() => {});
              }
            }
          }
        }
      }
    }
    
    if (allNewArticles.length > 0 || articlesModified) {
      await this.saveArticles([...articles, ...allNewArticles]);
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
    
    outlines.forEach((outline, index) => {
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

  async getRefreshLogs(): Promise<RefreshLog[]> {
    return await db.refreshLogs.orderBy('timestamp').reverse().toArray();
  },

  async markAllArticlesAsRead(): Promise<void> {
    const now = Date.now();
    await db.articles.filter(a => !a.isRead).modify({ isRead: true, readAt: now });
  },

  async removeFeed(id: string): Promise<void> {
    await db.feeds.delete(id);
    const articles = await db.articles.where('feedId').equals(id).toArray();
    const idsToDelete = articles.map(a => a.id);
    await db.articles.bulkDelete(idsToDelete);
    await db.articleContents.bulkDelete(idsToDelete);
  },

  async saveRefreshLogs(logs: RefreshLog[]): Promise<void> {
    await db.refreshLogs.bulkPut(logs.map(log => ({ ...log, id: log.id || uuidv4() })));
  },
};
