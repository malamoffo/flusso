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

    const loadImage = async () => {
      if (loadedImages.has(src)) {
        setIsLoaded(true);
        return;
      }

      let finalSrc = src;
      if (Capacitor.isNativePlatform()) {
        finalSrc = await imagePersistence.getLocalUrl(src);
        if (isMounted) setCurrentSrc(finalSrc);
      }

      const img = new Image();
      img.src = finalSrc;
      img.onload = () => {
        if (isMounted) {
          loadedImages.add(src);
          setIsLoaded(true);
        }
      };
      img.onerror = () => {
        if (isMounted) setError(true);
      };
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
        !isLoaded && "opacity-0",
        isLoaded && "opacity-100 transition-opacity duration-300"
      )}
      {...props}
      // If it's already in our "loaded" set, don't lazy load it again to avoid flicker
      loading={loadedImages.has(src) ? "eager" : "lazy"}
    />
  );
}
