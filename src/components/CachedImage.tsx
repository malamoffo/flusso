import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { imagePersistence } from '../utils/imagePersistence';
import { Capacitor } from '@capacitor/core';

// Global set to track images that have already been loaded in this session
const loadedImages = new Set<string>();

type CachedImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  fallback?: React.ReactNode;
};

export function CachedImage({ src, className, fallback, ...props }: CachedImageProps) {
  const [currentSrc, setCurrentSrc] = useState<string>(src);
  const [isLoaded, setIsLoaded] = useState(loadedImages.has(src));
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    // Reset state for new src
    const alreadyLoaded = loadedImages.has(src);
    setIsLoaded(alreadyLoaded);
    setError(false);
    setCurrentSrc(src);

    const loadImage = async () => {
      if (!src || alreadyLoaded) return;

      let finalSrc = src;
      if (Capacitor.isNativePlatform()) {
        try {
          finalSrc = await imagePersistence.getLocalUrl(src);
          if (isMounted) setCurrentSrc(finalSrc);
        } catch (e) {
          console.error('[CachedImage] Native load error:', e);
        }
      }

      const img = new Image();
      if (props.referrerPolicy) {
        img.referrerPolicy = props.referrerPolicy;
      }
      img.onload = () => {
        if (isMounted) {
          loadedImages.add(src);
          setIsLoaded(true);
        }
      };
      img.onerror = () => {
        if (isMounted) {
          setError(true);
          // Even on error, we mark as loaded so the native img tag can try to show it
          setIsLoaded(true);
        }
      };
      img.src = finalSrc;
    };

    loadImage();
    return () => { isMounted = false; };
  }, [src]);

  if (error && fallback) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={currentSrc}
      className={cn(
        className,
        !isLoaded && !error && "opacity-0",
        (isLoaded || error) && "opacity-100 transition-opacity duration-300"
      )}
      {...props}
      // If it's already in our "loaded" set, don't lazy load it again to avoid flicker
      loading="eager"
    />
  );
}
