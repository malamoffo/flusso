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
      articles: 'id, feedId, pubDate, isRead, isFavorite, type',
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
      if (articles.length > 0) {
        await tx.table('articles').bulkPut(articles.map(article => ({
          ...article,
          isRead: convert(article.isRead),
          isFavorite: convert(article.isFavorite)
        })));
      }

      const posts = await tx.table('redditPosts').toArray();
      console.log(`[Database] Upgrading ${posts.length} reddit posts...`);
      if (posts.length > 0) {
        await tx.table('redditPosts').bulkPut(posts.map(post => ({
          ...post,
          isRead: convert(post.isRead),
          isFavorite: convert(post.isFavorite)
        })));
      }
      console.log('[Database] Upgrade to version 6 completed.');
    });
  }
}

export const db = new FlussoDatabase();
