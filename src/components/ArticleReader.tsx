import React, { useEffect, useLayoutEffect, useState, useRef, useMemo } from 'react';
import { ArrowLeft, FileText, AlignLeft, X, Share2, Star, EyeOff, ChevronUp, ChevronDown, Calendar, User, ExternalLink, RefreshCw, Bookmark, List, FastForward, ChevronLeft, ChevronRight } from 'lucide-react';
import { Article, FullArticleContent } from '../types';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { useRss } from '../context/RssContext';
import { useSettings } from '../context/SettingsContext';
import DOMPurify from 'dompurify';
import he from 'he';
import { CachedImage } from './CachedImage';
import { cn, getSafeUrl, resolveUrl } from '../lib/utils';
import { RotatingImageCarousel } from './RotatingImageCarousel';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { isPluginAvailable, isNative } from '../utils/platform';
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
  
  // Render-time state synchronization when article changes to avoid stale/flickering render
  const initialContent = useMemo(() => contentFetcher.getCachedContentSync(article.id), [article.id]);
  const [prevArticleId, setPrevArticleId] = useState(article.id);
  const [fullContent, setFullContent] = useState<FullArticleContent | null>(initialContent);
  const [isLoading, setIsLoading] = useState(!initialContent);
  const [articleThemeColor, setArticleThemeColor] = useState<string | null>(null);
  const [readerImageUrl, setReaderImageUrl] = useState<string | null>(article.imageUrl || null);
  const [isFavorite, setIsFavorite] = useState(article.isFavorite);
  const [carouselIndex, setCarouselIndex] = useState(0);

  if (article.id !== prevArticleId) {
    const freshInitial = contentFetcher.getCachedContentSync(article.id);
    setPrevArticleId(article.id);
    setIsLoading(!freshInitial);
    setFullContent(freshInitial);
    setReaderImageUrl(article.imageUrl || null);
    setIsFavorite(article.isFavorite);
    setCarouselIndex(0);
  }

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [article.id]);

  const { feeds, toggleFavorite, toggleRead, updateArticle } = useRss();
  const { settings } = useSettings();
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
      let cached: FullArticleContent | null = null;
      let hasSetContent = false;
      try {
        const syncCached = contentFetcher.getCachedContentSync(article.id);
        if (syncCached && syncCached.isScraped) {
          setFullContent(syncCached);
          setIsLoading(false);
          return;
        }

        setIsLoading(true);
        
        // Check cache first
        cached = await contentFetcher.getCachedContent(article.id);
        if (cached) {
          // If already scraped via proxy/readability, use it directly
          if (cached.isScraped) {
            setFullContent(cached);
            hasSetContent = true;
            setIsLoading(false);
            return;
          }

          const textLength = cached.textContent ? cached.textContent.trim().length : (() => {
            try {
              const doc = new DOMParser().parseFromString(cached.content || '', 'text/html');
              return (doc.body?.textContent || '').trim().length;
            } catch (e) {
              return 0;
            }
          })();
          
          // Verify if this is already a full scraped article (has textContent and is of decent length)
          const looksLikeFullArticle = cached.textContent && textLength > 1500;
          
          if (looksLikeFullArticle) {
            setFullContent(cached);
            hasSetContent = true;
            setIsLoading(false);
            return;
          }
        }

        const isNativePlatform = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform();
        const isWeb = typeof window !== 'undefined' && (window as any).Capacitor?.getPlatform() === 'web';
        const isNativeHttp = !isWeb && isNativePlatform && (() => {
          try {
            return (window as any).Capacitor?.isPluginAvailable?.('CapacitorHttp');
          } catch (e) {
            return false;
          }
        })();
        let html = '';
        const safeUrl = getSafeUrl(article.link, article.link);

        if (isNativeHttp) {
          try {
            let currentUrl = safeUrl;
            let maxRedirects = 3;
            
            while (maxRedirects > 0) {
              const response = await CapacitorHttp.get({ 
                url: currentUrl,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                }
              });
              if (response.status === 200) {
                html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
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
          } catch (e: any) {
            const res = await fetchWithProxy(safeUrl, false, undefined, undefined, undefined, undefined, true);
            html = res.data;
          }
        } else {
          const res = await fetchWithProxy(safeUrl, false, undefined, undefined, undefined, undefined, true);
          html = res.data;
        }

        if (html) {
          // Transform <media:thumbnail url="..."> and <media:content url="..."> to <img src="...">
          // These are non-standard tags that Readability might strip
          html = html.replace(/<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*\/?>/gi, '<img src="$1" />');
          html = html.replace(/<media:content[^>]+url=["']([^"']+)["'][^>]*\/?>/gi, '<img src="$1" />');

          const doc = new DOMParser().parseFromString(html, 'text/html');
          
          // Add base tag to help resolve relative URLs during parsing
          const base = doc.createElement('base');
          base.href = article.link;
          doc.head.appendChild(base);

          const reader = new Readability(doc);
          let articleData = reader.parse();

          // Check for "read more" link and fetch full content if detected
          if (articleData && articleData.content) {
            const findFullArticleLink = (doc: Document): string | null => {
              const links = Array.from(doc.querySelectorAll('a'));
              const patterns = [/leggi tutto/i, /read more/i, /continua a leggere/i, /full article/i];
              for (let i = links.length - 1; i >= Math.max(0, links.length - 5); i--) {
                const link = links[i];
                if (patterns.some(p => p.test(link.textContent || ''))) {
                  return link.getAttribute('href');
                }
              }
              return null;
            };

            const fullArticleUrl = findFullArticleLink(doc);
            if (fullArticleUrl) {
              try {
                const resolvedUrl = new URL(fullArticleUrl, article.link).toString();
                const fullResData = isNativeHttp ? (await CapacitorHttp.get({ 
                  url: resolvedUrl,
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                  }
                })).data : (await fetchWithProxy(resolvedUrl, false, undefined, undefined, undefined, undefined, true)).data;
                const fullDoc = new DOMParser().parseFromString(fullResData, 'text/html');
                const fullReader = new Readability(fullDoc);
                const fullArticleData = fullReader.parse();
                if (fullArticleData && fullArticleData.content) {
                  articleData = fullArticleData;
                }
              } catch (e) {
                console.warn(`[READER] Failed to fetch full article link: ${fullArticleUrl}`, e);
              }
            }
          }

          let finalScrapedContent = '';
          if (articleData && articleData.content && articleData.content.length > 150) {
            finalScrapedContent = articleData.content;
          } else {
            const contentSelectors = [
              'article', '[itemprop="articleBody"]', 'main', '.article-content', '.post-content', '.entry-content', 
              '.article-body', '.post-body', '#article-body', '.story-content', '.main-content', '.entry', '.post'
            ];
            for (const selector of contentSelectors) {
              const el = doc.querySelector(selector);
              if (el && el.textContent && el.textContent.trim().length > 150) {
                finalScrapedContent = el.innerHTML;
                break;
              }
            }
            if (!finalScrapedContent && articleData && articleData.content) {
              finalScrapedContent = articleData.content;
            }
            if (!finalScrapedContent && doc.body) {
              const cleanBodyText = doc.body.textContent || '';
              if (cleanBodyText.trim().length > 150) {
                finalScrapedContent = doc.body.innerHTML;
              }
            }
          }

          if (finalScrapedContent && finalScrapedContent.length > 150) {
            const contentToSave: FullArticleContent = {
              title: articleData?.title || article.title || '',
              content: finalScrapedContent,
              textContent: articleData?.textContent || '',
              length: finalScrapedContent.length,
              excerpt: articleData?.excerpt || '',
              byline: articleData?.byline || '',
              dir: articleData?.dir || 'ltr',
              siteName: articleData?.siteName || '',
              lang: articleData?.lang || '',
              isScraped: true,
            };
            setFullContent(contentToSave);
            hasSetContent = true;
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
            const fallbackContentObj: FullArticleContent = cached ? {
              ...cached,
              isScraped: true
            } : {
              title: article.title,
              content: article.content || '',
              textContent: article.contentSnippet || '',
              length: article.content?.length || 0,
              excerpt: article.contentSnippet || '',
              byline: '',
              dir: 'ltr',
              siteName: '',
              lang: '',
              isScraped: true
            };
            setFullContent(fallbackContentObj);
            contentFetcher.setCachedContent(article.id, fallbackContentObj);
            hasSetContent = true;
          }
        } else {
          // If html retrieve resulted in empty content, fall back to cached content
          const fallbackContentObj: FullArticleContent = cached ? {
            ...cached,
            isScraped: true
          } : {
            title: article.title,
            content: article.content || '',
            textContent: article.contentSnippet || '',
            length: article.content?.length || 0,
            excerpt: article.contentSnippet || '',
            byline: '',
            dir: 'ltr',
            siteName: '',
            lang: '',
            isScraped: true
          };
          setFullContent(fallbackContentObj);
          contentFetcher.setCachedContent(article.id, fallbackContentObj);
          hasSetContent = true;
        }
      } catch (error) {
        console.error('[READER] Error fetching full content:', error);
        if (!hasSetContent) {
          const fallbackContentObj: FullArticleContent = cached ? {
            ...cached,
            isScraped: true
          } : {
            title: article.title,
            content: article.content || '',
            textContent: article.contentSnippet || '',
            length: article.content?.length || 0,
            excerpt: article.contentSnippet || '',
            byline: '',
            dir: 'ltr',
            siteName: '',
            lang: '',
            isScraped: true
          };
          setFullContent(fallbackContentObj);
          contentFetcher.setCachedContent(article.id, fallbackContentObj);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchFullContent();
  }, [article.link, article.id]);

  const contentRef = useRef<HTMLDivElement>(null);

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Basic handler if needed
  };

  const sanitizedContent = useMemo(() => {
    if (isLoading) {
      return '';
    }

    let contentToSanitize = fullContent?.content;
    
    // If fullContent doesn't have content, try fallback to article.content
    if ((contentToSanitize === undefined || contentToSanitize === null || contentToSanitize === '') && article.content) {
      contentToSanitize = he.decode(article.content);
    }
    
    if (!contentToSanitize) {
      return '';
    }
    
    // Clean up superfluous text/empty tags
    let content = contentToSanitize;

    // Transform <media:thumbnail url="..."> to <img src="...">
    // This is often found in RSS feed contents but not rendered by browsers directly
    content = content.replace(/<media:thumbnail[^>]+url=["']([^"']+)["'][^>]*\/?>/gi, '<img src="$1" />');
    content = content.replace(/<media:content[^>]+url=["']([^"']+)["'][^>]*\/?>/gi, '<img src="$1" />');

    // --- DEEP CLEANING: Remove labels and boilerplate ---
    // 1. Remove leading/trailing boilerplate patterns (Source:, Written by:, etc.)
    const boilerplatePatterns = [
      /^(<p[^>]*>)?\s*(Source|Written by|Autor|By|Di|Fonte|Traduzione di|Articolo originale|Traduzione|Pubblicato il|Ore fa|Minuti fa|Aggiornato il|Last updated|Reading time|Tempo di lettura|Credits|Foto di|Photocredit|Immagine di|Copertina di|Illustrazione di|Sintesi|In breve|TL;DR|Autore|Data pubblicazione)\s*[:\-\u2013\u2014].*?<\/p>/i,
      /<p[^>]*>\s*(Leggi anche|Continua a leggere|Condividi|Tags|Etichette|Potrebbe interessarti|Sostienici|Sito ufficiale|Seguici su|Iscriviti alla newsletter|Abbonati|Sostieni il giornalismo|Se ti è piaciuto l'articolo|Fai una donazione|Seguici sui social|Commenta l'articolo)\s*[:\-\u2013\u2014].*?<\/p>\s*$/i,
      /^(<p[^>]*>)?\s*(Photo|Immagine|Credit|Copyright)\s*[:\-\u2013\u2014].*?<\/p>/i,
      /<p[^>]*>\s*(L'articolo|Questo post).*?apparsa su.*?<\/p>/i,
      /^(<p[^>]*>)?\s*(In breve|Sintesi|TL;DR)\s*[:\-\u2013\u2014].*?<\/p>/i,
      /<p[^>]*>\s*(Fonte foto|Credit foto|Ufficio stampa|Redazione|Link correlati|Argomenti|Temi).*?<\/p>/gi
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

      if (node.tagName === 'IMG') {
        const possibleSrcs = ['data-src', 'data-lazy-src', 'data-original', 'srcset', 'data-srcset'];
        let finalSrc = node.getAttribute('src');
        // Improved check for placeholder images (GIFs, SVGs, or any data URL pixel)
        const isPlaceholder = !finalSrc || 
                             finalSrc.includes('data:image/gif') || 
                             finalSrc.includes('data:image/svg') || 
                             finalSrc.startsWith('data:image/') ||
                             finalSrc === '';
                             
        if (isPlaceholder) {
           for (const attr of possibleSrcs) {
              if (node.hasAttribute(attr)) {
                 const val = node.getAttribute(attr);
                 const parsed = val ? val.split(' ')[0] : '';
                 if (parsed && !parsed.startsWith('data:image/')) {
                    finalSrc = parsed;
                    break;
                 }
              }
           }
        }
        if (finalSrc) {
          node.setAttribute('src', finalSrc);
        }
        node.removeAttribute('srcset');
        node.removeAttribute('sizes');
      }

      if (node.hasAttribute('src')) {
        let src = node.getAttribute('src') || '';
        if (src) {
          src = resolveUrl(src, article.link);
          node.setAttribute('src', getSafeUrl(src, ''));
        }
      }
      if (node.hasAttribute('href')) {
        let href = node.getAttribute('href') || '';
        if (href && !href.startsWith('#')) {
          href = resolveUrl(href, article.link);
          node.setAttribute('href', getSafeUrl(href, ''));
        }
      }

      if (node.tagName === 'IMG') {
        const src = node.getAttribute('src') || '';
        const lowerSrc = src.toLowerCase();
        const width = parseInt(node.getAttribute('width') || '0', 10);
        const height = parseInt(node.getAttribute('height') || '0', 10);
        
        // Improved deduplication check
        const isDuplicateOfCover = (() => {
          const coverUrl = readerImageUrl || article.imageUrl; // Use current reader image if available
          if (!coverUrl) return false;
          
          // Direct comparison
          if (src === coverUrl) return true;
          
          // Comparison ignoring protocol
          const normalize = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/+$/, '').split('?')[0];
          if (normalize(src) === normalize(coverUrl)) return true;
          
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
          const pathB = getPath(coverUrl);
          if (pathA === pathB && pathA.length > 8 && (pathA.includes('.') || pathA.includes('/'))) return true;

          return false;
        })();

        // If it has a caption (is inside a figure or has a figcaption sibling), we should PROBABLY keep it
        // even if it matches deduplication, because it's part of the narrative content.
        const hasCaption = node.closest('figure') !== null || 
                          node.nextElementSibling?.tagName === 'FIGCAPTION' ||
                          node.parentElement?.querySelector('figcaption') !== null;

        if (
          (isDuplicateOfCover && !hasCaption) ||
          lowerSrc.includes('1x1') ||
          lowerSrc.includes('pixel') ||
          lowerSrc.includes('tracker') ||
          lowerSrc.includes('/1/1/') || // common 1x1 pattern
          lowerSrc.includes('feedburner') ||
          (width > 0 && width <= 20) || // Increased from 10 to catch more pixels
          (height > 0 && height <= 20)
        ) {
          // Only remove if it's NOT a logo we might want to keep (optional, keep strict for now)
          // But if it's small and has no alt text, it's definitely a tracker
          const hasAlt = !!node.getAttribute('alt');
          if (!hasAlt || (width > 0 && width <= 5)) {
            node.parentNode?.removeChild(node);
          }
        }
      }
    });

    const sanitized = purifier.sanitize(content, {
      ADD_ATTR: ['style', 'allow', 'allowfullscreen', 'frameborder', 'scrolling', 'controls', 'src', 'alt', 'width', 'height', 'srcset', 'sizes', 'sandbox', 'poster', 'preload', 'class', 'data-time'],
      ADD_TAGS: ['video', 'audio', 'source', 'iframe', 'img', 'figure', 'figcaption'],
      FORBID_ATTR: ['id', 'name'],
    });

    const doc = new DOMParser().parseFromString(sanitized, 'text/html');
    const videos = doc.querySelectorAll('video');
    videos.forEach(v => {
      v.setAttribute('width', '100%');
      v.setAttribute('height', 'auto');
      v.setAttribute('controls', 'true');
      v.setAttribute('playsinline', 'true');
      v.setAttribute('preload', 'metadata');
      v.style.borderRadius = '1rem';
      v.style.marginTop = '1rem';
      v.style.marginBottom = '1rem';
      v.style.backgroundColor = '#000';
    });

    const audios = doc.querySelectorAll('audio');
    audios.forEach(a => {
      a.setAttribute('controls', 'true');
      a.setAttribute('preload', 'metadata');
      a.style.width = '100%';
      a.style.marginTop = '1rem';
      a.style.marginBottom = '1rem';
    });

    const iframes = doc.querySelectorAll('iframe');
    iframes.forEach(v => {
      v.setAttribute('width', '100%');
      v.removeAttribute('height');
    });

    // Handle images optimally:
    // Don't await background downloads because that blocks article rendering.
    // We will handle downloading and updating src in a separate useEffect.
    const imgs = doc.querySelectorAll('img');
    Array.from(imgs).forEach((img) => {
      img.setAttribute('referrerPolicy', 'no-referrer');
      let src = img.getAttribute('src');
      if (src && src.startsWith('http') && !src.includes('_capacitor_file_')) {
        try {
          const urlObj = new URL(src);
          urlObj.pathname = urlObj.pathname.replace(/\/\/+/g, '/');
          src = urlObj.toString();
          img.setAttribute('src', src);
        } catch (e) {
          // ignore
        }

        if (Capacitor.isNativePlatform() && imagePersistence.resolvedLocalUrls.has(src)) {
          img.setAttribute('src', imagePersistence.resolvedLocalUrls.get(src)!);
        }
      }
    });
    
    return doc.body.innerHTML;
  }, [fullContent, article.content, article.imageUrl, readerImageUrl]);

  const extractedImages = useMemo(() => {
    const urls: string[] = [];
    
    if (readerImageUrl) {
      urls.push(readerImageUrl);
    }
    
    if (sanitizedContent) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(sanitizedContent, 'text/html');
      const imgs = doc.querySelectorAll('img');
      
      imgs.forEach(img => {
        const src = img.getAttribute('src');
        if (src && !urls.includes(src)) {
          const s = src.toLowerCase();
          const p = src.split('.').pop()?.split('?')[0]?.toLowerCase() || '';
          if (
            !s.includes('favicon') && 
            !s.includes('avatar') && 
            !s.includes('icon') && 
            !s.includes('logo') && 
            (s.startsWith('http') || s.includes('_capacitor_file_'))
          ) {
            urls.push(src);
          }
        }
      });
    }
    
    return urls;
  }, [sanitizedContent, readerImageUrl]);

  useEffect(() => {
    if (!contentRef.current || !Capacitor.isNativePlatform()) return;
    
    const imgs = contentRef.current.querySelectorAll('img');
    imgs.forEach(async (img) => {
      let src = img.getAttribute('src');
      // Fix potential double slashes like https://domain.com//wp-content/...
      if (src && src.startsWith('http') && !src.includes('_capacitor_file_')) {
        try {
          const urlObj = new URL(src);
          urlObj.pathname = urlObj.pathname.replace(/\/\/+/g, '/');
          src = urlObj.toString();
        } catch (e) {
           // Invalid URL, let it be
        }
        
        try {
          const localUrl = await imagePersistence.getLocalUrl(src);
          if (localUrl) img.setAttribute('src', localUrl);
        } catch (e) {
          // ignore
        }
      }
    });
  }, [sanitizedContent]);

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
    <motion.div 
      className="fixed inset-0 z-50 pointer-events-none transform-gpu"
      style={{ willChange: 'transform' }}
    >
      <motion.div 
        key="article-reader-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="fixed inset-0 bg-black/60 backdrop-blur-md pointer-events-auto"
        onClick={onClose}
      />
      <motion.article 
        key="article-reader-modal"
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 220 }}
        className="fixed inset-0 z-10 w-full h-full overflow-hidden flex flex-col transition-colors break-words font-sans bg-zinc-950/80 backdrop-blur-3xl scrollbar-hide pointer-events-auto shadow-2xl isolate transform-gpu"
      >
        
        {/* Top App Bar */}
        <div className="sticky top-0 z-20 px-4 py-4 flex items-center justify-between bg-gradient-to-b from-transparent to-transparent pointer-events-none">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-black border border-white/20 active:bg-white/20 text-white pointer-events-auto"
            aria-label="Close article"
          >
            <ArrowLeft className="w-5 h-5 text-gray-200" aria-hidden="true" />
          </motion.button>
          <div className="flex items-center gap-2 pointer-events-auto">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onPrev}
              disabled={!hasPrev}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-black border border-white/20 active:bg-white/20 text-white disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Previous article"
            >
              <ChevronUp className="w-5 h-5 text-gray-200" aria-hidden="true" />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onNext}
              disabled={!hasNext}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-black border border-white/20 active:bg-white/20 text-white disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Next article"
            >
              <ChevronDown className="w-5 h-5 text-gray-200" aria-hidden="true" />
            </motion.button>
          </div>
        </div>

        {/* Article Content with Glass Container */}
        <div 
          ref={scrollContainerRef}
          className="relative z-10 flex-1 px-2 sm:px-4 max-w-5xl mx-auto w-full pb-20 overflow-y-auto overscroll-contain transform-gpu will-change-scroll scrollbar-hide"
        >
        <div className="bg-[#121e36] border border-blue-500/10 rounded-[2.5rem] overflow-hidden shadow-2xl mb-24">
          {extractedImages.length > 0 && (
            <div className="relative group overflow-hidden bg-black/40 w-full aspect-[16/10] max-h-[55vh] flex flex-col items-center justify-center">
              <RotatingImageCarousel
                urls={extractedImages}
                className="w-full h-full"
              />
            </div>
          )}

          <div className="p-3 sm:p-6 lg:p-8">
            <header className="mb-6 text-center max-w-5xl mx-auto">
              <div className="flex flex-col items-center gap-3 mb-2">
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

              <div className="flex items-center justify-center gap-8 mt-4 text-gray-500">
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
                      const isShareAvailable = isNative() && isPluginAvailable('Share');
                      if (isShareAvailable) {
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

            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent w-full mb-6" />
            <AnimatePresence mode="wait">
              {sanitizedContent ? (
                <motion.div 
                  key="content"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.45, ease: [0.215, 0.61, 0.355, 1] }}
                  className="relative"
                >
                  {/* Visual smooth progress indicator for background content loading */}
                  {isLoading && (
                    <div className="absolute -top-4 left-0 right-0 h-[3px] bg-white/5 overflow-hidden rounded-full mb-4">
                      <motion.div 
                        className="h-full bg-indigo-500 rounded-full"
                        animate={{
                          x: ['-100%', '100%'],
                          width: ['20%', '60%', '20%']
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: 'easeInOut'
                        }}
                      />
                    </div>
                  )}
                  
                  <div 
                    ref={contentRef}
                    onClick={handleContentClick}
                    className={`prose ${getProseSize()} prose-invert max-w-4xl mx-auto overflow-hidden leading-[1.75] text-gray-200 font-serif
                      prose-img:rounded-xl prose-img:max-h-[90vh] prose-img:object-contain prose-img:h-auto prose-img:mx-auto prose-img:max-w-full prose-img:my-10 prose-img:shadow-xl
                      prose-video:w-full prose-video:rounded-xl prose-video:my-8
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
                </motion.div>
              ) : isLoading ? (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.35, 0.6, 0.35] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6 mt-8 max-w-4xl mx-auto"
                >
                  <div className="h-4 bg-white/5 rounded w-3/4"></div>
                  <div className="h-4 bg-white/5 rounded w-full"></div>
                  <div className="h-4 bg-white/5 rounded w-5/6"></div>
                  <div className="h-4 bg-white/5 rounded w-full"></div>
                  <div className="h-4 bg-white/5 rounded w-2/3"></div>
                  <div className="h-48 bg-white/5 rounded-2xl w-full mt-10"></div>
                </motion.div>
              ) : (
                <motion.div 
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`prose ${getProseSize()} prose-invert max-w-full overflow-hidden text-center py-8`}
                >
                  <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">
                    Non è stato possibile caricare il contenuto completo dell'articolo.
                  </p>
                  <a 
                    href={getSafeUrl(article.link)}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-indigo-900/30 text-indigo-400 rounded-lg hover:bg-indigo-900/50 transition-colors no-underline text-xs font-semibold"
                  >
                    Leggi l'articolo originale
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.article>
    </motion.div>
  );
});
