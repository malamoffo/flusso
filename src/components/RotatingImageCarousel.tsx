import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CachedImage } from './CachedImage';
import { getSafeUrl } from '../lib/utils';

interface RotatingImageCarouselProps {
  urls: string[];
  intervalDuration?: number;
  className?: string;
  onClick?: (url: string) => void;
}

export function RotatingImageCarousel({
  urls,
  intervalDuration = 4500,
  className = '',
  onClick
}: RotatingImageCarouselProps) {
  const [index, setIndex] = useState(0);

  // Filter and sanitize list of images
  const sanitizedUrls = React.useMemo(() => {
    const urlsSet = new Set<string>();
    urls.forEach(url => {
      if (url && url.trim()) {
        const trimmed = url.trim();
        const lower = trimmed.toLowerCase();
        // Skip common tiny placeholders / tracking pixels / favicon urls
        if (
          lower.includes('favicon') || 
          lower.endsWith('.ico') || 
          lower.includes('pixel.gif') || 
          lower.includes('tracker') ||
          lower.includes('/sprite') ||
          lower.includes('doubleclick')
        ) {
          return;
        }
        urlsSet.add(trimmed);
      }
    });
    return Array.from(urlsSet);
  }, [urls]);

  useEffect(() => {
    if (sanitizedUrls.length <= 1) return;

    const timer = setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % sanitizedUrls.length);
    }, intervalDuration);

    return () => clearInterval(timer);
  }, [sanitizedUrls.length, intervalDuration]);

  // If there are no images, show nothing
  if (sanitizedUrls.length === 0) {
    return null;
  }

  if (sanitizedUrls.length === 1) {
    const url = sanitizedUrls[0];
    return (
      <div 
        className={`relative overflow-hidden w-full cursor-pointer ${className}`}
        onClick={() => onClick?.(url)}
      >
        <CachedImage 
          src={getSafeUrl(url)}
          alt=""
          className="w-full h-auto block rounded-[inherit]"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  const currentUrl = sanitizedUrls[index];

  return (
    <div 
      className={`relative overflow-hidden w-full bg-[#121c33]/20 select-none cursor-pointer ${className}`}
      onClick={() => onClick?.(currentUrl)}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={`carousel-img-${index}-${currentUrl}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="w-full h-auto"
        >
          <CachedImage 
            src={getSafeUrl(currentUrl)}
            alt=""
            className="w-full h-auto block rounded-[inherit]"
            referrerPolicy="no-referrer"
          />
        </motion.div>
      </AnimatePresence>

      {/* Elegant indicator dots for multiple images */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20 bg-black/50 backdrop-blur-[2px] px-2.5 py-1 rounded-full shadow-lg border border-white/10">
        {sanitizedUrls.map((url, i) => (
          <div 
            key={`${url}-${i}`}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              i === index ? 'bg-white scale-110 shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-white/30 hover:bg-white/50'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setIndex(i);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Utility helper to extract all unique images from an article (both metadata and html content)
 */
export function extractArticleImages(article: { imageUrl?: string; postImageUrls?: string[]; content?: string }, fullContentHtml?: string): string[] {
  const urlsSet = new Set<string>();

  // 1. Add main image
  if (article.imageUrl) {
    urlsSet.add(article.imageUrl);
  }

  // 2. Add postImageUrls if any
  if (article.postImageUrls && Array.isArray(article.postImageUrls)) {
    article.postImageUrls.forEach(url => {
      if (url) urlsSet.add(url);
    });
  }

  // 3. Parse inline html images from summary/snippet
  if (article.content) {
    getImagesFromHtmlString(article.content).forEach(url => urlsSet.add(url));
  }

  // 4. Parse full content html if available
  if (fullContentHtml) {
    getImagesFromHtmlString(fullContentHtml).forEach(url => urlsSet.add(url));
  }

  return Array.from(urlsSet);
}

function getImagesFromHtmlString(html: string): string[] {
  const images: string[] = [];
  try {
    const imgRegex = /<img[^>]+src=["']([^"'>]+)["']/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      const src = match[1];
      if (src && !src.startsWith('data:')) {
        images.push(src);
      }
    }
  } catch (e) {
    console.error('Error parsing images from HTML string:', e);
  }
  return images;
}
