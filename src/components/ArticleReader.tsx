import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, FileText, AlignLeft, X, Share2, Star, EyeOff, ListPlus, Play, Pause, SkipBack, SkipForward, RotateCcw, RotateCw, ChevronUp, ChevronDown, Clock, Calendar, User, ExternalLink, RefreshCw } from 'lucide-react';
import { Article, FullArticleContent } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useRss } from '../context/RssContext';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import DOMPurify from 'dompurify';
import he from 'he';
import { CachedImage } from './CachedImage';
import { cn, getSafeUrl, formatTime, parseDurationToSeconds } from '../lib/utils';
import { CapacitorHttp } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Readability } from '@mozilla/readability';
import { fetchWithProxy } from '../utils/proxy';
import { contentFetcher } from '../utils/contentFetcher';
import { extractBestImage } from '../services/storage';
import { getColorSync } from 'colorthief';

interface ArticleReaderProps {
  key?: React.Key;
  article: Article;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onSelectArticle?: (article: Article) => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export function ArticleReader({ article, onClose, onNext, onPrev, onSelectArticle, hasNext, hasPrev }: ArticleReaderProps) {
  const [fullContent, setFullContent] = useState<FullArticleContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [articleThemeColor, setArticleThemeColor] = useState<string | null>(null);
  const { settings, feeds, articles, toggleFavorite, toggleQueue, toggleRead, updateArticle } = useRss();
  const feed = feeds.find(f => f.id === article.feedId);
  const { play, currentTrack, isPlaying, isBuffering, toggle, progress, duration, seek } = useAudioPlayer();
  
  const isCurrentTrack = currentTrack?.id === article.id;
  const isLoadingAudio = isCurrentTrack && isBuffering;
  const totalSeconds = isCurrentTrack ? duration : parseDurationToSeconds(article.duration);
  const currentSeconds = isCurrentTrack ? progress : (article.progress ? article.progress * totalSeconds : 0);
  const remainingSeconds = Math.max(0, totalSeconds - currentSeconds);
  const progressPercent = totalSeconds > 0 ? (currentSeconds / totalSeconds) * 100 : 0;

  // Get queue for navigation
  const queue = articles.filter(a => a.isQueued);
  const queueIndex = queue.findIndex(a => a.id === article.id);
  const prevInQueue = queueIndex > 0 ? queue[queueIndex - 1] : null;
  const nextInQueue = queueIndex !== -1 && queueIndex < queue.length - 1 ? queue[queueIndex + 1] : null;

  const [isFavorite, setIsFavorite] = useState(article.isFavorite);
  const [isQueued, setIsQueued] = useState(article.isQueued);

  useEffect(() => {
    setIsFavorite(article.isFavorite);
    setIsQueued(article.isQueued);
  }, [article.isFavorite, article.isQueued]);

  useEffect(() => {
    if (article.imageUrl) {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      // Use proxy to bypass CORS for image color extraction
      img.src = `https://api.allorigins.win/raw?url=${encodeURIComponent(article.imageUrl)}`;
      img.onload = () => {
        try {
          const color = getColorSync(img);
          if (color) {
            console.log("Extracted color:", color.hex());
            setArticleThemeColor(color.hex());
          }
        } catch (e) {
          console.error("Failed to extract color:", e);
        }
      };
      img.onerror = () => {
        // Fallback to direct URL if proxy fails (might work if CORS is allowed)
        if (img.src !== article.imageUrl) {
          img.src = article.imageUrl;
        } else {
          setArticleThemeColor(null);
        }
      };
    } else {
      setArticleThemeColor(null);
    }
  }, [article.imageUrl]);

  const readTime = fullContent?.textContent ? Math.max(1, Math.ceil(fullContent.textContent.split(/\s+/).length / 200)) : 1;
  const formattedDate = new Date(article.pubDate).toLocaleString('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
// ... (rest of the file)

  const getProseSize = () => {
    switch (settings.fontSize) {
      case 'small': return 'prose-sm';
      case 'medium': return 'prose-base';
      case 'large': return 'prose-lg';
      case 'xlarge': return 'prose-xl';
      default: return 'prose-base';
    }
  };

  const getTitleSize = () => {
    switch (settings.fontSize) {
      case 'small': return 'text-xl';
      case 'medium': return 'text-2xl';
      case 'large': return 'text-3xl';
      case 'xlarge': return 'text-4xl';
      default: return 'text-2xl';
    }
  };

  useEffect(() => {
    const fetchFullContent = async () => {
      if (article.type === 'podcast') {
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        setFullContent(null); // Reset content when article changes
        
        // Check cache first
        const cached = await contentFetcher.getCachedContent(article.id);
        if (cached) {
          console.log(`[READER] Using pre-fetched content for: ${article.link}`);
          setFullContent(cached);
          setIsLoading(false);
          return;
        }

        const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();
        let html = '';

        if (isNative) {
          console.log(`[READER] Native direct fetch: ${article.link}`);
          const response = await CapacitorHttp.get({ url: article.link });
          if (response.status === 200) {
            html = response.data;
          } else {
            throw new Error(`Failed to fetch article: ${response.status}`);
          }
        } else {
          console.log(`[READER] Web proxy fetch (CORS bypass for preview): ${article.link}`);
          html = await fetchWithProxy(article.link, false);
        }

        if (html) {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const reader = new Readability(doc);
          const articleData = reader.parse();

          if (articleData) {
            const contentToSave = {
              title: articleData.title,
              content: articleData.content,
              textContent: articleData.textContent,
              length: articleData.length,
              excerpt: articleData.excerpt,
              byline: articleData.byline,
              dir: articleData.dir,
              siteName: articleData.siteName,
              lang: articleData.lang,
            };
            setFullContent(contentToSave);
            // Cache it for future use
            contentFetcher.setCachedContent(article.id, contentToSave);
            
            // If the article doesn't have an image, try to extract one from the full content
            if (!article.imageUrl && contentToSave.content) {
              const newImageUrl = extractBestImage(contentToSave.content);
              if (newImageUrl) {
                const safeUrl = getSafeUrl(newImageUrl, '');
                if (safeUrl) {
                  updateArticle(article.id, { imageUrl: safeUrl });
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('[READER] Error fetching full content:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFullContent();
  }, [article.link, article.id]);

  const sanitizedContent = React.useMemo(() => {
    let contentToSanitize = fullContent?.content;
    
    if (!contentToSanitize && article.content) {
      contentToSanitize = he.decode(article.content);
    }
    
    if (!contentToSanitize) return '';
    
    // Clean up superfluous text/empty tags often left by poor formatting
    let content = contentToSanitize;
    
    content = content.replace(/<p[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '');
    content = content.replace(/<div[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/div>/gi, '');
    content = content.replace(/<span[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/span>/gi, '');
    
    // Create a local instance of DOMPurify to be thread-safe in React
    const purifier = DOMPurify();

    // Security enhancement: Add hooks to ensure all links and iframes are safe
    purifier.addHook('afterSanitizeAttributes', (node) => {
      // Force rel="nofollow noopener noreferrer" on all links
      if (node.tagName === 'A') {
        node.setAttribute('rel', 'nofollow noopener noreferrer');
      }

      // Force sandbox on iframes to prevent them from breaking the app
      if (node.tagName === 'IFRAME') {
        node.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
      }

      // Sanitized protocols for src and href
      if (node.hasAttribute('src')) {
        node.setAttribute('src', getSafeUrl(node.getAttribute('src'), ''));
      }
      if (node.hasAttribute('href')) {
        node.setAttribute('href', getSafeUrl(node.getAttribute('href'), ''));
      }

      // Remove tracking pixels, avatars, small icons, and the main image (to avoid duplication)
      if (node.tagName === 'IMG') {
        const src = node.getAttribute('src') || '';
        const lowerSrc = src.toLowerCase();
        const width = parseInt(node.getAttribute('width') || '0', 10);
        const height = parseInt(node.getAttribute('height') || '0', 10);
        
        if (
          src === article.imageUrl ||
          lowerSrc.includes('1x1') ||
          lowerSrc.includes('pixel') ||
          lowerSrc.includes('tracker') ||
          lowerSrc.includes('feedburner') ||
          lowerSrc.includes('stats') ||
          lowerSrc.includes('gravatar') ||
          lowerSrc.includes('avatar') ||
          lowerSrc.includes('favicon') ||
          lowerSrc.includes('icon') ||
          lowerSrc.includes('logo') ||
          lowerSrc.includes('wp-includes/images/smilies') ||
          lowerSrc.includes('share') ||
          lowerSrc.includes('button') ||
          lowerSrc.includes('badge') ||
          (width > 0 && width <= 50) ||
          (height > 0 && height <= 50)
        ) {
          node.parentNode?.removeChild(node);
        }
      }
    });

    return purifier.sanitize(content, {
      ADD_ATTR: ['style', 'allowfullscreen', 'frameborder', 'scrolling', 'controls', 'src', 'alt', 'width', 'height', 'srcset', 'sizes', 'sandbox'],
      ADD_TAGS: ['video', 'audio', 'source', 'iframe', 'img'],
      FORBID_ATTR: ['id', 'name'],
    });
  }, [fullContent?.content]);

  const hasMedia = !!article.mediaUrl;

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '-100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden flex flex-col transition-colors break-words bg-black"
    >
      {/* Background Tint */}
      {articleThemeColor && (
        <div 
          className="fixed inset-0 pointer-events-none z-0 transition-colors duration-500"
          style={{ backgroundColor: `${articleThemeColor}15` }}
        />
      )}

      {/* Top App Bar */}
      <div 
        className="sticky top-0 z-20 backdrop-blur-md border-b border-gray-800 px-4 py-3 flex items-center justify-between transition-colors bg-black/80"
      >
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Close article"
        >
          <X className="w-6 h-6 text-gray-800 dark:text-gray-200" aria-hidden="true" />
        </motion.button>
      </div>

      {/* Article Content */}
      <div className="relative z-10 flex-1 px-4 pt-6 pb-12 max-w-3xl mx-auto w-full">
        {(article.imageUrl || (article.type === 'podcast' && feed?.imageUrl)) && (
          <CachedImage 
            src={getSafeUrl(article.imageUrl || (article.type === 'podcast' ? feed?.imageUrl : '') || '')}
            alt="" 
            className="w-full h-auto rounded-2xl mb-4 object-contain max-h-[80vh]"
            referrerPolicy="no-referrer"
          />
        )}

        <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          {formattedDate} • {readTime}m read
        </div>

        <h1 className={`${getTitleSize()} font-bold text-gray-900 dark:text-white mb-4 leading-tight`}>
          <a 
            href={getSafeUrl(article.link)}
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:underline"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.title, { FORBID_ATTR: ['id', 'name'] }) }}
          />
        </h1>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full">
            {article.link && (
              <CachedImage 
                src={`https://icons.duckduckgo.com/ip3/${(() => {
                  try { return new URL(article.link).hostname; }
                  catch { return ''; }
                })()}.ico`} 
                alt="" 
                className="w-4 h-4 rounded-sm"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=${(() => {
                    try { return new URL(article.link).hostname; }
                    catch { return ''; }
                  })()}&sz=32`;
                }}
              />
            )}
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{feed?.title || 'Unknown Source'}</span>
          </div>

          <div className="flex items-center gap-4 text-gray-500 dark:text-gray-400">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={async () => {
                try {
                  await Share.share({
                    title: article.title,
                    url: article.link,
                    dialogTitle: 'Condividi articolo'
                  });
                } catch (err) {
                  console.error('Error sharing with Capacitor:', err);
                  if (navigator.share) {
                    try {
                      await navigator.share({ title: article.title, url: article.link });
                    } catch (e) {
                      console.error('Fallback share error:', e);
                    }
                  }
                }
              }}
              className="hover:text-gray-900 dark:hover:text-white transition-colors"
              aria-label="Share article"
            >
              <Share2 className="w-5 h-5" aria-hidden="true" />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                if (article.type === 'podcast') {
                  setIsQueued(!isQueued);
                  toggleQueue(article.id);
                } else {
                  setIsFavorite(!isFavorite);
                  toggleFavorite(article.id);
                }
              }}
              className="hover:text-gray-900 dark:hover:text-white transition-colors"
              aria-label={
                article.type === 'podcast' 
                  ? (isQueued ? "Remove from queue" : "Add to queue")
                  : (isFavorite ? "Remove from favorites" : "Add to favorites")
              }
            >
              {article.type === 'podcast' ? (
                <ListPlus className={`w-5 h-5 ${isQueued ? 'text-indigo-500' : ''}`} aria-hidden="true" />
              ) : (
                <Star className={`w-5 h-5 ${isFavorite ? 'fill-current text-indigo-500' : ''}`} aria-hidden="true" />
              )}
            </motion.button>
          </div>
        </div>

        <hr className="border-gray-200 dark:border-gray-800 mb-6" />

        {article.type === 'podcast' && article.mediaUrl && (
          <div className="mb-8 p-6 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex flex-col gap-6">
              {/* Progress Info */}
              <div className="flex items-center gap-4 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                <span className="w-10 text-left">{formatTime(currentSeconds)}</span>
                <div 
                  className="relative flex-1 h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const percent = x / rect.width;
                    seek(percent * totalSeconds);
                  }}
                >
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-300" 
                    style={{ width: `${progressPercent}%` }} 
                  />
                </div>
                <span className="w-10 text-right">{formatTime(remainingSeconds)}</span>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  disabled={!prevInQueue}
                  onClick={() => {
                    if (prevInQueue) {
                      play(prevInQueue);
                      onSelectArticle?.(prevInQueue);
                    }
                  }}
                  className={`p-2 rounded-full transition-colors ${prevInQueue ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800' : 'text-gray-300 dark:text-gray-700'}`}
                  aria-label="Previous in queue"
                >
                  <SkipBack className="w-6 h-6 fill-current" />
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => seek(Math.max(0, currentSeconds - 15))}
                  className="p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors"
                  aria-label="Back 15 seconds"
                >
                  <div className="relative">
                    <RotateCcw className="w-6 h-6" />
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold mt-0.5">15</span>
                  </div>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (isCurrentTrack) toggle();
                    else play(article);
                  }}
                  className={cn(
                    "w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-colors relative",
                    isLoadingAudio && "animate-pulse"
                  )}
                  aria-label={isPlaying && isCurrentTrack ? "Pause" : "Play"}
                >
                  {isLoadingAudio ? (
                    <RefreshCw className="w-8 h-8 animate-spin" />
                  ) : isPlaying && isCurrentTrack ? (
                    <Pause className="w-8 h-8 fill-current" />
                  ) : (
                    <Play className="w-8 h-8 fill-current ml-1" />
                  )}
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => seek(Math.min(totalSeconds, currentSeconds + 15))}
                  className="p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors"
                  aria-label="Forward 15 seconds"
                >
                  <div className="relative">
                    <RotateCw className="w-6 h-6" />
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold mt-0.5">15</span>
                  </div>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.9 }}
                  disabled={!nextInQueue}
                  onClick={() => {
                    if (nextInQueue) {
                      play(nextInQueue);
                      onSelectArticle?.(nextInQueue);
                    }
                  }}
                  className={`p-2 rounded-full transition-colors ${nextInQueue ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800' : 'text-gray-300 dark:text-gray-700'}`}
                  aria-label="Next in queue"
                >
                  <SkipForward className="w-6 h-6 fill-current" />
                </motion.button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4 animate-pulse mt-8">
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full"></div>
            <div className="h-40 bg-gray-200 dark:bg-gray-800 rounded w-full mt-6"></div>
          </div>
        ) : sanitizedContent ? (
          <div 
            className={`prose ${getProseSize()} prose-indigo dark:prose-invert max-w-full overflow-hidden text-justify
              prose-img:rounded-xl prose-img:w-full prose-img:object-cover prose-img:max-w-full
              prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-headings:font-bold
              prose-pre:max-w-full prose-pre:overflow-x-auto`}
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />
        ) : (
          <div className={`prose ${getProseSize()} prose-indigo dark:prose-invert max-w-full overflow-hidden text-center py-8`}>
            <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              We couldn't load the full content of this article.
            </p>
            <a 
              href={getSafeUrl(article.link)}
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors no-underline"
            >
              Read original article
            </a>
          </div>
        )}
      </div>

    </motion.div>
  );
}