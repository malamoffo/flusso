import React, { useState, useEffect } from 'react';
import { cn, getHostname, getSafeUrl } from '../lib/utils';
import { imagePersistence } from '../utils/imagePersistence';
import { Capacitor } from '@capacitor/core';
import { FileText } from 'lucide-react';
import { isNative as checkIsNative } from '../utils/platform';

// Persistent cache for image URLs to avoid re-rendering on section change
// Now using imagePersistence.memoryCache and imagePersistence.loadedUrls

type CachedImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  fallback?: React.ReactNode;
  priority?: boolean;
};

export function CachedImage({ src, className, fallback, alt, priority, ...props }: CachedImageProps) {
  const isGif = React.useMemo(() => {
    if (!src) return false;
    const s = src.toLowerCase();
    return s.endsWith('.gif') || s.includes('.gif?') || s.includes('/gif') || s.includes('image=gif');
  }, [src]);

  const [currentSrc, setCurrentSrc] = useState<string | null>(() => {
    if (!src) return null;
    const safe = getSafeUrl(src);
    if (isGif) return safe;
    if (imagePersistence.memoryCache.has(src)) return imagePersistence.memoryCache.get(src)!;
    if (imagePersistence.resolvedLocalUrls.has(src)) return imagePersistence.resolvedLocalUrls.get(src)!;
    return safe;
  });
  
  const [isLoaded, setIsLoaded] = useState(() => {
    if (!src) return false;
    if (isGif) return false;
    if (imagePersistence.resolvedLocalUrls.has(src)) {
      return imagePersistence.loadedUrls.has(imagePersistence.resolvedLocalUrls.get(src)!);
    }
    return imagePersistence.loadedUrls.has(src);
  });
  
  const [error, setError] = useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);

  // Sync state with src prop changes
  useEffect(() => {
    if (!src) {
      setCurrentSrc(null);
      setIsLoaded(false);
      setError(false);
      return;
    }

    if (isGif) {
      setCurrentSrc(getSafeUrl(src));
      setIsLoaded(false);
      setError(false);
    } else if (imagePersistence.memoryCache.has(src)) {
      const cached = imagePersistence.memoryCache.get(src)!;
      setCurrentSrc(cached);
      setIsLoaded(imagePersistence.loadedUrls.has(cached));
      setError(false);
    } else if (imagePersistence.resolvedLocalUrls.has(src)) {
      const local = imagePersistence.resolvedLocalUrls.get(src)!;
      setCurrentSrc(local);
      setIsLoaded(imagePersistence.loadedUrls.has(local));
      setError(false);
    } else {
      // Use remote safe src as initial value
      const safe = getSafeUrl(src);
      setCurrentSrc(safe);
      setIsLoaded(imagePersistence.loadedUrls.has(safe));
      setError(false);
    }
  }, [src, isGif]);

  useEffect(() => {
    let isMounted = true;
    
    if (!src) return;
    if (isGif) return;
    if (imagePersistence.resolvedLocalUrls.has(src)) return;

    const initImage = async () => {
      if (typeof window !== 'undefined' && checkIsNative()) {
        try {
          const cachedUri = await imagePersistence.getLocalUrl(src);
          if (isMounted) {
            setCurrentSrc(cachedUri);
            setIsLoaded(imagePersistence.loadedUrls.has(cachedUri));
          }
        } catch (e) {
          // Keep using remote src
        }
      }
    };

    initImage();
    return () => { isMounted = false; };
  }, [src, isGif]);

  // Check if image is already complete on mount or src change
  useEffect(() => {
    if (imgRef.current?.complete && currentSrc && !isLoaded) {
      imagePersistence.loadedUrls.add(currentSrc);
      setIsLoaded(true);
    }
  }, [currentSrc, isLoaded]);

  const hasExplicitHeight = React.useMemo(() => {
    if (!className) return false;
    // Match any "h-" class unless it is exactly "h-auto", or aspect ratio class
    return /\bh-(?!auto\b)[^\s]+/.test(className) || /\baspect-[^\s]+/.test(className);
  }, [className]);

  const isPreloaded = Boolean(
    priority || 
    (src && (imagePersistence.loadedUrls.has(src) || imagePersistence.memoryCache.has(src))) ||
    (currentSrc && imagePersistence.loadedUrls.has(currentSrc))
  );

  const handleLoad = () => {
    if (currentSrc) {
      imagePersistence.loadedUrls.add(currentSrc);
      if (src) imagePersistence.memoryCache.set(src, currentSrc);
    }
    setIsLoaded(true);
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const safeSrc = getSafeUrl(src);
    const isNative = Capacitor.isNativePlatform();

    // 1. If currently using a local cached file that failed, fall back to remote safe URL
    if (currentSrc !== safeSrc && !currentSrc?.startsWith('https://images.weserv.nl/')) {
      setCurrentSrc(safeSrc);
      return;
    }

    // 2. If URL is insecure http, upgrade to https
    if (currentSrc && currentSrc.startsWith('http://')) {
      const upgraded = currentSrc.replace(/^http:\/\//i, 'https://');
      if (upgraded !== currentSrc) {
        setCurrentSrc(upgraded);
        return;
      }
    }

    // 3. On web, if direct load failed (e.g. strict CORS), try open image proxy
    if (!isNative) {
      const targetUrl = safeSrc || currentSrc;
      if (targetUrl && !targetUrl.startsWith('https://images.weserv.nl/')) {
        const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(targetUrl)}`;
        if (currentSrc !== proxyUrl) {
          setCurrentSrc(proxyUrl);
          return;
        }
      }
    }

    console.warn(`[CachedImage] Failed to load image: ${src}`);
    setError(true);
    if (props.onError) {
      props.onError(e);
    }
  };

  if (error) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className={cn(
        className,
        "bg-gray-800 flex items-center justify-center text-gray-600"
      )}>
        <FileText className="w-1/3 h-1/3 opacity-20" />
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <img
        ref={imgRef}
        src={currentSrc || undefined}
        alt={alt}
        draggable={false}
        referrerPolicy="no-referrer"
        loading={isPreloaded ? "eager" : "lazy"}
        decoding="async"
        className={cn(
          "w-full transition-opacity duration-300",
          hasExplicitHeight ? "h-full object-cover" : "h-auto",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-800 animate-pulse" />
      )}
    </div>
  );
}
