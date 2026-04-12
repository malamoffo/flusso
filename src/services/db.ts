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
    this.version(1).stores({
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
    });
  }
}

export const db = new FlussoDatabase();
