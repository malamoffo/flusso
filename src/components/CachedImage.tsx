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
  const [currentSrc, setCurrentSrc] = useState<string | null>(src || null);
  const [isLoaded, setIsLoaded] = useState(loadedImages.has(src));
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    // Reset state for new src
    setIsLoaded(false);
    setError(false);
    setCurrentSrc(null);

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
      key={src}
      src={currentSrc || undefined}
      className={cn(
        className,
        !isLoaded && "opacity-0",
        isLoaded && "opacity-100 transition-opacity duration-300"
      )}
      {...props}
      loading="lazy"
    />
  );
}
