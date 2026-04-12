import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, FileText, AlignLeft, X, Share2, Star, EyeOff, ListPlus, Play, Pause, SkipBack, SkipForward, RotateCcw, RotateCw, ChevronUp, ChevronDown, Clock, Calendar, User, ExternalLink, RefreshCw, Bookmark, List } from 'lucide-react';
import { Article, FullArticleContent, PodcastChapter } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useRss } from '../context/RssContext';
import { useAudioState, useAudioProgress } from '../context/AudioPlayerContext.tsx';
import DOMPurify from 'dompurify';
import he from 'he';
import { CachedImage } from './CachedImage';
import { cn, getSafeUrl, formatTime, parseDurationToSeconds } from '../lib/utils';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { imagePersistence } from '../utils/imagePersistence';
import { Readability } from '@mozilla/readability';
import { fetchWithProxy } from '../utils/proxy';
import { contentFetcher } from '../utils/contentFetcher';
import { extractBestImage } from '../services/rssParser';
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

const PodcastChapters = ({ article, isCurrentTrack }: { article: Article, isCurrentTrack: boolean }) => {
  const [chapters, setChapters] = useState<PodcastChapter[]>(article.chapters || []);
  const [loading, setLoading] = useState(false);
  const { seek } = useAudioState();
  const { progress } = useAudioProgress();

  useEffect(() => {
    if (article.chapters && article.chapters.length > 0) {
      setChapters(article.chapters);
      return;
    }

    if (article.chaptersUrl) {
      setLoading(true);
      fetchWithProxy(article.chaptersUrl, false)
        .then(text => JSON.parse(text))
        .then(data => {
          if (data && data.chapters && Array.isArray(data.chapters)) {
            const mappedChapters = data.chapters.map((c: any) => ({
              startTime: Number(c.startTime) || 0,
              title: c.title || 'Untitled Chapter',
              url: c.url,
              imageUrl: c.img || c.image || c.imageUrl
            }));
            setChapters(mappedChapters);
          }
        })
        .catch(err => console.error('Failed to fetch chapters:', err))
        .finally(() => setLoading(false));
    }
  }, [article.chapters, article.chaptersUrl]);

  if (!chapters || chapters.length === 0) {
    if (loading) {
      return <div className="text-sm text-gray-500 animate-pulse mt-4">Loading chapters...</div>;
    }
    return null;
  }

  return (
    <div className="mt-6">
      <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
        <List className="w-5 h-5" /> Chapters
      </h3>
      <div className="space-y-2">
        {chapters.map((chapter, index) => {
          const isCurrentChapter = isCurrentTrack && progress >= chapter.startTime && (index === chapters.length - 1 || progress < chapters[index + 1].startTime);
          return (
            <button
              key={index}
              onClick={() => {
                if (isCurrentTrack) {
                  seek(chapter.startTime);
                }
              }}
              className={cn(
                "w-full text-left px-4 py-3 rounded-xl transition-colors flex items-center gap-3",
                isCurrentChapter ? "bg-indigo-900/40 border border-indigo-500/30" : "bg-gray-800/40 hover:bg-gray-800",
                !isCurrentTrack && "cursor-default"
              )}
            >
              {chapter.imageUrl && (
                <CachedImage src={chapter.imageUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className={cn("font-medium truncate", isCurrentChapter ? "text-indigo-300" : "text-gray-200")}>
                  {chapter.title}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {formatTime(chapter.startTime)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const ArticleReader = React.memo(function ArticleReader({ article, onClose, onNext, onPrev, onSelectArticle, hasNext, hasPrev }: ArticleReaderProps) {
  const [fullContent, setFullContent] = useState<FullArticleContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [articleThemeColor, setArticleThemeColor] = useState<string | null>(null);
  const [readerImageUrl, setReaderImageUrl] = useState<string | null>(article.imageUrl || null);
  const { settings, feeds, articles, toggleFavorite, toggleQueue, toggleRead, updateArticle } = useRss();
  const feed = feeds.find(f => f.id === article.feedId);
  const { play, currentTrack, isPlaying, isBuffering, toggle, seek } = useAudioState();
  
  const isCurrentTrack = currentTrack?.id === article.id;
  const isLoadingAudio = isCurrentTrack && isBuffering;

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
    setReaderImageUrl(article.imageUrl || null);
  }, [article.id, article.isFavorite, article.isQueued, article.imageUrl]);

  useEffect(() => {
    const displayImage = readerImageUrl || (article.type === 'podcast' ? feed?.imageUrl : null);
    if (displayImage) {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      // Use proxy to bypass CORS for image color extraction
      img.src = `https://api.allorigins.win/raw?url=${encodeURIComponent(displayImage)}`;
      img.onload = () => {
        try {
          const color = getColorSync(img);
          if (color) {
            setArticleThemeColor(color.hex());
          }
        } catch (e) {
          console.error("Failed to extract color:", e);
        }
      };
      img.onerror = () => {
        // Fallback to direct URL if proxy fails (might work if CORS is allowed)
        if (img.src !== displayImage) {
          img.src = displayImage;
        } else {
          setArticleThemeColor(null);
        }
      };
    } else {
      setArticleThemeColor(null);
    }
  }, [readerImageUrl, article.type, feed?.imageUrl]);

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
      try {
        setIsLoading(true);
        setFullContent(null); // Reset content when article changes
        
        // Check cache first
        const cached = await contentFetcher.getCachedContent(article.id);
        if (cached) {
          setFullContent(cached);
          setIsLoading(false);
          return;
        }

        if (article.type === 'podcast') {
          // For podcasts, use the article description as content if full content is not available in cache
          setFullContent({
            title: article.title,
            content: article.content || '',
            textContent: article.contentSnippet || article.title,
            length: article.content?.length || 0,
            excerpt: article.contentSnippet || '',
            byline: '',
            dir: 'ltr',
            siteName: feed?.title || '',
            lang: 'it'
          });
          setIsLoading(false);
          return;
        }

        const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();
        let html = '';

        if (isNative) {
          const response = await CapacitorHttp.get({ url: article.link });
          if (response.status === 200) {
            html = response.data;
          } else {
            throw new Error(`Failed to fetch article: ${response.status}`);
          }
        } else {
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
            if (!readerImageUrl && contentToSave.content) {
              const newImageUrl = extractBestImage(contentToSave.content, article.link);
              if (newImageUrl) {
                const safeUrl = getSafeUrl(newImageUrl, '');
                if (safeUrl) {
                  setReaderImageUrl(safeUrl);
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

  const [sanitizedContent, setSanitizedContent] = useState<string>('');

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a.podcast-timestamp');
    if (link) {
      e.preventDefault();
      const timeStr = link.getAttribute('data-time');
      if (timeStr) {
        const timeInSeconds = parseDurationToSeconds(timeStr);
        if (currentTrack?.id === article.id) {
          seek(timeInSeconds);
        } else {
          play(article);
          setTimeout(() => seek(timeInSeconds), 500);
        }
      }
    }
  };

  useEffect(() => {
    const processContent = async () => {
      let contentToSanitize = fullContent?.content;
      
      // If fullContent doesn't have content, try fallback to article.content
      if ((contentToSanitize === undefined || contentToSanitize === null || contentToSanitize === '') && article.content) {
        contentToSanitize = he.decode(article.content);
      }
      
      if (!contentToSanitize) {
        setSanitizedContent('');
        return;
      }
      
      // Clean up superfluous text/empty tags
      let content = contentToSanitize;
      content = content.replace(/<p[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '');
      content = content.replace(/<div[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/div>/gi, '');
      content = content.replace(/<span[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/span>/gi, '');
      
      if (article.type === 'podcast') {
        // If there are no <p> or <br> tags, convert newlines to <br>
        if (!/<p\b[^>]*>/i.test(content) && !/<br\b[^>]*>/i.test(content)) {
          content = content.replace(/\n/g, '<br/>');
        }
        
        // Linkify URLs if there are no <a> tags
        if (!/<a\b[^>]*>/i.test(content)) {
          content = content.replace(/(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g, '<a href="$1">$1</a>');
        }

        // Linkify timestamps (e.g., 01:23:45 or 12:34)
        content = content.replace(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g, '<a href="#seek-$1" class="podcast-timestamp" data-time="$1">$1</a>');
      }

      const purifier = DOMPurify();

      purifier.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A') {
          node.setAttribute('rel', 'nofollow noopener noreferrer');
        }
        if (node.tagName === 'IFRAME') {
          node.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
        }
        if (node.hasAttribute('src')) {
          node.setAttribute('src', getSafeUrl(node.getAttribute('src'), ''));
        }
        if (node.hasAttribute('href')) {
          node.setAttribute('href', getSafeUrl(node.getAttribute('href'), ''));
        }
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

      const sanitized = purifier.sanitize(content, {
        ADD_ATTR: ['style', 'allow', 'allowfullscreen', 'frameborder', 'scrolling', 'controls', 'src', 'alt', 'width', 'height', 'srcset', 'sizes', 'sandbox', 'poster', 'preload', 'class', 'data-time'],
        ADD_TAGS: ['video', 'audio', 'source', 'iframe', 'img', 'figure', 'figcaption'],
        FORBID_ATTR: ['id', 'name'],
      });

      const doc = new DOMParser().parseFromString(sanitized, 'text/html');
      const videos = doc.querySelectorAll('video, iframe');
      
      // Ensure videos are responsive
      videos.forEach(v => {
        v.setAttribute('width', '100%');
        if (v.tagName === 'VIDEO') {
          v.setAttribute('height', 'auto');
        } else if (v.tagName === 'IFRAME') {
          // For iframes, we often need a fixed aspect ratio or it collapses
          // The CSS aspect-video class handles this, but we ensure width is 100%
          v.removeAttribute('height');
        }
      });

      // Now resolve images to local URLs if on native
      if (Capacitor.isNativePlatform()) {
        const imgs = doc.querySelectorAll('img');
        const promises = Array.from(imgs).map(async (img) => {
          const src = img.getAttribute('src');
          if (src && src.startsWith('http')) {
            try {
              const localUrl = await imagePersistence.getLocalUrl(src);
              if (localUrl) img.setAttribute('src', localUrl);
            } catch (e) {
              // Ignore errors
            }
          }
        });
        await Promise.all(promises);
      }
      
      setSanitizedContent(doc.body.innerHTML);
    };

    processContent();
  }, [fullContent?.content, article.content, article.imageUrl]);

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
          className="p-2 rounded-full hover:bg-gray-800"
          aria-label="Close article"
        >
          <X className="w-6 h-6 text-gray-200" aria-hidden="true" />
        </motion.button>
        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onPrev}
            disabled={!hasPrev}
            className="p-2 rounded-full hover:bg-gray-800 disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Previous article"
          >
            <ChevronUp className="w-6 h-6 text-gray-200" aria-hidden="true" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onNext}
            disabled={!hasNext}
            className="p-2 rounded-full hover:bg-gray-800 disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Next article"
          >
            <ChevronDown className="w-6 h-6 text-gray-200" aria-hidden="true" />
          </motion.button>
        </div>
      </div>

      {/* Article Content */}
      <div className="relative z-10 flex-1 px-4 pt-6 pb-12 max-w-3xl mx-auto w-full">
        {(readerImageUrl || (article.type === 'podcast' && feed?.imageUrl)) && (
          <CachedImage 
            key={`${article.id}-${readerImageUrl || feed?.imageUrl}`}
            src={getSafeUrl(readerImageUrl || (article.type === 'podcast' ? feed?.imageUrl : '') || '')}
            alt="" 
            className="w-full h-auto rounded-2xl mb-4 object-contain max-h-[80vh]"
            referrerPolicy="no-referrer"
          />
        )}

        <div className="text-sm text-gray-400 mb-3">
          {formattedDate} • {readTime}m read
        </div>

        <h1 className={`${getTitleSize()} font-bold text-white mb-4 leading-tight`}>
          <a 
            href={getSafeUrl(article.link)}
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:underline"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.title, { FORBID_ATTR: ['id', 'name'] }) }}
          />
        </h1>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-full">
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
            <span className="text-sm font-medium text-gray-300">{feed?.title || 'Unknown Source'}</span>
          </div>

          <div className="flex items-center gap-4 text-gray-400">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={async () => {
                const shareData = {
                  title: article.title,
                  text: article.title,
                  url: article.link,
                };

                try {
                  if (Capacitor.isNativePlatform()) {
                    await Share.share({
                      ...shareData,
                      dialogTitle: 'Condividi articolo'
                    });
                  } else if (navigator.share) {
                    await navigator.share(shareData);
                  } else {
                    // Fallback: copy to clipboard
                    await navigator.clipboard.writeText(`${article.title}\n${article.link}`);
                    alert('Link copiato negli appunti');
                  }
                } catch (err) {
                  console.error('Error sharing:', err);
                }
              }}
              className="hover:text-white transition-colors"
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
              className="hover:text-white transition-colors"
              aria-label={
                article.type === 'podcast' 
                  ? (isQueued ? "Remove from queue" : "Add to queue")
                  : (isFavorite ? "Remove from favorites" : "Add to favorites")
              }
            >
              {article.type === 'podcast' ? (
                <ListPlus className={`w-5 h-5 ${isQueued ? 'text-[var(--theme-color)]' : ''}`} aria-hidden="true" />
              ) : (
                <Bookmark className={`w-5 h-5 ${isFavorite ? 'fill-current text-[var(--theme-color)]' : ''}`} aria-hidden="true" />
              )}
            </motion.button>
          </div>
        </div>

        <hr className="border-gray-800 mb-6" />

        {article.type === 'podcast' && article.mediaUrl && (
          <div className="mb-8 p-6 bg-gray-900/50 rounded-3xl border border-gray-800 shadow-sm">
            <div className="flex flex-col gap-6">
              <ReaderProgressBar article={article} isCurrentTrack={isCurrentTrack} />

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
                  className={`p-2 rounded-full transition-colors ${prevInQueue ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700'}`}
                  aria-label="Previous in queue"
                >
                  <SkipBack className="w-6 h-6 fill-current" />
                </motion.button>

                <SeekButtonReader direction="backward" article={article} isCurrentTrack={isCurrentTrack} />

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

                <SeekButtonReader direction="forward" article={article} isCurrentTrack={isCurrentTrack} />

                <motion.button
                  whileTap={{ scale: 0.9 }}
                  disabled={!nextInQueue}
                  onClick={() => {
                    if (nextInQueue) {
                      play(nextInQueue);
                      onSelectArticle?.(nextInQueue);
                    }
                  }}
                  className={`p-2 rounded-full transition-colors ${nextInQueue ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-700'}`}
                  aria-label="Next in queue"
                >
                  <SkipForward className="w-6 h-6 fill-current" />
                </motion.button>
              </div>
            </div>
          </div>
        )}

        {article.type === 'podcast' && (article.chapters || article.chaptersUrl) && (
          <PodcastChapters article={article} isCurrentTrack={isCurrentTrack} />
        )}

        {isLoading ? (
          <div className="space-y-4 animate-pulse mt-8">
            <div className="h-4 bg-gray-800 rounded w-3/4"></div>
            <div className="h-4 bg-gray-800 rounded w-full"></div>
            <div className="h-4 bg-gray-800 rounded w-5/6"></div>
            <div className="h-4 bg-gray-800 rounded w-full"></div>
            <div className="h-40 bg-gray-800 rounded w-full mt-6"></div>
          </div>
        ) : sanitizedContent ? (
          <div 
            onClick={handleContentClick}
            className={`prose ${getProseSize()} prose-invert max-w-full overflow-hidden ${article.type === 'podcast' ? 'text-left' : 'text-left'}
              prose-img:rounded-xl prose-img:w-full prose-img:object-cover prose-img:max-w-full
              prose-video:w-full prose-video:rounded-xl
              [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-xl [&_iframe]:border-0
              prose-a:text-indigo-400 prose-headings:font-bold prose-headings:tracking-tight prose-p:leading-relaxed
              prose-pre:max-w-full prose-pre:overflow-x-auto`}
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />
        ) : (
          <div className={`prose ${getProseSize()} prose-invert max-w-full overflow-hidden text-center py-8`}>
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">
              We couldn't load the full content of this article.
            </p>
            <a 
              href={getSafeUrl(article.link)}
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-indigo-900/30 text-indigo-400 rounded-lg hover:bg-indigo-900/50 transition-colors no-underline"
            >
              Read original article
            </a>
          </div>
        )}
      </div>

    </motion.div>
  );
});

/**
 * ⚡ Bolt: Isolated progress bar for the article reader.
 */
const ReaderProgressBar = React.memo(function ReaderProgressBar({ article, isCurrentTrack }: { article: Article, isCurrentTrack: boolean }) {
  if (isCurrentTrack) {
    return <LiveReaderProgressBar article={article} />;
  }

  const totalSeconds = parseDurationToSeconds(article.duration);
  const currentSeconds = article.progress ? article.progress * totalSeconds : 0;
  const remainingSeconds = Math.max(0, totalSeconds - currentSeconds);
  const progressPercent = totalSeconds > 0 ? (currentSeconds / totalSeconds) * 100 : 0;

  return (
    <div className="flex items-center gap-4 text-xs font-bold text-indigo-400">
      <span className="w-14 flex-shrink-0 text-left whitespace-nowrap">{formatTime(currentSeconds)}</span>
      <div className="relative flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div 
          className="h-full bg-indigo-500 transition-all duration-300" 
          style={{ width: `${progressPercent}%` }} 
        />
      </div>
      <span className="w-14 flex-shrink-0 text-right whitespace-nowrap">{formatTime(remainingSeconds)}</span>
    </div>
  );
});

const LiveReaderProgressBar = ({ article }: { article: Article }) => {
  const { progress, duration } = useAudioProgress();
  const { seek } = useAudioState();
  
  const totalSeconds = duration > 0 ? duration : parseDurationToSeconds(article.duration);
  const currentSeconds = progress;
  const remainingSeconds = Math.max(0, totalSeconds - currentSeconds);
  const progressPercent = totalSeconds > 0 ? (currentSeconds / totalSeconds) * 100 : 0;

  return (
    <div className="flex items-center gap-4 text-xs font-bold text-indigo-400">
      <span className="w-14 flex-shrink-0 text-left whitespace-nowrap">{formatTime(currentSeconds)}</span>
      <div 
        className="relative flex-1 h-2 bg-gray-800 rounded-full overflow-hidden cursor-pointer"
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
      <span className="w-14 flex-shrink-0 text-right whitespace-nowrap">{formatTime(remainingSeconds)}</span>
    </div>
  );
}

/**
 * ⚡ Bolt: Isolated seek buttons for the article reader.
 */
function SeekButtonReader({ direction, article, isCurrentTrack }: { direction: 'forward' | 'backward', article: Article, isCurrentTrack: boolean }) {
  const { seek } = useAudioState();
  const { progress, duration } = useAudioProgress();

  const handleSeek = () => {
    if (!isCurrentTrack) return;
    
    if (direction === 'backward') {
      seek(Math.max(0, progress - 15));
    } else {
      seek(Math.min(duration, progress + 15));
    }
  };

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={handleSeek}
      disabled={!isCurrentTrack}
      className={cn(
        "p-2 rounded-full transition-colors",
        isCurrentTrack ? "text-gray-300 hover:bg-gray-800" : "text-gray-700"
      )}
      aria-label={direction === 'backward' ? "Back 15 seconds" : "Forward 15 seconds"}
    >
      <div className="relative">
        {direction === 'backward' ? <RotateCcw className="w-6 h-6" /> : <RotateCw className="w-6 h-6" />}
        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold mt-0.5">15</span>
      </div>
    </motion.button>
  );
}