import { useEffect, useRef } from 'react';
import { App as CapacitorApp, BackButtonListenerEvent } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export interface UseAndroidBackNavigationProps {
  selectedImage: string | null;
  setSelectedImage: (img: string | null) => void;
  webViewUrl: string | null;
  setWebViewUrl: (url: string | null) => void;
  selectedArticle: any;
  setSelectedArticle: (art: any) => void;
  selectedRedditPost: any;
  setSelectedRedditPost: (post: any) => void;
  enforceRedditRetention: () => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  setSettingsTab: (tab: any) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setSourceFilter: (filter: string) => void;
  setTimeFilter: (filter: string) => void;
  filter: 'inbox' | 'saved' | 'reddit' | 'radio';
  handleFilterChange: (filter: 'inbox' | 'saved' | 'reddit' | 'radio') => void;
}

export function useAndroidBackNavigation(props: UseAndroidBackNavigationProps) {
  const propsRef = useRef<UseAndroidBackNavigationProps>(props);

  // Sync the mutable ref with the latest props on every render
  useEffect(() => {
    propsRef.current = props;
  }, [props]);

  useEffect(() => {
    const handleBackButton = async (event: BackButtonListenerEvent) => {
      const p = propsRef.current;

      // 1. Close innermost overlay (Selected image or Web View overlay)
      if (p.selectedImage) {
        p.setSelectedImage(null);
      } else if (p.webViewUrl) {
        p.setWebViewUrl(null);
      }
      // 2. Close article reader
      else if (p.selectedArticle) {
        p.setSelectedArticle(null);
      }
      // 3. Close Reddit reader
      else if (p.selectedRedditPost) {
        p.setSelectedRedditPost(null);
        p.enforceRedditRetention();
      }
      // 4. Close settings
      else if (p.isSettingsOpen) {
        p.setIsSettingsOpen(false);
        p.setSettingsTab(undefined);
        p.setSearchQuery('');
        p.setIsSearchOpen(false);
      }
      // 5. Close search
      else if (p.isSearchOpen) {
        p.setIsSearchOpen(false);
        p.setSearchQuery('');
        p.setSourceFilter('all');
        p.setTimeFilter('all');
      }
      // 6. Return to inbox
      else if (p.filter !== 'inbox') {
        p.handleFilterChange('inbox');
      }
      // 7. Exit app
      else {
        await CapacitorApp.exitApp();
      }
    };

    let activeListener: { remove: () => void | Promise<void> } | null = null;
    let isCleanedUp = false;

    const isAppAvailable =
      Capacitor.isNativePlatform() &&
      Capacitor.getPlatform() !== 'web' &&
      Capacitor.isPluginAvailable('App');

    if (typeof window !== 'undefined' && isAppAvailable) {
      CapacitorApp.addListener('backButton', handleBackButton)
        .then((l) => {
          if (isCleanedUp) {
            l.remove();
          } else {
            activeListener = l;
          }
        })
        .catch((err) => {
          console.error('Failed to add backButton listener', err);
        });
    }

    return () => {
      isCleanedUp = true;
      if (activeListener) {
        try {
          activeListener.remove();
        } catch (e) {
          console.error('Error removing backButton listener', e);
        }
      }
    };
  }, []); // Empty dependency array ensures listener is registered exactly once!
}
