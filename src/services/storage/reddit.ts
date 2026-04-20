import { db } from '../db';
import { Subreddit, RedditPost } from '../../types';
import { fetchWithProxy } from '../../utils/proxy';
import he from 'he';

export const redditStorage = {
  isImgurUrl(url: string): boolean {
    try {
      const { hostname } = new URL(url);
      return hostname === 'imgur.com' || hostname.endsWith('.imgur.com');
    } catch {
      return false;
    }
  },

  async fetchJsonWithProxy(url: string, signal?: AbortSignal, etag?: string, lastModified?: string): Promise<{ data: any, etag?: string, lastModified?: string } | null> {
    const response = await fetchWithProxy(url, false, undefined, signal, etag, lastModified);
    
    if (response.data === '') {
      return {
        data: null,
        etag: response.etag || etag,
        lastModified: response.lastModified || lastModified
      };
    }

    if (!response.data || response.data.trim() === '') return null;
    
    let trimmed = response.data.trim();
    
    const firstBrace = trimmed.indexOf('{');
    const firstBracket = trimmed.indexOf('[');
    let startIndex = -1;
    
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIndex = firstBrace;
    } else if (firstBracket !== -1) {
      startIndex = firstBracket;
    }
    
    if (startIndex === -1) {
      throw new Error(`Invalid JSON response (starts with ${trimmed.substring(0, 5)}). The service might be temporarily unavailable via proxy.`);
    }
    
    if (startIndex > 0) {
      trimmed = trimmed.substring(startIndex);
    }
    
    try {
      return {
        data: JSON.parse(trimmed),
        etag: response.etag,
        lastModified: response.lastModified
      };
    } catch (e) {
      console.error(`Failed to parse JSON from ${url}:`, e);
      throw new Error(`Malformed JSON response from ${url}`);
    }
  },

  async getSubreddits(): Promise<Subreddit[]> {
    return await db.subreddits.toArray();
  },

  async saveSubreddits(subs: Subreddit[]): Promise<void> {
    await db.subreddits.bulkPut(subs);
  },

  async getRedditPosts(offset = 0, limit = 0): Promise<RedditPost[]> {
    let query = db.redditPosts.orderBy('createdUtc').reverse();
    if (limit > 0) {
      return await query.offset(offset).limit(limit).toArray();
    }
    return await query.toArray();
  },

  async saveRedditPosts(posts: RedditPost[]): Promise<void> {
    await db.redditPosts.bulkPut(posts);
  },

  async addSubreddit(name: string): Promise<Subreddit | null> {
    try {
      let cleanName = name.trim();
      const lowerName = cleanName.toLowerCase();
      if (lowerName.includes('reddit.com/r/')) {
        cleanName = cleanName.split(/reddit\.com\/r\//i)[1].split('/')[0];
      } else if (lowerName.startsWith('r/')) {
        cleanName = cleanName.substring(2);
      }
      cleanName = cleanName.replace(/[^a-zA-Z0-9_]/g, '');

      if (!cleanName) return null;

      const url = `https://www.reddit.com/r/${cleanName}/about.json`;
      const result = await this.fetchJsonWithProxy(url);

      if (!result || result.data.error || !result.data.data) {
        console.error('Subreddit not found or error:', result);
        return null;
      }

      const subData = result.data.data;
      let iconUrl = subData.icon_img || subData.community_icon || undefined;
      if (iconUrl) {
        iconUrl = iconUrl.split('?')[0];
        iconUrl = he.decode(iconUrl);
      }

      const newSub: Subreddit = {
        id: subData.name,
        name: subData.display_name || cleanName,
        iconUrl,
        addedAt: Date.now(),
      };

      const subs = await this.getSubreddits();
      if (!subs.find(s => s.name.toLowerCase() === newSub.name.toLowerCase())) {
        subs.push(newSub);
        await this.saveSubreddits(subs);
      }

      return newSub;
    } catch (e) {
      console.error('Failed to add subreddit:', e);
      return null;
    }
  },

  async fetchSubredditPosts(subredditName: string, sinceDate?: number, after?: string, sort: 'new' | 'hot' | 'top' = 'new'): Promise<RedditPost[]> {
    try {
      const subreddits = await this.getSubreddits();
      const subreddit = subreddits.find(s => s.name === subredditName);
      
      let url = `https://www.reddit.com/r/${subredditName}/${sort}.json?limit=25`;
      if (after) {
        url += `&after=t3_${after}`;
      }
      
      const data = await this.fetchJsonWithProxy(url, undefined, subreddit?.etag, subreddit?.lastModified);
      
      if (!data || data.data.error || !data.data.data || !data.data.data.children) {
        return [];
      }

      // Update etag and lastModified for the subreddit
      if (subreddit) {
        subreddit.etag = data.etag;
        subreddit.lastModified = data.lastModified;
        await this.saveSubreddits(subreddits);
      }

      const posts: RedditPost[] = data.data.data.children.map((child: any) => {
        const post = child.data;
        const createdUtc = post.created_utc * 1000;

        if (sinceDate && createdUtc <= sinceDate) return null;

        let imageUrl = undefined;
        if (post.preview && post.preview.images && post.preview.images.length > 0) {
          const preview = post.preview.images[0];
          imageUrl = preview.source.url;
        } else if (post.url && (post.url.match(/\.(jpg|jpeg|png|gif|webp)$/) || post.url.includes('imgur.com'))) {
          imageUrl = post.url;
        } else if (post.thumbnail && post.thumbnail.startsWith('http')) {
          imageUrl = post.thumbnail;
        }

        return {
          id: `${post.subreddit}/${post.id}`,
          subredditId: post.subreddit_id,
          subredditName: post.subreddit,
          title: he.decode(post.title),
          author: post.author,
          url: post.url,
          permalink: post.permalink,
          score: post.score,
          numComments: post.num_comments,
          createdUtc,
          selftextHtml: post.selftext_html ? he.decode(post.selftext_html) : undefined,
          imageUrl: imageUrl ? he.decode(imageUrl) : undefined,
          isRead: false,
          isFavorite: false,
        };
      }).filter(Boolean) as RedditPost[];

      return posts;
    } catch (e) {
      console.error(`Failed to fetch posts for r/${subredditName}:`, e);
      return [];
    }
  },

  async fetchRedditPosts(subredditName: string, sort: 'new' | 'hot' | 'top' = 'new', after?: string): Promise<{posts: RedditPost[], after?: string}> {
    try {
      // Don't strictly require subreddit object to perform fetch
      const subreddits = await this.getSubreddits();
      const subreddit = subreddits.find(s => s.name === subredditName);
      
      let url = `https://www.reddit.com/r/${subredditName}/${sort}.json?limit=25`;
      if (after) {
        // If 'after' already contains 't3_', use it as is, otherwise prefix it.
        const cursor = after.startsWith('t3_') ? after : `t3_${after}`;
        url += `&after=${cursor}`;
      }

      // Use etag from subreddit if available
      const result = await this.fetchJsonWithProxy(url, undefined, subreddit?.etag, subreddit?.lastModified);
      
      if (!result || result.data === null) return { posts: [] }; // 304 Not Modified

      // Update etag, lastModified and lastFetched for the subreddit IF it exists
      if (subreddit) {
        subreddit.etag = result.etag;
        subreddit.lastModified = result.lastModified;
        subreddit.lastFetched = Date.now();
        await this.saveSubreddits(subreddits);
      }

      if (!result.data.data || !result.data.data.children) return { posts: [] };

      const posts = result.data.data.children.map((child: any) => {
        const post = child.data;
        let imageUrl = undefined;
        
        if (post.preview && post.preview.images && post.preview.images.length > 0) {
          const preview = post.preview.images[0];
          imageUrl = preview.source.url;
        } else if (post.url && (post.url.match(/\.(jpg|jpeg|png|gif|webp)$/) || this.isImgurUrl(post.url))) {
          imageUrl = post.url;
        } else if (post.thumbnail && post.thumbnail.startsWith('http')) {
          imageUrl = post.thumbnail;
        }

        return {
          id: `${post.subreddit}/${post.id}`,
          originalId: post.id,                // Need this for cursor tracking
          title: he.decode(post.title),
          author: post.author,
          subredditId: post.subreddit_id,
          subredditName: post.subreddit,
          permalink: post.permalink,
          url: post.url,
          imageUrl: imageUrl ? he.decode(imageUrl) : undefined,
          createdUtc: post.created_utc * 1000,
          score: post.score,
          numComments: post.num_comments,
          selftextHtml: post.selftext_html ? he.decode(post.selftext_html) : undefined,
          isRead: false,
          isFavorite: false
        };
      });

      return { posts, after: result.data.data.after };
    } catch (e) {
      console.error(`Failed to fetch posts for r/${subredditName}:`, e);
      throw e;
    }
  },

  async fetchRedditComments(permalink: string): Promise<any[]> {
    console.log(`[Reddit Comments] Starting fetch for: ${permalink}`);
    try {
      const cleanPermalink = permalink.replace(/\/$/, '');
      const url = `https://www.reddit.com${cleanPermalink}.json`;
      
      try {
        console.log(`[Reddit Comments] 1. Trying JSON API method...`);
        const result = await this.fetchJsonWithProxy(url);
        if (result && result.data && Array.isArray(result.data) && result.data.length >= 2 && result.data[1].data && result.data[1].data.children) {
          console.log(`[Reddit Comments] JSON API success.`);
          return result.data[1].data.children;
        }
      } catch (e) {
        console.warn(`[Reddit Comments] JSON API failed. Attempting scraping fallback...`, e);
      }

      // Scraping fallback: fetch HTML and parse
      console.log(`[Reddit Comments] 2. Trying Scraping Fallback method...`);
      const htmlUrl = `https://www.reddit.com${cleanPermalink}`;
      const response = await fetchWithProxy(htmlUrl, false);
      if (!response.data) {
        console.warn(`[Reddit Comments] Scraping failed, no data returned.`);
        return [];
      }
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(response.data, 'text/html');
      
      // ... (rest of parsing logic)
      const comments: any[] = [];
      const commentSelectors = ['.comment', 'div[data-testid="comment"]', 'shreddit-comment'];
      
      let commentElements: Element[] = [];
      for (const selector of commentSelectors) {
         const elements = doc.querySelectorAll(selector);
         if (elements.length > 0) {
            commentElements = Array.from(elements);
            break;
         }
      }
      
      commentElements.forEach(el => {
         const author = el.querySelector('.author')?.textContent 
                     || el.getAttribute('author') 
                     || 'unknown';
         const body = el.querySelector('.md')?.textContent 
                    || (el as HTMLElement).innerText
                    || '';
         comments.push({ data: { author, body } });
      });

      console.log(`[Reddit Comments] Scraping successful. Found: ${comments.length} comments.`);
      return comments;
    } catch (e: any) {
      console.error(`[Reddit Comments] All methods failed for: ${permalink}`, e);
      return [];
    }
  },
  
  async cleanupOldRedditPosts(retentionDays: number = 1): Promise<void> {
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    
    const posts = await this.getRedditPosts();
    if (posts.length <= 5) return;

    const oldPosts = posts
      .filter(p => !p.isFavorite && (now - p.createdUtc) > retentionMs)
      .sort((a, b) => b.createdUtc - a.createdUtc); // Newest first
    
    if (oldPosts.length > 0) {
      const postsToKeep = 5;
      const postsAfterCleanup = posts.length - oldPosts.length;
      
      let idsToDelete;
      if (postsAfterCleanup < postsToKeep) {
        const numberToRemove = oldPosts.length - (postsToKeep - postsAfterCleanup);
        if (numberToRemove <= 0) return;
        idsToDelete = oldPosts.slice(oldPosts.length - numberToRemove).map(p => p.id);
      } else {
        idsToDelete = oldPosts.map(p => p.id);
      }

      if (idsToDelete.length > 0) {
        await db.redditPosts.bulkDelete(idsToDelete);
      }
    }
  }
};
