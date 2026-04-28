export type SwipeAction = 'toggleFavorite' | 'remove' | 'none';
export type Theme = 'light' | 'dark' | 'system';
export type FontSize = 'medium' | 'large';

export interface Settings {
  swipeLeftAction: SwipeAction;
  swipeRightAction: SwipeAction;
  fontSize: FontSize;
  refreshInterval: number;
  themeColor: string;
  autoCheckUpdates: boolean;
  theme: Theme;
  pureBlack: boolean;
  redditRetentionDays: number;
  telegramRetentionDays: number;
  articleRetentionDays: number;
}

export interface Feed {
  id: string;
  title: string;
  description?: string;
  link: string;
  feedUrl: string;
  imageUrl?: string;
  lastFetched?: number;
  lastArticleDate?: number;
  error?: string;
  type?: 'article';
  lastRefreshStatus?: 'success' | 'error';
  etag?: string;
  lastModified?: string;
}

export interface Article {
  id: string;
  feedId: string;
  title: string;
  link: string;
  pubDate: number;
  contentSnippet?: string;
  content?: string;
  imageUrl?: string;
  profileImageUrl?: string; // Added for Bluesky
  postImageUrls?: string[]; // Added for Bluesky
  isRead: number; // 0 or 1
  readAt?: number;
  isFavorite: number; // 0 or 1
  type: 'article';
  aiSummary?: string;
}

export interface RefreshLog {
  id: string;
  timestamp: number;
  status: 'success' | 'error';
  message?: string;
  feedId?: string;
}

export interface FullArticleContent {
  title: string;
  content: string;
  textContent: string;
  length: number;
  excerpt: string;
  byline: string;
  dir: string;
  siteName: string;
  lang: string;
}

export interface Subreddit {
  id: string;
  name: string; // e.g., "soloboardgaming"
  iconUrl?: string;
  addedAt: number;
  lastFetched?: number;
  etag?: string;
  lastModified?: string;
}

export interface RedditPost {
  id: string; // Reddit's post ID
  originalId?: string;
  subredditId: string;
  subredditName: string;
  title: string;
  author: string;
  url: string;
  permalink: string;
  score: number;
  numComments: number;
  createdUtc: number;
  selftextHtml?: string;
  imageUrl?: string;
  isRead: number;
  readAt?: number;
  isFavorite: number;
}

export interface RedditComment {
  id: string;
  author: string;
  bodyHtml: string;
  score: number;
  createdUtc: number;
  depth: number;
  replies?: RedditComment[];
}

export interface TelegramChannel {
  id: string;
  name: string;
  username: string;
  imageUrl?: string;
  lastMessageDate: number;
  lastChecked: number;
  unreadCount: number;
  lastOpened: number;
  error?: string;
}

export interface TelegramMessage {
  id: string;
  channelId: string;
  text: string;
  imageUrl?: string;
  date: number;
}

export interface RadioStation {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  homepage: string;
  favicon: string;
  tags: string;
  country: string;
  countrycode: string;
  state: string;
  language: string;
  votes: number;
  isFavorite?: boolean;
}
