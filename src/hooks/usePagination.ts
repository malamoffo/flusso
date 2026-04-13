import { useState, useCallback, useMemo } from 'react';

const PAGE_SIZE = 30;

export const usePagination = (totalItems: number) => {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const loadMore = useCallback(() => {
    setVisibleCount(prev => prev + PAGE_SIZE);
  }, []);

  const hasMore = useMemo(() => {
    return visibleCount < totalItems;
  }, [totalItems, visibleCount]);

  const reset = useCallback(() => {
    setVisibleCount(PAGE_SIZE);
  }, []);

  return { visibleCount, loadMore, hasMore, reset };
};
