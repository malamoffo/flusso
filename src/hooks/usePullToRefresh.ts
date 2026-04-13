import { useState, useRef, useEffect, RefObject } from 'react';
import { useMotionValue, useTransform, animate } from 'framer-motion';

interface UsePullToRefreshProps {
  onRefresh: () => void;
  isLoading: boolean;
  isDisabled?: boolean;
  scrollRefs: Record<string, RefObject<HTMLDivElement>>;
  activeScrollRefKey: string;
}

export const usePullToRefresh = ({
  onRefresh,
  isLoading,
  isDisabled = false,
  scrollRefs,
  activeScrollRefKey
}: UsePullToRefreshProps) => {
  const PULL_THRESHOLD = 80;
  const pullProgress = useMotionValue(0);
  const pullProgressTransform = useTransform(pullProgress, v => v - 40);
  const pullOpacity = useTransform(pullProgress, v => v / PULL_THRESHOLD);
  const [isPulling, setIsPulling] = useState(false);
  
  const touchStartY = useRef(0);
  const isAtTop = useRef(true);

  const handleTouchStart = (e: React.TouchEvent) => {
    const activeScrollRef = scrollRefs[activeScrollRefKey];
    const scrollTop = activeScrollRef?.current?.scrollTop || 0;
    isAtTop.current = scrollTop <= 0;
    touchStartY.current = e.touches[0].clientY;
    
    if (isAtTop.current && !isDisabled) {
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || !isAtTop.current) return;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (deltaY < 0) {
      setIsPulling(false);
      pullProgress.set(0);
      return;
    }
    if (deltaY > 0) {
      pullProgress.set(Math.min(deltaY * 0.4, PULL_THRESHOLD + 30));
    }
  };

  const handleTouchEnd = () => {
    if (isPulling && pullProgress.get() >= PULL_THRESHOLD) {
      if (!isDisabled) {
        onRefresh();
      }
    } else {
      animate(pullProgress, 0, { duration: 0.2 });
    }
    setIsPulling(false);
  };

  useEffect(() => {
    if (!isLoading) {
      animate(pullProgress, 0, { duration: 0.2 });
    }
  }, [isLoading, pullProgress]);

  return {
    pullProgressTransform,
    pullOpacity,
    isPulling,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    isAtTop
  };
};
