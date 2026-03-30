import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

// Global set to track images that have already been loaded in this session
const loadedImages = new Set<string>();

type CachedImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  fallback?: React.ReactNode;
};

export function CachedImage({ src, className, fallback, ...props }: CachedImageProps) {
  const [isLoaded, setIsLoaded] = useState(loadedImages.has(src));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (loadedImages.has(src)) {
      setIsLoaded(true);
      return;
    }

    const img = new Image();
    img.src = src;
    img.onload = () => {
      loadedImages.add(src);
      setIsLoaded(true);
    };
    img.onerror = () => {
      setError(true);
    };
  }, [src]);

  if (error && fallback) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={src}
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
