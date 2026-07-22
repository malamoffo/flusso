import { useEffect, useRef, useCallback } from 'react';

export interface UseAutoMarkVisibleItemsAsReadOptions<T> {
  /**
   * Ref to the scrollable container element.
   */
  containerRef: React.RefObject<HTMLElement | null>;
  /**
   * Array of current items (e.g., Articles or RedditPosts).
   */
  items: T[];
  /**
   * Optional ref to a Set containing the IDs of items currently visible in the viewport.
   */
  visibleIdsSetRef?: React.RefObject<Set<string>>;
  /**
   * Whether auto-marking logic is enabled (e.g. current active tab).
   * @default true
   */
  enabled?: boolean;
  /**
   * Whether there are more items to load in pagination or loading state.
   * Auto-marking at bottom only triggers when hasMore is false.
   * @default false
   */
  hasMore?: boolean;
  /**
   * Distance threshold from bottom in pixels to consider "scrolled to bottom".
   * @default 5
   */
  bottomThreshold?: number;
  /**
   * Delay in milliseconds before firing the batch mark-as-read callback.
   * @default 5000
   */
  delay?: number;
  /**
   * Callback invoked with array of unread item IDs to mark as read in batch.
   */
  onMarkAsRead: (ids: string[]) => void | Promise<void>;
  /**
   * Mode for marking items:
   * - 'visible-only': only mark items that are unread AND present in visibleIdsSetRef
   * - 'all-unread': mark all unread items in the list when bottom is reached
   * @default 'visible-only'
   */
  mode?: 'visible-only' | 'all-unread';
  /**
   * Field or function to extract unique ID from an item.
   * @default 'id'
   */
  idField?: keyof T | ((item: T) => string);
  /**
   * Field or function to extract read status from an item.
   * @default 'isRead'
   */
  isReadField?: keyof T | ((item: T) => boolean);
}

export function useAutoMarkVisibleItemsAsRead<T>({
  containerRef,
  items,
  visibleIdsSetRef,
  enabled = true,
  hasMore = false,
  bottomThreshold = 5,
  delay = 5000,
  onMarkAsRead,
  mode = 'visible-only',
  idField = 'id' as keyof T,
  isReadField = 'isRead' as keyof T
}: UseAutoMarkVisibleItemsAsReadOptions<T>): void {
  // Stable refs to prevent stale closure issues and unnecessary re-subscribes
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const onMarkAsReadRef = useRef(onMarkAsRead);
  onMarkAsReadRef.current = onMarkAsRead;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  // Helper functions to resolve ID and read status
  const getId = useCallback(
    (item: T): string => {
      if (typeof idField === 'function') return idField(item);
      if (idField in (item as any)) return String((item as any)[idField]);
      return (item as any).id;
    },
    [idField]
  );

  const getIsRead = useCallback(
    (item: T): boolean => {
      if (typeof isReadField === 'function') return isReadField(item);
      if (isReadField in (item as any)) return Boolean((item as any)[isReadField]);
      return Boolean((item as any).isRead);
    },
    [isReadField]
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const checkAndSchedule = useCallback(() => {
    const container = containerRef.current;
    if (!container || !enabledRef.current) {
      clearTimer();
      return;
    }

    const isAtBottom =
      container.scrollHeight - container.scrollTop <= container.clientHeight + bottomThreshold;
    const canMark = isAtBottom && !hasMoreRef.current;

    if (canMark) {
      const currentItems = itemsRef.current;
      const visibleSet = visibleIdsSetRef?.current;

      const hasUnread = currentItems.some((item) => {
        if (getIsRead(item)) return false;
        if (mode === 'visible-only') {
          return visibleSet ? visibleSet.has(getId(item)) : true;
        }
        return true;
      });

      if (hasUnread && timerRef.current === null) {
        timerRef.current = setTimeout(() => {
          // Double check status when timer expires
          if (!enabledRef.current) {
            timerRef.current = null;
            return;
          }

          const freshItems = itemsRef.current;
          const freshVisibleSet = visibleIdsSetRef?.current;

          const toMark = freshItems.reduce<string[]>((acc, item) => {
            const itemId = getId(item);
            const isRead = getIsRead(item);
            if (!isRead) {
              if (mode === 'visible-only') {
                if (!freshVisibleSet || freshVisibleSet.has(itemId)) {
                  acc.push(itemId);
                }
              } else {
                acc.push(itemId);
              }
            }
            return acc;
          }, []);

          if (toMark.length > 0) {
            onMarkAsReadRef.current(toMark);
          }
          timerRef.current = null;
        }, delay);
      } else if (!hasUnread && timerRef.current !== null) {
        clearTimer();
      }
    } else {
      clearTimer();
    }
  }, [containerRef, bottomThreshold, mode, delay, getId, getIsRead, visibleIdsSetRef, clearTimer]);

  // Handle scroll events with passive listener & RAF throttling
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) {
      clearTimer();
      return;
    }

    const handleScroll = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        checkAndSchedule();
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    // Perform initial check when enabled/container is ready
    checkAndSchedule();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      clearTimer();
    };
  }, [containerRef, enabled, checkAndSchedule, clearTimer]);

  // Re-check whenever relevant state changes (items, hasMore, enabled)
  useEffect(() => {
    if (enabled) {
      checkAndSchedule();
    } else {
      clearTimer();
    }
  }, [enabled, hasMore, items, checkAndSchedule, clearTimer]);

  // Complete cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      clearTimer();
    };
  }, [clearTimer]);
}
