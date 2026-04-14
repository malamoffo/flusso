export type SwipeAction = 'toggleFavorite' | 'remove' | 'none';
export type ImageDisplay = 'none' | 'small' | 'large';
export type Theme = 'light' | 'dark' | 'system';
export type FontSize = 'small' | 'medium' | 'large' | 'xlarge';

export interface Settings {
  swipeLeftAction: SwipeAction;
  swipeRightAction: SwipeAction;
  imageDisplay: ImageDisplay;
  fontSize: FontSize;
  refreshInterval: number;
  themeColor: string;
  autoCheckUpdates: boolean;
  theme: Theme;
  pureBlack: boolean;
  imageRetentionDays: number;
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
  type?: 'article' | 'podcast';
  lastRefreshStatus?: 'success' | 'error';
}

export interface PodcastChapter {
  startTime: number;
  title: string;
  url?: string;
  imageUrl?: string;
  img?: string;
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
  duration?: string;
  progress?: number; // 0 to 1
  mediaUrl?: string;
  mediaType?: string;
  isRead: boolean;
  readAt?: number;
  isFavorite: boolean;
  isQueued: boolean;
  type: 'article' | 'podcast';
  chapters?: PodcastChapter[];
  chaptersUrl?: string;
  episode?: number;
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
}

export interface RedditPost {
  id: string; // Reddit's post ID
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
  isRead: boolean;
  readAt?: number;
  isFavorite: boolean;
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
