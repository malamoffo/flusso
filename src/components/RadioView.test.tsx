// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { RadioView } from './RadioView';
import { radioService } from '../services/radioService';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('RadioView detail test', () => {
  it('opens and closes station detail modal when station card is clicked', async () => {
    // Mock station
    const mockStation: import('../types').RadioStation = {
      stationuuid: 'test-uuid-1',
      name: 'Radio Test One',
      url: 'http://test.com/stream',
      url_resolved: 'http://test.com/stream',
      favicon: 'http://test.com/logo.png',
      tags: 'pop,news',
      country: 'Italia',
      countrycode: 'IT',
      state: 'Lazio',
      language: 'Italiano',
      homepage: 'http://test.com',
      votes: 100
    };

    vi.spyOn(radioService, 'getStations').mockReturnValue([mockStation]);
    vi.spyOn(radioService, 'subscribe').mockImplementation((listener) => {
      listener({
        stations: [mockStation],
        isLoading: false,
        isPreloaded: true,
        lastUpdated: Date.now(),
        error: null,
        activeQuery: '',
      });
      return () => {};
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RadioView isActive={true} searchQuery="" />);
    });

    // Check if station card is rendered
    const stationName = Array.from(document.querySelectorAll('h3')).find(
      el => el.textContent?.includes('Radio Test One')
    );
    expect(stationName).toBeDefined();

    // Click station card
    const card = stationName?.closest('.cursor-pointer');
    expect(card).toBeDefined();

    await act(async () => {
      (card as HTMLElement)?.click();
    });

    // Check if modal opened
    const modal = document.querySelector('article');
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain('Radio Test One');

    // Click close button
    const closeBtn = document.querySelector('button[aria-label="Chiudi"]');
    expect(closeBtn).not.toBeNull();

    await act(async () => {
      (closeBtn as HTMLElement)?.click();
    });
  });
});
