import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { imagePersistence } from '../utils/imagePersistence';
import { Capacitor } from '@capacitor/core';
import { FileText } from 'lucide-react';

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
    
    // If it's a new src, we might want to clear currentSrc to avoid showing the old image
    // but only if it's not already loaded to avoid flicker
    if (!alreadyLoaded) {
      setCurrentSrc('');
    } else {
      setCurrentSrc(src);
    }

    const loadImage = async () => {
      if (!src) return;

      let finalSrc = src;
      if (Capacitor.isNativePlatform()) {
        try {
          const localUrl = await imagePersistence.getLocalUrl(src);
          if (localUrl) {
            finalSrc = localUrl;
          }
        } catch (e) {
          console.error('[CachedImage] Native load error:', e);
        }
      }

      if (alreadyLoaded) {
        if (isMounted) setCurrentSrc(finalSrc);
        return;
      }

      const img = new Image();
      if (props.referrerPolicy) {
        img.referrerPolicy = props.referrerPolicy as ReferrerPolicy;
      }
      img.onload = () => {
        if (isMounted) {
          loadedImages.add(src);
          setCurrentSrc(finalSrc);
          setIsLoaded(true);
        }
      };
      img.onerror = () => {
        if (isMounted) {
          setError(true);
          // Don't mark as loaded if there's an error to avoid showing broken icon
          // unless we want the browser's default error handling
          setIsLoaded(false);
        }
      };
      img.src = finalSrc;
    };

    loadImage();
    return () => { isMounted = false; };
  }, [src]);

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
      src={currentSrc}
      className={cn(
        className,
        !isLoaded && "opacity-0",
        isLoaded && "opacity-100 transition-opacity duration-300"
      )}
      {...props}
      // If it's already in our "loaded" set, don't lazy load it again to avoid flicker
      loading="eager"
    />
  );
}
