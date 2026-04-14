import { db } from '../db';
import { Subreddit, RedditPost } from '../../types';
import { fetchWithProxy } from '../../utils/proxy';
import he from 'he';

export const redditStorage = {
  async fetchJsonWithProxy(url: string, signal?: AbortSignal): Promise<any> {
    const response = await fetchWithProxy(url, false, undefined, signal);
    if (!response || response.trim() === '') return null;
    
    let trimmed = response.trim();
    
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
      return JSON.parse(trimmed);
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

  async getRedditPosts(): Promise<RedditPost[]> {
    return await db.redditPosts.orderBy('createdUtc').reverse().toArray();
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
      const data = await this.fetchJsonWithProxy(url);

      if (!data || data.error || !data.data) {
        console.error('Subreddit not found or error:', data);
        return null;
      }

      const subData = data.data;
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
      let url = `https://www.reddit.com/r/${subredditName}/${sort}.json?limit=25`;
      if (after) {
        url += `&after=t3_${after}`;
      }
      const data = await this.fetchJsonWithProxy(url);
      
      if (!data || data.error || !data.data || !data.data.children) {
        return [];
      }

      const posts: RedditPost[] = data.data.children.map((child: any) => {
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

  async fetchRedditPosts(subredditName: string, sort: 'new' | 'hot' | 'top' = 'new'): Promise<RedditPost[]> {
    try {
      const url = `https://www.reddit.com/r/${subredditName}/${sort}.json?limit=25`;
      const data = await this.fetchJsonWithProxy(url);
      
      if (!data || !data.data || !data.data.children) return [];

      return data.data.children.map((child: any) => {
        const post = child.data;
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
          isRead: false,
          isFavorite: false
        };
      });
    } catch (e) {
      console.error(`Failed to fetch posts for r/${subredditName}:`, e);
      throw e;
    }
  },

  async fetchRedditComments(permalink: string): Promise<any[]> {
    try {
      const cleanPermalink = permalink.replace(/\/$/, '');
      const url = `https://www.reddit.com${cleanPermalink}.json`;
      const data = await this.fetchJsonWithProxy(url);

      if (!data || !Array.isArray(data) || data.length < 2 || !data[1].data || !data[1].data.children) return [];

      return data[1].data.children;
    } catch (e) {
      console.error(`Failed to fetch comments for ${permalink}:`, e);
      return [];
    }
  },
};
