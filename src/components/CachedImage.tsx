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
  const [currentSrc, setCurrentSrc] = useState<string | null>(() => {
    if (!src) return null;
    if (resolvedLocalUrls.has(src)) return resolvedLocalUrls.get(src)!;
    // On native, wait for cache check to avoid flicker from remote -> local switch
    if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) return null;
    return src;
  });
  
  const [isLoaded, setIsLoaded] = useState(() => {
    if (!src) return false;
    if (resolvedLocalUrls.has(src)) {
      return loadedFinalUrls.has(resolvedLocalUrls.get(src)!);
    }
    if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) return false;
    return loadedFinalUrls.has(src);
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

    if (resolvedLocalUrls.has(src)) {
      const local = resolvedLocalUrls.get(src)!;
      setCurrentSrc(local);
      setIsLoaded(loadedFinalUrls.has(local));
      setError(false);
    } else if (typeof window !== 'undefined' && !Capacitor.isNativePlatform()) {
      setCurrentSrc(src);
      setIsLoaded(loadedFinalUrls.has(src));
      setError(false);
    } else {
      // On native, reset to null and wait for the async check
      setCurrentSrc(null);
      setIsLoaded(false);
      setError(false);
    }
  }, [src]);

  useEffect(() => {
    let isMounted = true;
    
    if (!src) return;
    if (resolvedLocalUrls.has(src)) return;

    const initImage = async () => {
      if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
        try {
          const cachedUri = await imagePersistence.getCachedUrl(src);
          if (cachedUri && isMounted) {
            resolvedLocalUrls.set(src, cachedUri);
            setCurrentSrc(cachedUri);
            setIsLoaded(loadedFinalUrls.has(cachedUri));
          } else if (isMounted) {
            // Not cached locally yet. Use remote URL to show immediately.
            setCurrentSrc(src);
            setIsLoaded(loadedFinalUrls.has(src));
            
            // Trigger background download for next time
            imagePersistence.getLocalUrl(src).then(downloadedUri => {
              if (downloadedUri) {
                resolvedLocalUrls.set(src, downloadedUri);
              }
            }).catch(e => console.warn('Background cache failed', e));
          }
        } catch (e) {
          if (isMounted) {
            setCurrentSrc(src);
            setIsLoaded(loadedFinalUrls.has(src));
          }
        }
      }
    };

    initImage();
    return () => { isMounted = false; };
  }, [src]);

  // Check if image is already complete on mount or src change
  useEffect(() => {
    if (imgRef.current?.complete && currentSrc && !isLoaded) {
      loadedFinalUrls.add(currentSrc);
      setIsLoaded(true);
    }
  }, [currentSrc, isLoaded]);

  const handleLoad = () => {
    if (currentSrc) {
      loadedFinalUrls.add(currentSrc);
    }
    setIsLoaded(true);
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
      ref={imgRef}
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
