import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, FileText, AlignLeft, X, Share2, Bookmark, EyeOff } from 'lucide-react';
import { Article, FullArticleContent } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useRss } from '../context/RssContext';
import DOMPurify from 'dompurify';
import { CapacitorHttp } from '@capacitor/core';
import { Readability } from '@mozilla/readability';
import { fetchWithProxy } from '../utils/proxy';
import { contentFetcher } from '../utils/contentFetcher';

interface ArticleReaderProps {
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
  const { settings, feeds, toggleFavorite, toggleRead } = useRss();

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const SWIPE_THRESHOLD = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const deltaX = touchStartX.current - touchEndX;
    const deltaY = Math.abs(touchStartY.current - touchEndY);

    // Ensure it's mostly a horizontal swipe
    if (Math.abs(deltaX) > SWIPE_THRESHOLD && deltaY < 100) {
      // Don't trigger if starting from the left edge (system back gesture)
      if (touchStartX.current < 30) return;

      if (deltaX > 0 && hasNext && onNext) {
        // Swiped left -> Next article
        onNext();
      } else if (deltaX < 0 && hasPrev && onPrev) {
        // Swiped right -> Previous article
        onPrev();
      }
    }
  };

  const feed = feeds.find(f => f.id === article.feedId);
  const readTime = fullContent?.textContent ? Math.max(1, Math.ceil(fullContent.textContent.split(/\s+/).length / 200)) : 1;
  const formattedDate = new Date(article.pubDate).toLocaleString('it-IT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

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

  const sanitizedContent = fullContent?.content ? DOMPurify.sanitize(fullContent.content, {
    ADD_ATTR: ['style'],
    ADD_TAGS: ['video', 'audio', 'source'],
  }) : '';

  const mediaElements = fullContent?.content ? new DOMParser().parseFromString(fullContent.content, 'text/html').querySelectorAll('video, audio') : [];
  const hasMedia = mediaElements.length > 0;

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-50 bg-white dark:bg-gray-950 overflow-y-auto overflow-x-hidden flex flex-col transition-colors break-words"
    >
      {/* Top App Bar */}
      <div 
        className="sticky top-0 z-10 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between transition-colors"
      >
        <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
          <ArrowLeft className="w-6 h-6 text-gray-800 dark:text-gray-200" />
        </button>
        <div className="flex items-center gap-2">
        </div>
      </div>

      {/* Article Content */}
      <div className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        {article.imageUrl && (
          <img 
            src={article.imageUrl} 
            alt="" 
            className="w-full aspect-video rounded-2xl mb-4 object-cover"
            referrerPolicy="no-referrer"
          />
        )}

        <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          {formattedDate} • {readTime}m read
        </div>

        <h1 className={`${getTitleSize()} font-bold text-gray-900 dark:text-white mb-4 leading-tight`}>
          <a 
            href={article.link} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:underline"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.title) }}
          />
        </h1>

        {article.contentSnippet && (
          <p 
            className="text-lg text-gray-600 dark:text-gray-300 mb-6 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.contentSnippet) }}
          />
        )}

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full">
            {feed?.imageUrl && <img src={feed.imageUrl} alt="" className="w-4 h-4 rounded-full" />}
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{feed?.title || 'Unknown Source'}</span>
          </div>

          <div className="flex items-center gap-4 text-gray-500 dark:text-gray-400">
            <button 
              onClick={() => {
                toggleRead(article.id);
                onClose();
              }}
              className="hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <EyeOff className="w-5 h-5" />
            </button>
            <button 
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: article.title, url: article.link });
                }
              }}
              className="hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <button 
              onClick={() => toggleFavorite(article.id)}
              className="hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <Bookmark className={`w-5 h-5 ${article.isFavorite ? 'fill-current text-indigo-500' : ''}`} />
            </button>
          </div>
        </div>

        <hr className="border-gray-200 dark:border-gray-800 mb-6" />

        {hasMedia && (
          <div className="mb-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Media</h3>
            {Array.from(mediaElements).map((el, i) => (
              <div key={i} className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                {el.tagName.toLowerCase() === 'video' ? (
                  <video src={(el as HTMLVideoElement).src} controls className="w-full" />
                ) : (
                  <audio src={(el as HTMLAudioElement).src} controls className="w-full" />
                )}
              </div>
            ))}
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
          <div className={`prose ${getProseSize()} prose-indigo dark:prose-invert max-w-full overflow-hidden`}>
            <p>No content available.</p>
          </div>
        )}
      </div>

    </motion.div>
  );
}
