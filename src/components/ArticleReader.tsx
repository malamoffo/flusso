import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, FileText, AlignLeft, X, Share2, Star, EyeOff, ChevronUp, ChevronDown, Calendar, User, ExternalLink, RefreshCw, Bookmark, List, FastForward } from 'lucide-react';
import { Article, FullArticleContent } from '../types';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { useRss } from '../context/RssContext';
import { useSettings } from '../context/SettingsContext';
import DOMPurify from 'dompurify';
import he from 'he';
import { CachedImage } from './CachedImage';
import { cn, getSafeUrl } from '../lib/utils';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { imagePersistence } from '../utils/imagePersistence';
import { Readability } from '@mozilla/readability';
import { fetchWithProxy } from '../utils/proxy';
import { contentFetcher } from '../utils/contentFetcher';
import { extractBestImage } from '../services/rssParser';

interface ArticleReaderProps {
  key?: React.Key;
  article: Article;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onSelectArticle?: (article: Article) => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  sourceFilter?: string;
}

export const ArticleReader = React.memo(function ArticleReader({ article, onClose, onNext, onPrev, hasNext, hasPrev, sourceFilter = 'inbox' }: ArticleReaderProps) {
  const controls = useDragControls();
  const [fullContent, setFullContent] = useState<FullArticleContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [articleThemeColor, setArticleThemeColor] = useState<string | null>(null);
  const [readerImageUrl, setReaderImageUrl] = useState<string | null>(article.imageUrl || null);
  const [isFavorite, setIsFavorite] = useState(article.isFavorite);
  const { feeds, toggleFavorite, toggleRead } = useRss();
  const { settings } = useSettings();
  const feed = feeds.find(f => f.id === article.feedId);

  useEffect(() => {
    setIsFavorite(article.isFavorite);
    setReaderImageUrl(article.imageUrl || null);
  }, [article.id, article.isFavorite, article.imageUrl]);

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
      case 'large': return 'prose-lg';
      case 'medium':
      default: return 'prose-base';
    }
  };

  const getTitleSize = () => {
    switch (settings.fontSize) {
      case 'large': return 'text-3xl';
      case 'medium':
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

        const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();
        let html = '';
        const safeUrl = getSafeUrl(article.link, article.link);

        if (isNative) {
          let currentUrl = safeUrl;
          let maxRedirects = 3;
          
          while (maxRedirects > 0) {
            const response = await CapacitorHttp.get({ url: currentUrl });
            if (response.status === 200) {
              html = response.data;
              break;
            } else if ([301, 302, 303, 307, 308].includes(response.status)) {
              const location = response.headers['Location'] || response.headers['location'];
              if (location) {
                currentUrl = getSafeUrl(location, location);
                maxRedirects--;
              } else {
                throw new Error(`Redirect without location: ${response.status}`);
              }
            } else {
              throw new Error(`Failed to fetch article: ${response.status}`);
            }
          }
        } else {
          const res = await fetchWithProxy(safeUrl, false, undefined, undefined, undefined, undefined, true);
          html = res.data;
        }

        if (html) {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          
          // Add base tag to help resolve relative URLs during parsing
          const base = doc.createElement('base');
          base.href = article.link;
          doc.head.appendChild(base);

          const reader = new Readability(doc);
          const articleData = reader.parse();

          if (articleData && articleData.content && articleData.content.length > 200) {
            const contentToSave = {
              title: articleData.title || '',
              content: articleData.content || '',
              textContent: articleData.textContent || '',
              length: articleData.length || 0,
              excerpt: articleData.excerpt || '',
              byline: articleData.byline || '',
              dir: articleData.dir || '',
              siteName: articleData.siteName || '',
              lang: articleData.lang || '',
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
          } else {
            console.warn('[READER] Readability parsed content is too short or empty, falling back to feed content');
            // If readability fails to get substantial content, we still set a minimal object 
            // to stop the loading state, but it will fallback to article.content in processContent
            setFullContent({
              title: article.title,
              content: '',
              textContent: '',
              length: 0,
              excerpt: '',
              byline: '',
              dir: 'ltr',
              siteName: '',
              lang: ''
            });
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
    // Basic handler if needed
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

      // --- DEEP CLEANING: Remove labels and boilerplate ---
      // 1. Remove leading/trailing boilerplate patterns (Source:, Written by:, etc.)
      const boilerplatePatterns = [
        /^(<p[^>]*>)?\s*(Source|Written by|Autor|By|Di|Fonte|Traduzione di|Articolo originale|Traduzione|Pubblicato il|Ore fa|Minuti fa)\s*[:\-\u2013\u2014].*?<\/p>/i,
        /<p[^>]*>\s*(Leggi anche|Continua a leggere|Condividi|Tags|Etichette|Potrebbe interessarti|Sostienici|Sito ufficiale|Seguici su|Iscriviti alla newsletter)\s*[:\-\u2013\u2014].*?<\/p>\s*$/i,
        /^(<p[^>]*>)?\s*(Photo|Immagine|Credit)\s*[:\-\u2013\u2014].*?<\/p>/i,
        /<p[^>]*>\s*(L'articolo|Questo post).*?apparsa su.*?<\/p>/i
      ];

      boilerplatePatterns.forEach(pattern => {
        content = content.replace(pattern, '');
      });

      // 2. Remove redundant title at the start if it exactly matches
      if (article.title) {
        const strippedTitle = article.title.replace(/[^\w\s]/g, '').toLowerCase().trim();
        const firstParaMatch = content.match(/<p[^>]*>(.*?)<\/p>/i);
        if (firstParaMatch) {
          const firstParaText = firstParaMatch[1].replace(/<\/?[^>]+(>|$)/g, "").replace(/[^\w\s]/g, '').toLowerCase().trim();
          // If the first paragraph is essentially the title, or a very short "Source: Title" string, remove it
          if (firstParaText === strippedTitle || (firstParaText.length < strippedTitle.length + 10 && firstParaText.includes(strippedTitle))) {
            content = content.replace(/<p[^>]*>.*?<\/p>/i, '');
          }
        }
      }

      content = content.replace(/<p[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '');
      content = content.replace(/<div[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/div>/gi, '');
      content = content.replace(/<span[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/span>/gi, '');

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
          
          // Improved deduplication check
          const isDuplicateOfCover = (() => {
            if (!article.imageUrl) return false;
            
            // Direct comparison
            if (src === article.imageUrl) return true;
            
            // Comparison ignoring protocol
            const normalize = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
            if (normalize(src) === normalize(article.imageUrl)) return true;
            
            // Comparison based on filename/path (ignoring query params)
            const getPath = (url: string) => {
              try {
                const u = new URL(url.startsWith('//') ? `https:${url}` : url.startsWith('/') ? `https://base.com${url}` : url);
                return u.pathname;
              } catch (e) {
                return url;
              }
            };
            const pathA = getPath(src);
            const pathB = getPath(article.imageUrl);
            if (pathA === pathB && pathA.length > 5 && (pathA.includes('.') || pathA.includes('/'))) return true;

            return false;
          })();

          if (
            isDuplicateOfCover ||
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

  useEffect(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => { 
      document.body.style.overflow = '';
      document.body.style.paddingRight = ''; 
    };
  }, []);

  return (
    <>
      <motion.div 
        key={`backdrop-${article.id}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed inset-0 bg-black/80 z-[40]"
        onClick={onClose}
      />
      <motion.article 
        key={`modal-${article.id}`}
        layoutId={`article-${article.id}-${sourceFilter}`}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 z-50 h-[92vh] overflow-hidden flex flex-col transition-colors break-words font-sans bg-[#0A0A10] sm:bg-[#0A0A10]/95 sm:backdrop-blur-xl rounded-t-[2.5rem] border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] will-change-transform isolate"
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.1, bottom: 0.8 }}
        onDragEnd={(e, info) => {
          if (info.offset.y > 100 || info.velocity.y > 500) {
            onClose();
          }
        }}
      >
        <div 
          onPointerDown={(e) => controls.start(e)}
          className="absolute top-0 left-0 right-0 h-12 z-[60] cursor-grab active:cursor-grabbing flex items-center justify-center pointer-events-auto touch-none"
        >
          <div className="w-12 h-1.5 bg-white/20 rounded-full" />
        </div>
        
        {/* Top App Bar */}
        <div className="sticky top-0 z-20 px-4 py-6 mt-4 flex items-center justify-between bg-gradient-to-b from-[#0A0A10]/90 to-[#0A0A10]/0 pointer-events-none">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 border border-white/20 active:bg-white/20 text-white pointer-events-auto backdrop-blur-md"
            aria-label="Close article"
          >
            <ArrowLeft className="w-5 h-5 text-gray-200" aria-hidden="true" />
          </motion.button>
          <div className="flex items-center gap-2 pointer-events-auto">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onPrev}
              disabled={!hasPrev}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 border border-white/20 active:bg-white/20 text-white backdrop-blur-md disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Previous article"
            >
              <ChevronUp className="w-5 h-5 text-gray-200" aria-hidden="true" />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onNext}
              disabled={!hasNext}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 border border-white/20 active:bg-white/20 text-white backdrop-blur-md disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Next article"
            >
              <ChevronDown className="w-5 h-5 text-gray-200" aria-hidden="true" />
            </motion.button>
          </div>
        </div>

        {/* Article Content with Glass Container */}
        <div className="relative z-10 flex-1 px-2 sm:px-4 max-w-5xl mx-auto w-full pb-20 overflow-y-auto overscroll-contain">
        <div className="bg-[#12121A] sm:bg-white/[0.03] sm:backdrop-blur-3xl border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl mb-24">
          {readerImageUrl && (
            <div className="relative group overflow-hidden bg-black/40">
              <CachedImage 
                key={`${article.id}-${readerImageUrl}`}
                src={getSafeUrl(readerImageUrl || '')}
                alt="" 
                className="w-full h-auto object-contain max-h-[85vh] transition-transform duration-700 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </div>
          )}

          <div className="p-3 sm:p-6 lg:p-8">
            <header className="mb-12 text-center max-w-5xl mx-auto">
              <div className="flex flex-col items-center gap-6 mb-4">
                <div className="flex items-center justify-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                    {article.link && (
                      <CachedImage 
                        src={`https://icons.duckduckgo.com/ip3/${(() => {
                          try { return new URL(article.link).hostname; }
                          catch { return ''; }
                        })()}.ico`} 
                        alt="" 
                        className="w-4 h-4 rounded-full opacity-80"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://www.google.com/s2/favicons?domain=${(() => {
                            try { return new URL(article.link).hostname; }
                            catch { return ''; }
                          })()}&sz=32`;
                        }}
                      />
                    )}
                    <span className="text-indigo-400 text-xs font-bold tracking-[0.1em] block uppercase">
                      {feed?.title || 'Unknown Source'}
                    </span>
                  </div>
                  <span className="text-gray-500 text-xs font-medium uppercase tracking-wider">{formattedDate}</span>
                </div>
                
                <h1 className={`${getTitleSize()} font-black text-white leading-[1.1] tracking-tight`}>
                  <a 
                    href={getSafeUrl(article.link)}
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="hover:text-indigo-400 transition-colors"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.title, { FORBID_ATTR: ['id', 'name'] }) }}
                  />
                </h1>

                <div className="text-gray-500 text-[10px] uppercase tracking-[0.2em] font-black opacity-60">
                  {readTime} MIN READ
                </div>
              </div>

              <div className="flex items-center justify-center gap-8 mt-8 text-gray-500">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  whileHover={{ scale: 1.1, color: '#fff' }}
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
                  className="transition-all duration-300"
                  aria-label="Share article"
                >
                  <Share2 className="w-5 h-5" aria-hidden="true" />
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  whileHover={{ scale: 1.1, color: '#fff' }}
                  onClick={() => {
                    if (article) {
                      setIsFavorite(isFavorite ? 0 : 1);
                      toggleFavorite(article.id);
                    }
                  }}
                  className="transition-all duration-300"
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <Star className={`w-5 h-5 ${isFavorite ? 'fill-current text-yellow-500' : ''}`} aria-hidden="true" />
                </motion.button>
              </div>
            </header>

            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent w-full mb-12" />

            {isLoading ? (
              <div className="space-y-6 animate-pulse mt-8 max-w-4xl mx-auto">
                <div className="h-4 bg-white/10 rounded w-3/4"></div>
                <div className="h-4 bg-white/10 rounded w-full"></div>
                <div className="h-4 bg-white/10 rounded w-5/6"></div>
                <div className="h-4 bg-white/10 rounded w-full"></div>
                <div className="h-4 bg-white/10 rounded w-2/3"></div>
                <div className="h-64 bg-white/10 rounded-2xl w-full mt-10"></div>
              </div>
            ) : sanitizedContent ? (
              <div 
                onClick={handleContentClick}
                className={`prose ${getProseSize()} prose-invert max-w-4xl mx-auto overflow-hidden leading-[1.75] text-gray-200 font-serif
                  prose-img:rounded-2xl prose-img:w-full prose-img:object-cover prose-img:max-w-full prose-img:my-10 prose-img:shadow-2xl
                  prose-video:w-full prose-video:rounded-2xl prose-video:my-10
                  [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-2xl [&_iframe]:border-0 [&_iframe]:my-10 [&_iframe]:shadow-2xl
                  prose-a:text-indigo-400 prose-a:decoration-indigo-400/30 prose-a:underline-offset-4 hover:prose-a:decoration-indigo-400 transition-all
                  prose-headings:font-sans prose-headings:font-black prose-headings:tracking-tight prose-headings:text-white prose-headings:mt-12 prose-headings:mb-6
                  prose-p:mb-8 prose-li:mb-2
                  prose-pre:max-w-full prose-pre:overflow-x-auto prose-pre:rounded-2xl prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10
                  [&>blockquote]:relative [&>blockquote]:border-l-4 [&>blockquote]:border-indigo-500 [&>blockquote]:bg-white/[0.03] [&>blockquote]:py-8 [&>blockquote]:px-8 [&>blockquote]:rounded-r-2xl [&>blockquote]:my-12
                  [&>blockquote]:text-xl sm:text-2xl [&>blockquote]:font-medium [&>blockquote]:italic [&>blockquote]:text-gray-100
                  [&>blockquote_p:before]:content-none [&>blockquote_p:after]:content-none`}
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
        </div>
      </div>
    </motion.article>
    </>
  );
});
