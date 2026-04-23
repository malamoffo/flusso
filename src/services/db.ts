import Dexie, { Table } from 'dexie';
import { Feed, Article, Subreddit, RedditPost, TelegramChannel, TelegramMessage, FullArticleContent, RefreshLog, Settings } from '../types';

export class FlussoDatabase extends Dexie {
  feeds!: Table<Feed, string>;
  articles!: Table<Article, string>;
  subreddits!: Table<Subreddit, string>;
  redditPosts!: Table<RedditPost, string>;
  telegramChannels!: Table<TelegramChannel, string>;
  telegramMessages!: Table<TelegramMessage, string>;
  articleContents!: Table<FullArticleContent & { id: string }, string>;
  settings!: Table<Settings & { id: string }, string>;
  refreshLogs!: Table<RefreshLog, string>;
  kv!: Table<{ id: string, value: any }, string>;

  constructor() {
    super('FlussoDB');
    
    // Define tables and indexes
    this.version(6).stores({
      feeds: 'id, feedUrl',
      articles: 'id, feedId, pubDate, isRead, isFavorite, isQueued, type',
      subreddits: 'id, name',
      redditPosts: 'id, subredditId, createdUtc, isRead, isFavorite',
      telegramChannels: 'id, username',
      telegramMessages: 'id, channelId, date',
      articleContents: 'id',
      settings: 'id',
      refreshLogs: 'id, timestamp',
      kv: 'id'
    }).upgrade(async tx => {
      console.log('[Database] Upgrading to version 6...');
      
      const convert = (val: any) => {
        if (val === 1 || val === true || val === '1') return 1;
        return 0;
      };
      
      const articles = await tx.table('articles').toArray();
      console.log(`[Database] Upgrading ${articles.length} articles...`);
      for (const article of articles) {
        const nextIsRead = convert(article.isRead);
        const nextIsFavorite = convert(article.isFavorite);
        const nextIsQueued = convert(article.isQueued);
        
        // Always force update to ensure type is number
        await tx.table('articles').update(article.id, {
          isRead: nextIsRead,
          isFavorite: nextIsFavorite,
          isQueued: nextIsQueued
        });
      }

      const posts = await tx.table('redditPosts').toArray();
      console.log(`[Database] Upgrading ${posts.length} reddit posts...`);
      for (const post of posts) {
        const nextIsRead = convert(post.isRead);
        const nextIsFavorite = convert(post.isFavorite);
        
        await tx.table('redditPosts').update(post.id, {
          isRead: nextIsRead,
          isFavorite: nextIsFavorite
        });
      }
      console.log('[Database] Upgrade to version 6 completed.');
    });
  }
}

export const db = new FlussoDatabase();
