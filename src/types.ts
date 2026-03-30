export type SwipeAction = 'toggleRead' | 'toggleFavorite' | 'none';
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
}

export interface Feed {
  id: string;
  title: string;
  description?: string;
  link: string;
  feedUrl: string;
  imageUrl?: string;
  lastFetched?: number;
  error?: string;
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
  duration?: string;
  progress?: number; // 0 to 1
  mediaUrl?: string;
  mediaType?: string;
  isRead: boolean;
  readAt?: number;
  isFavorite: boolean;
  isQueued: boolean;
  type: 'article' | 'podcast';
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
