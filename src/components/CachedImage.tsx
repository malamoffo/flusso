import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { imagePersistence } from '../utils/imagePersistence';
import { Capacitor } from '@capacitor/core';
import { FileText } from 'lucide-react';

// Global set to track images that have already been loaded in this session
// We store the final resolved URL here
const loadedFinalUrls = new Set<string>();
// Cache for already resolved local URLs to avoid repeated filesystem calls
const resolvedLocalUrls = new Map<string, string>();

type CachedImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  fallback?: React.ReactNode;
};

export function CachedImage({ src, className, fallback, alt, ...props }: CachedImageProps) {
  // 1. Initialize with already resolved local URL if available in memory
  const initialSrc = resolvedLocalUrls.get(src) || src || null;
  const [currentSrc, setCurrentSrc] = useState<string | null>(initialSrc);
  
  // 2. Initial load state based on memory cache
  const [isLoaded, setIsLoaded] = useState(initialSrc ? loadedFinalUrls.has(initialSrc) : false);
  const [error, setError] = useState(false);

  // 3. Resolve local URL if needed (async)
  useEffect(() => {
    let isMounted = true;
    
    if (!src) {
      setCurrentSrc(null);
      setIsLoaded(false);
      return;
    }

    const resolveUrl = async () => {
      if (!Capacitor.isNativePlatform()) return;
      
      try {
        const localUrl = await imagePersistence.getLocalUrl(src);
        if (localUrl && isMounted) {
          resolvedLocalUrls.set(src, localUrl);
          if (localUrl !== currentSrc) {
            setCurrentSrc(localUrl);
            // If this local URL was already loaded in this session, mark as loaded immediately
            if (loadedFinalUrls.has(localUrl)) {
              setIsLoaded(true);
            }
          }
        }
      } catch (e) {
        console.warn('[IMAGE_CACHE] Failed to resolve local URL:', e);
      }
    };

    resolveUrl();
    return () => { isMounted = false; };
  }, [src, currentSrc]);

  const handleLoad = () => {
    if (currentSrc) {
      loadedFinalUrls.add(currentSrc);
      setIsLoaded(true);
    }
  };

  const handleError = () => {
    // If local URL failed, try falling back to original src
    if (currentSrc !== src) {
      setCurrentSrc(src);
    } else {
      setError(true);
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
    <img
      src={currentSrc || undefined}
      alt={alt}
      draggable={false}
      className={cn(
        className,
        !isLoaded && "opacity-0",
        isLoaded && "opacity-100 transition-opacity duration-300"
      )}
      onLoad={handleLoad}
      onError={handleError}
      {...props}
    />
  );
}
