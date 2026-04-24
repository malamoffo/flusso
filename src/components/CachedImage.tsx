import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { imagePersistence } from '../utils/imagePersistence';
import { Capacitor } from '@capacitor/core';
import { FileText } from 'lucide-react';

// Persistent cache for image URLs to avoid re-rendering on section change
// Now using imagePersistence.memoryCache and imagePersistence.loadedUrls

type CachedImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  fallback?: React.ReactNode;
};

export function CachedImage({ src, className, fallback, alt, ...props }: CachedImageProps) {
  const [currentSrc, setCurrentSrc] = useState<string | null>(() => {
    if (!src) return null;
    if (imagePersistence.memoryCache.has(src)) return imagePersistence.memoryCache.get(src)!;
    if (imagePersistence.resolvedLocalUrls.has(src)) return imagePersistence.resolvedLocalUrls.get(src)!;
    // On native, use remote src as initial value to avoid blank space while checking cache
    return src;
  });
  
  const [isLoaded, setIsLoaded] = useState(() => {
    if (!src) return false;
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

    if (imagePersistence.memoryCache.has(src)) {
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
      // Use remote src as initial value
      setCurrentSrc(src);
      setIsLoaded(imagePersistence.loadedUrls.has(src));
      setError(false);
    }
  }, [src]);

  useEffect(() => {
    let isMounted = true;
    
    if (!src) return;
    if (imagePersistence.resolvedLocalUrls.has(src)) return;

    const initImage = async () => {
      if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
        try {
          const cachedUri = await imagePersistence.getCachedUrl(src);
          if (cachedUri && isMounted) {
            setCurrentSrc(cachedUri);
            setIsLoaded(imagePersistence.loadedUrls.has(cachedUri));
          } else if (isMounted) {
            // Not cached locally yet. Already using remote URL.
            // Trigger background download for next time
            imagePersistence.getLocalUrl(src).catch(() => {});
          }
        } catch (e) {
          // Keep using remote src
        }
      }
    };

    initImage();
    return () => { isMounted = false; };
  }, [src]);

  // Check if image is already complete on mount or src change
  useEffect(() => {
    if (imgRef.current?.complete && currentSrc && !isLoaded) {
      imagePersistence.loadedUrls.add(currentSrc);
      setIsLoaded(true);
    }
  }, [currentSrc, isLoaded]);

  const handleLoad = () => {
    if (currentSrc) {
      imagePersistence.loadedUrls.add(currentSrc);
      if (src) imagePersistence.memoryCache.set(src, currentSrc);
    }
    setIsLoaded(true);
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // If local URL failed, try falling back to original src
    let corsProxyUrl = null;
    try {
      const url = new URL(src);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.hostname.includes('corsproxy.io')) {
        corsProxyUrl = `https://corsproxy.io/?${encodeURIComponent(src)}`;
      }
    } catch {}

    if (currentSrc !== src && currentSrc !== corsProxyUrl) {
      setCurrentSrc(src);
    } else if (corsProxyUrl && currentSrc !== corsProxyUrl) {
      setCurrentSrc(corsProxyUrl);
    } else {
      console.warn(`[CachedImage] Failed to load image: ${src}`);
      setError(true);
      if (props.onError) {
        props.onError(e);
      }
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
        className={cn(
          "w-full h-full object-cover transition-opacity duration-300",
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
