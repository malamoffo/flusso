import React, { useEffect, useState, useRef } from 'react';
import { ArrowLeft, FileText, AlignLeft, X, Share2, Star, EyeOff, ListPlus, Play, Pause, SkipBack, SkipForward, RotateCcw, RotateCw, ChevronUp, ChevronDown, Calendar, User, ExternalLink, RefreshCw, Bookmark, List, FastForward } from 'lucide-react';
import { Article, FullArticleContent, PodcastChapter } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useRss } from '../context/RssContext';
import { useSettings } from '../context/SettingsContext';
import { useAudioStore } from '../store/audioStore';
import { useShallow } from 'zustand/react/shallow';
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
  const [isOpen, setIsOpen] = useState(false);
  const { seek, progress } = useAudioStore(useShallow(s => ({ seek: s.seek, progress: s.progress })));

  useEffect(() => {
    let extracted: PodcastChapter[] = [];
    if (article.chapters && article.chapters.length > 0) {
      extracted = article.chapters;
    } else if (!article.chaptersUrl) {
      // Try parsing from text
      const textToParse = ((article.content || '') + '\n' + (article.contentSnippet || '')).replace(/<br\s*\/?>|<\/p>|<p>/gi, '\n');
      const regex = /(?:^|\n)\s*(?:-|\*|\(|\[)?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:\)|\])?\s*(?:-|:)?\s*([^\n]+)/gi;
      let match;
      while ((match = regex.exec(textToParse)) !== null) {
        const timeStr = match[1];
        let title = match[2].trim().replace(/<\/?[^>]+(>|$)/g, ""); // strip html
        if (title.length > 80) title = title.substring(0, 80) + '...';
        
        const parts = timeStr.split(':').map(Number);
        let seconds = 0;
        if (parts.length === 3) {
          seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          seconds = parts[0] * 60 + parts[1];
        }
        
        if (title && !extracted.some(c => c.startTime === seconds)) {
          extracted.push({ startTime: seconds, title });
        }
      }
      extracted.sort((a, b) => a.startTime - b.startTime);
    }

    if (extracted.length > 0) {
      setChapters(extracted);
      return;
    }

    if (article.chaptersUrl) {
      setLoading(true);
      fetchWithProxy(article.chaptersUrl, false)
        .then(res => JSON.parse(res.data))
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
  }, [article.chapters, article.chaptersUrl, article.content, article.contentSnippet]);

  if (!chapters || chapters.length === 0) {
    if (loading) {
      return <div className="text-sm text-gray-400 animate-pulse text-center w-full mb-4">Caricamento capitoli...</div>;
    }
    return null;
  }

  return (
    <div className="w-full mb-4">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl font-medium text-gray-200 flex items-center justify-between transition-colors shadow-sm"
      >
        <span className="flex items-center gap-2"><List className="w-5 h-5 text-gray-400" /> Capitoli ({chapters.length})</span>
        <ChevronDown className={cn("w-5 h-5 transition-transform text-gray-400", isOpen ? "rotate-180" : "")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 mt-3 max-h-[35vh] overflow-y-auto pr-2 custom-scrollbar">
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
                      "w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center gap-3 group",
                      isCurrentChapter ? "bg-indigo-500/20 border border-indigo-500/30" : "hover:bg-white/10",
                      !isCurrentTrack && "cursor-default opacity-70"
                    )}
                  >
                    <div className={cn(
                      "text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0 transition-colors",
                      isCurrentChapter ? "text-indigo-300 bg-indigo-900/40" : "text-gray-400 bg-white/10 group-hover:bg-white/20"
                    )}>
                      {formatTime(chapter.startTime)}
                    </div>
                    {chapter.imageUrl && (
                      <CachedImage src={chapter.imageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0 bg-black/20" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={cn("text-sm font-medium truncate", isCurrentChapter ? "text-white" : "text-gray-300")}>
                        {chapter.title}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const ArticleReader = React.memo(function ArticleReader({ article, onClose, onNext, onPrev, onSelectArticle, hasNext, hasPrev }: ArticleReaderProps) {
  const [fullContent, setFullContent] = useState<FullArticleContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [articleThemeColor, setArticleThemeColor] = useState<string | null>(null);
  const [readerImageUrl, setReaderImageUrl] = useState<string | null>(article.imageUrl || null);
  const { feeds, articles, toggleFavorite, toggleQueue, toggleRead, updateArticle } = useRss();
  const { settings } = useSettings();
  const feed = feeds.find(f => f.id === article.feedId);
  const { play, currentTrack, isPlaying, isBuffering, toggle, seek } = useAudioStore(useShallow(s => ({
    play: s.play,
    currentTrack: s.currentTrack,
    isPlaying: s.isPlaying,
    isBuffering: s.isBuffering,
    toggle: s.toggle,
    seek: s.seek
  })));
  
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
    const isPodcast = article.type === 'podcast';
    switch (settings.fontSize) {
      case 'large': return isPodcast ? 'text-2xl' : 'text-3xl';
      case 'medium':
      default: return isPodcast ? 'text-xl' : 'text-2xl';
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
          const res = await fetchWithProxy(safeUrl, false);
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
        if (article.type === 'podcast') {
          v.parentNode?.removeChild(v);
          return;
        }
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
      className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden flex flex-col transition-colors break-words bg-black font-sans"
    >
      {/* Animated Background Gradients (Glass Style) */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

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

      {/* Article Content with Glass Container */}
      <div className="relative z-10 flex-1 py-4 px-2 sm:px-4 max-w-5xl mx-auto w-full">
        <div className="backdrop-blur-3xl bg-white/[0.03] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl mb-24">
          {(readerImageUrl || (article.type === 'podcast' && feed?.imageUrl)) && (
            <div className="relative group overflow-hidden bg-black/40">
              <CachedImage 
                key={`${article.id}-${readerImageUrl || feed?.imageUrl}`}
                src={getSafeUrl(readerImageUrl || (article.type === 'podcast' ? feed?.imageUrl : '') || '')}
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
                      if (article.type === 'podcast') {
                        setIsQueued(isQueued ? 0 : 1);
                        toggleQueue(article.id);
                      } else {
                        setIsFavorite(isFavorite ? 0 : 1);
                        toggleFavorite(article.id);
                      }
                    }
                  }}
                  className="transition-all duration-300"
                  aria-label={
                    article.type === 'podcast' 
                      ? (isQueued ? "Remove from queue" : "Add to queue")
                      : (isFavorite ? "Remove from favorites" : "Add to favorites")
                  }
                >
                  {article.type === 'podcast' ? (
                    <Star className={`w-5 h-5 ${isQueued ? 'fill-current text-yellow-500' : ''}`} aria-hidden="true" />
                  ) : (
                    <Star className={`w-5 h-5 ${isFavorite ? 'fill-current text-yellow-500' : ''}`} aria-hidden="true" />
                  )}
                </motion.button>
              </div>
            </header>

            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent w-full mb-12" />

            {article.type === 'podcast' && article.mediaUrl && (
              <div className="mb-12 p-8 bg-white/[0.02] rounded-[2rem] border border-white/10 shadow-inner">
                <div className="flex flex-col gap-8">
                  
                  <PodcastChapters article={article} isCurrentTrack={isCurrentTrack} />

                  <ReaderProgressBar article={article} isCurrentTrack={isCurrentTrack} />

                  {/* Controls */}
                  <div className="flex items-center justify-center gap-4 w-full max-w-[320px] mx-auto">
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      disabled={!prevInQueue}
                      onClick={() => {
                        if (prevInQueue) {
                          play(prevInQueue);
                          onSelectArticle?.(prevInQueue);
                        }
                      }}
                      className={`p-2 rounded-full transition-colors ${prevInQueue ? 'text-gray-300 hover:bg-white/10' : 'text-gray-700'}`}
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
                        "w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.4)] hover:bg-indigo-700 transition-all relative flex-shrink-0 group",
                        isLoadingAudio && "animate-pulse"
                      )}
                      aria-label={isPlaying && isCurrentTrack ? "Pause" : "Play"}
                    >
                      {isLoadingAudio ? (
                        <RefreshCw className="w-8 h-8 animate-spin" />
                      ) : isPlaying && isCurrentTrack ? (
                        <Pause className="w-8 h-8 fill-current transition-transform group-hover:scale-110" />
                      ) : (
                        <Play className="w-8 h-8 fill-current ml-1 transition-transform group-hover:scale-110" />
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
                      className={`p-2 rounded-full transition-colors ${nextInQueue ? 'text-gray-300 hover:bg-white/10' : 'text-gray-700'}`}
                      aria-label="Next in queue"
                    >
                      <SkipForward className="w-6 h-6 fill-current" />
                    </motion.button>
                  </div>
                </div>
              </div>
            )}

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
  const { progress, duration, seek } = useAudioStore(useShallow(s => ({
    progress: s.progress,
    duration: s.duration,
    seek: s.seek
  })));
  
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
  const { seek, progress, duration } = useAudioStore(useShallow(s => ({
    seek: s.seek,
    progress: s.progress,
    duration: s.duration
  })));

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