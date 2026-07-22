// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { useAutoMarkVisibleItemsAsRead, UseAutoMarkVisibleItemsAsReadOptions } from '../useAutoMarkVisibleItemsAsRead';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface TestItem {
  id: string;
  isRead: boolean;
}

function TestRunner({ props }: { props: UseAutoMarkVisibleItemsAsReadOptions<TestItem> }) {
  useAutoMarkVisibleItemsAsRead(props);
  return null;
}

describe('useAutoMarkVisibleItemsAsRead', () => {
  let mockContainer: HTMLElement;
  let containerRef: { current: HTMLElement | null };
  let containerDiv: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    containerDiv = document.createElement('div');
    document.body.appendChild(containerDiv);
    root = createRoot(containerDiv);

    mockContainer = document.createElement('div');
    Object.defineProperty(mockContainer, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(mockContainer, 'clientHeight', { value: 500, configurable: true });
    Object.defineProperty(mockContainer, 'scrollTop', { value: 0, configurable: true });
    containerRef = { current: mockContainer };

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 0) as unknown as number;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    if (containerDiv.parentNode) {
      containerDiv.parentNode.removeChild(containerDiv);
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('1. Raggiungimento del fondo: triggers callback after delay when scrolled to bottom', async () => {
    const onMarkAsRead = vi.fn();
    const items: TestItem[] = [
      { id: '1', isRead: false },
      { id: '2', isRead: false }
    ];

    const props: UseAutoMarkVisibleItemsAsReadOptions<TestItem> = {
      containerRef,
      items,
      enabled: true,
      hasMore: false,
      delay: 5000,
      bottomThreshold: 10,
      mode: 'all-unread',
      onMarkAsRead
    };

    act(() => {
      root.render(<TestRunner props={props} />);
    });

    // Scroll to bottom
    Object.defineProperty(mockContainer, 'scrollTop', { value: 500, configurable: true });
    act(() => {
      mockContainer.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(0); // flush RAF
    });

    expect(onMarkAsRead).not.toHaveBeenCalled();

    // Advance timers by 5s
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onMarkAsRead).toHaveBeenCalledTimes(1);
    expect(onMarkAsRead).toHaveBeenCalledWith(['1', '2']);
  });

  it('2. Allontanamento dal fondo prima del timeout: cancels timer if user scrolls up', async () => {
    const onMarkAsRead = vi.fn();
    const items: TestItem[] = [{ id: '1', isRead: false }];

    const props: UseAutoMarkVisibleItemsAsReadOptions<TestItem> = {
      containerRef,
      items,
      enabled: true,
      hasMore: false,
      delay: 5000,
      bottomThreshold: 10,
      mode: 'all-unread',
      onMarkAsRead
    };

    act(() => {
      root.render(<TestRunner props={props} />);
    });

    // Scroll to bottom
    Object.defineProperty(mockContainer, 'scrollTop', { value: 500, configurable: true });
    act(() => {
      mockContainer.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(0); // flush RAF
    });

    // Advance 2.5s
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    // User scrolls back up
    Object.defineProperty(mockContainer, 'scrollTop', { value: 100, configurable: true });
    act(() => {
      mockContainer.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(0); // flush RAF
    });

    // Advance remaining time
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onMarkAsRead).not.toHaveBeenCalled();
  });

  it('3. Cambio tab: disabling hook cancels timer and prevents callback execution', async () => {
    const onMarkAsRead = vi.fn();
    const items: TestItem[] = [{ id: '1', isRead: false }];

    const makeProps = (enabled: boolean): UseAutoMarkVisibleItemsAsReadOptions<TestItem> => ({
      containerRef,
      items,
      enabled,
      hasMore: false,
      delay: 5000,
      bottomThreshold: 10,
      mode: 'all-unread',
      onMarkAsRead
    });

    act(() => {
      root.render(<TestRunner props={makeProps(true)} />);
    });

    // Scroll to bottom
    Object.defineProperty(mockContainer, 'scrollTop', { value: 500, configurable: true });
    act(() => {
      mockContainer.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(0);
    });

    // Advance 3s
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Disable (e.g. tab changed)
    act(() => {
      root.render(<TestRunner props={makeProps(false)} />);
    });

    // Advance remaining time
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onMarkAsRead).not.toHaveBeenCalled();
  });

  it('4. Unmount: unmounting cleans up pending timers and RAFs', async () => {
    const onMarkAsRead = vi.fn();
    const items: TestItem[] = [{ id: '1', isRead: false }];

    const props: UseAutoMarkVisibleItemsAsReadOptions<TestItem> = {
      containerRef,
      items,
      enabled: true,
      hasMore: false,
      delay: 5000,
      bottomThreshold: 10,
      mode: 'all-unread',
      onMarkAsRead
    };

    act(() => {
      root.render(<TestRunner props={props} />);
    });

    // Scroll to bottom
    Object.defineProperty(mockContainer, 'scrollTop', { value: 500, configurable: true });
    act(() => {
      mockContainer.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(0);
    });

    // Unmount before delay
    act(() => {
      root.unmount();
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onMarkAsRead).not.toHaveBeenCalled();
  });

  it('5. Nuovi elementi caricati: cancels timer when hasMore becomes true', async () => {
    const onMarkAsRead = vi.fn();
    const items: TestItem[] = [{ id: '1', isRead: false }];

    const makeProps = (hasMore: boolean): UseAutoMarkVisibleItemsAsReadOptions<TestItem> => ({
      containerRef,
      items,
      enabled: true,
      hasMore,
      delay: 5000,
      bottomThreshold: 10,
      mode: 'all-unread',
      onMarkAsRead
    });

    act(() => {
      root.render(<TestRunner props={makeProps(false)} />);
    });

    // Scroll to bottom
    Object.defineProperty(mockContainer, 'scrollTop', { value: 500, configurable: true });
    act(() => {
      mockContainer.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(0);
    });

    // New items loaded -> hasMore becomes true
    act(() => {
      root.render(<TestRunner props={makeProps(true)} />);
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onMarkAsRead).not.toHaveBeenCalled();
  });

  it('6. Elemento che smette di essere visibile: visible-only mode respects visibleIdsSetRef', async () => {
    const onMarkAsRead = vi.fn();
    const items: TestItem[] = [
      { id: '1', isRead: false },
      { id: '2', isRead: false }
    ];
    const visibleSet = new Set<string>(['1', '2']);
    const visibleIdsSetRef = { current: visibleSet };

    const props: UseAutoMarkVisibleItemsAsReadOptions<TestItem> = {
      containerRef,
      items,
      visibleIdsSetRef,
      enabled: true,
      hasMore: false,
      delay: 5000,
      bottomThreshold: 10,
      mode: 'visible-only',
      onMarkAsRead
    };

    act(() => {
      root.render(<TestRunner props={props} />);
    });

    // Scroll to bottom
    Object.defineProperty(mockContainer, 'scrollTop', { value: 500, configurable: true });
    act(() => {
      mockContainer.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(0);
    });

    // Remove item '2' from visible set before timer completes
    visibleSet.delete('2');

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onMarkAsRead).toHaveBeenCalledTimes(1);
    expect(onMarkAsRead).toHaveBeenCalledWith(['1']);
  });

  it('7. Callback chiamata una sola volta: timer protection prevents duplicate calls', async () => {
    const onMarkAsRead = vi.fn();
    const items: TestItem[] = [{ id: '1', isRead: false }];

    const props: UseAutoMarkVisibleItemsAsReadOptions<TestItem> = {
      containerRef,
      items,
      enabled: true,
      hasMore: false,
      delay: 5000,
      bottomThreshold: 10,
      mode: 'all-unread',
      onMarkAsRead
    };

    act(() => {
      root.render(<TestRunner props={props} />);
    });

    // Multiple scroll events at bottom
    Object.defineProperty(mockContainer, 'scrollTop', { value: 500, configurable: true });
    act(() => {
      mockContainer.dispatchEvent(new Event('scroll'));
      mockContainer.dispatchEvent(new Event('scroll'));
      mockContainer.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(0);
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onMarkAsRead).toHaveBeenCalledTimes(1);
  });
});
