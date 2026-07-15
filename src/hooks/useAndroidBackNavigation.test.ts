// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// Mock React first so that useAndroidBackNavigation imports the mocked version
let mockRefCurrent: any = null;
let mockEffectCleanup: any = null;

vi.mock('react', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useRef: (initialValue: any) => {
      return {
        get current() {
          return mockRefCurrent || initialValue;
        },
        set current(val) {
          mockRefCurrent = val;
        }
      };
    },
    useEffect: (effect: any, deps: any) => {
      if (!deps || deps.length === 0) {
        mockEffectCleanup = effect();
      } else {
        effect();
      }
    }
  };
});

// Now import the hook and props
import { useAndroidBackNavigation, UseAndroidBackNavigationProps } from './useAndroidBackNavigation';

// Mock Capacitor Core
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => 'android'),
    isPluginAvailable: vi.fn(() => true),
  },
}));

// Mock Capacitor App
const mockExitApp = vi.fn();
let activeCallback: any = null;
const mockRemoveListener = vi.fn();
const mockAddListener = vi.fn().mockImplementation((event, callback) => {
  activeCallback = callback;
  return Promise.resolve({ remove: mockRemoveListener });
});

vi.mock('@capacitor/app', () => ({
  App: {
    exitApp: () => mockExitApp(),
    addListener: (event: any, callback: any) => mockAddListener(event, callback),
  },
}));

describe('useAndroidBackNavigation', () => {
  let props: UseAndroidBackNavigationProps;

  beforeEach(() => {
    vi.clearAllMocks();
    activeCallback = null;
    mockEffectCleanup = null;
    mockRefCurrent = null;
  });

  const runHook = (p: UseAndroidBackNavigationProps) => {
    mockRefCurrent = p;
    useAndroidBackNavigation(p);
  };

  it('should register listener on native platform', () => {
    const p = createProps();
    runHook(p);
    expect(mockAddListener).toHaveBeenCalledWith('backButton', expect.any(Function));
  });

  it('should clean up the listener properly on unmount', async () => {
    const p = createProps();
    runHook(p);
    
    // Simulate Promise resolution
    await new Promise((resolve) => setTimeout(resolve, 0));
    
    if (mockEffectCleanup) {
      mockEffectCleanup();
    }
    
    expect(mockRemoveListener).toHaveBeenCalled();
  });

  // Priority 1: close selectedImage (overlay più interno)
  it('should prioritize closing selectedImage first', async () => {
    const p = createProps({ selectedImage: 'image.jpg', webViewUrl: 'https://example.com' });
    runHook(p);

    await activeCallback({ canGoBack: true });

    expect(p.setSelectedImage).toHaveBeenCalledWith(null);
    expect(p.setWebViewUrl).not.toHaveBeenCalled();
    expect(mockExitApp).not.toHaveBeenCalled();
  });

  // Priority 1 (alternate): close webViewUrl (overlay più interno)
  it('should close webViewUrl if selectedImage is not present', async () => {
    const p = createProps({ webViewUrl: 'https://example.com', selectedArticle: { id: '1' } });
    runHook(p);

    await activeCallback({ canGoBack: true });

    expect(p.setWebViewUrl).toHaveBeenCalledWith(null);
    expect(p.setSelectedArticle).not.toHaveBeenCalled();
  });

  // Priority 2: close selectedArticle (lettore articolo)
  it('should prioritize closing selectedArticle after overlays', async () => {
    const p = createProps({ selectedArticle: { id: '1' }, selectedRedditPost: { id: '2' } });
    runHook(p);

    await activeCallback({ canGoBack: true });

    expect(p.setSelectedArticle).toHaveBeenCalledWith(null);
    expect(p.setSelectedRedditPost).not.toHaveBeenCalled();
  });

  // Priority 3: close selectedRedditPost (lettore Reddit)
  it('should prioritize closing selectedRedditPost after article reader', async () => {
    const p = createProps({ selectedRedditPost: { id: '2' }, isSettingsOpen: true });
    runHook(p);

    await activeCallback({ canGoBack: true });

    expect(p.setSelectedRedditPost).toHaveBeenCalledWith(null);
    expect(p.enforceRedditRetention).toHaveBeenCalled();
    expect(p.setIsSettingsOpen).not.toHaveBeenCalled();
  });

  // Priority 4: close settings (impostazioni)
  it('should prioritize closing settings after Reddit reader', async () => {
    const p = createProps({ isSettingsOpen: true, isSearchOpen: true });
    runHook(p);

    await activeCallback({ canGoBack: true });

    expect(p.setIsSettingsOpen).toHaveBeenCalledWith(false);
    expect(p.setSettingsTab).toHaveBeenCalledWith(undefined);
    expect(p.setSearchQuery).toHaveBeenCalledWith('');
    expect(p.setIsSearchOpen).toHaveBeenCalledWith(false);
  });

  // Priority 5: close search (ricerca)
  it('should prioritize closing search after settings', async () => {
    const p = createProps({ isSearchOpen: true, filter: 'saved' });
    runHook(p);

    await activeCallback({ canGoBack: true });

    expect(p.setIsSearchOpen).toHaveBeenCalledWith(false);
    expect(p.setSearchQuery).toHaveBeenCalledWith('');
    expect(p.setSourceFilter).toHaveBeenCalledWith('all');
    expect(p.setTimeFilter).toHaveBeenCalledWith('all');
    expect(p.handleFilterChange).not.toHaveBeenCalled();
  });

  // Priority 6: return to inbox (inbox filter)
  it('should prioritize returning to inbox if on another filter', async () => {
    const p = createProps({ filter: 'saved' });
    runHook(p);

    await activeCallback({ canGoBack: true });

    expect(p.handleFilterChange).toHaveBeenCalledWith('inbox');
    expect(mockExitApp).not.toHaveBeenCalled();
  });

  // Priority 7: exit app
  it('should exit the app if on inbox and no modals or readers are open', async () => {
    const p = createProps({ filter: 'inbox' });
    runHook(p);

    await activeCallback({ canGoBack: true });

    expect(mockExitApp).toHaveBeenCalled();
  });
});

function createProps(overrides: Partial<UseAndroidBackNavigationProps> = {}): UseAndroidBackNavigationProps {
  return {
    selectedImage: null,
    setSelectedImage: vi.fn(),
    webViewUrl: null,
    setWebViewUrl: vi.fn(),
    selectedArticle: null,
    setSelectedArticle: vi.fn(),
    selectedRedditPost: null,
    setSelectedRedditPost: vi.fn(),
    enforceRedditRetention: vi.fn(),
    isSettingsOpen: false,
    setIsSettingsOpen: vi.fn(),
    setSettingsTab: vi.fn(),
    isSearchOpen: false,
    setIsSearchOpen: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    setSourceFilter: vi.fn(),
    setTimeFilter: vi.fn(),
    filter: 'inbox',
    handleFilterChange: vi.fn(),
    ...overrides,
  };
}
