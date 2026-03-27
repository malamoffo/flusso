import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, FileText, AlignLeft, X, Share2, Star, EyeOff } from 'lucide-react';
import { Article, FullArticleContent } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useRss } from '../context/RssContext';
import DOMPurify from 'dompurify';
import { getSafeUrl } from '../lib/utils';
import { CapacitorHttp } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Readability } from '@mozilla/readability';
import { fetchWithProxy } from '../utils/proxy';
import { contentFetcher } from '../utils/contentFetcher';
import { getColorSync } from 'colorthief';

interface ArticleReaderProps {
  key?: React.Key;
  article: Article;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export function ArticleReader({ article, onClose, onNext, onPrev, hasNext, hasPrev }: ArticleReaderProps) {
  const [fullContent, setFullContent] = useState<FullArticleContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [articleThemeColor, setArticleThemeColor] = useState<string | null>(null);
  const { settings, feeds, toggleFavorite, toggleRead } = useRss();
  const [isFavorite, setIsFavorite] = useState(article.isFavorite);

  useEffect(() => {
    setIsFavorite(article.isFavorite);
  }, [article.isFavorite]);

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

  const feed = feeds.find(f => f.id === article.feedId);
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
    if (!fullContent?.content) return '';
    
    // Clean up superfluous text/empty tags often left by poor formatting
    let content = fullContent.content;
    content = content.replace(/<p[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '');
    content = content.replace(/<div[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/div>/gi, '');
    content = content.replace(/<span[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/span>/gi, '');
    
    return DOMPurify.sanitize(content, {
      ADD_ATTR: ['style', 'allowfullscreen', 'frameborder', 'scrolling', 'controls'],
      ADD_TAGS: ['video', 'audio', 'source', 'iframe'],
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
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      onDragEnd={(e, info) => {
        const threshold = 100;
        if (info.offset.x > threshold && hasPrev && onPrev) {
          onPrev();
        } else if (info.offset.x < -threshold && hasNext && onNext) {
          onNext();
        }
      }}
      className={`fixed inset-0 z-50 overflow-y-auto overflow-x-hidden flex flex-col transition-colors break-words ${
        settings.theme === 'dark' && settings.pureBlack ? 'bg-black' : 'bg-white dark:bg-gray-950'
      }`}
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
        className={`sticky top-0 z-20 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between transition-colors ${
          settings.theme === 'dark' && settings.pureBlack ? 'bg-black/80' : 'bg-white/80 dark:bg-gray-950/80'
        }`}
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
        {article.imageUrl && (
          <img 
            src={getSafeUrl(article.imageUrl)}
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

        {article.contentSnippet && (
          <p 
            className="text-lg text-gray-600 dark:text-gray-300 mb-6 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.contentSnippet, { FORBID_ATTR: ['id', 'name'] }) }}
          />
        )}

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full">
            {article.link && (
              <img 
                src={`https://www.google.com/s2/favicons?domain=${(() => {
                  try { return new URL(article.link).hostname; }
                  catch { return ''; }
                })()}&sz=32`} 
                alt="" 
                className="w-4 h-4 rounded-sm"
                referrerPolicy="no-referrer"
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
                setIsFavorite(!isFavorite);
                toggleFavorite(article.id);
              }}
              className="hover:text-gray-900 dark:hover:text-white transition-colors"
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <Star className={`w-5 h-5 ${isFavorite ? 'fill-current text-amber-500' : ''}`} aria-hidden="true" />
            </motion.button>
          </div>
        </div>

        <hr className="border-gray-200 dark:border-gray-800 mb-6" />

        {hasMedia && (
          <div className="mb-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Media</h3>
            <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
              {article.mediaType?.startsWith('video/') ? (
                <video src={getSafeUrl(article.mediaUrl!)} controls className="w-full" />
              ) : article.mediaType?.startsWith('audio/') ? (
                <audio src={getSafeUrl(article.mediaUrl!)} controls className="w-full" />
              ) : null}
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
        ) : fullContent?.content ? (
          <div 
            className={`prose ${getProseSize()} prose-indigo dark:prose-invert max-w-full overflow-hidden
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
