import { RadioStation } from '../types';
import { Logger } from '../lib/logger';
import { db } from './db';
import RadioWorker from '../workers/radio.worker.ts?worker';

const STORAGE_CACHE_KEY = 'flusso_preloaded_radio_stations';

export interface RadioServiceState {
  stations: RadioStation[];
  isLoading: boolean;
  isPreloaded: boolean;
  lastUpdated: number | null;
  error: string | null;
  activeQuery: string;
}

type Listener = (state: RadioServiceState) => void;

class RadioService {
  private worker: Worker | null = null;
  private listeners: Set<Listener> = new Set();
  private state: RadioServiceState = {
    stations: [],
    isLoading: false,
    isPreloaded: false,
    lastUpdated: null,
    error: null,
    activeQuery: '',
  };
  private preloadedDefaultStations: RadioStation[] = [];
  private isWorkerInitializing = false;
  private hasStartedPreload = false;

  constructor() {
    // Synchronously warm up from persistent storage so stations are ready in 0ms
    this.hydrateFromStorage();
  }

  private hydrateFromStorage() {
    try {
      const cached = localStorage.getItem(STORAGE_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.state.stations = parsed;
          this.preloadedDefaultStations = parsed;
          this.state.isPreloaded = true;
          Logger.log(`[RadioService] Hydrated ${parsed.length} stations from localStorage cache`);
        }
      }
    } catch (e) {
      Logger.warn('[RadioService] Failed to read cached radio stations from storage', e);
    }

    // Also check IndexedDB kv asynchronously
    db.kv.get('cached_radio_stations').then(record => {
      if (record && Array.isArray(record.value) && record.value.length > 0) {
        if (this.state.stations.length === 0) {
          this.state.stations = record.value;
          this.preloadedDefaultStations = record.value;
          this.state.isPreloaded = true;
          this.notify();
          Logger.log(`[RadioService] Hydrated ${record.value.length} stations from IndexedDB`);
        }
      }
    }).catch(() => {});
  }

  private persistCache(stations: RadioStation[]) {
    if (!Array.isArray(stations) || stations.length === 0) return;
    try {
      localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(stations.slice(0, 100)));
    } catch {}
    db.kv.put({ id: 'cached_radio_stations', value: stations }).catch(() => {});
  }

  private initWorker() {
    if (this.worker || this.isWorkerInitializing) return;
    this.isWorkerInitializing = true;

    try {
      this.worker = new RadioWorker();

      this.worker.onmessage = (e: MessageEvent) => {
        const { type, stations, query, error, isPreload } = e.data || {};

        if (type === 'stationsFetched') {
          const list = Array.isArray(stations) ? stations : [];
          Logger.log(`[RadioService] Worker returned ${list.length} stations (query: "${query || ''}")`);

          if (!query || isPreload) {
            this.preloadedDefaultStations = list;
            this.persistCache(list);
          }

          // Update state if this response matches active query or was preload
          if (query === this.state.activeQuery || (!query && !this.state.activeQuery)) {
            this.state.stations = list;
            this.state.isLoading = false;
            this.state.isPreloaded = true;
            this.state.lastUpdated = Date.now();
            this.state.error = null;
            this.notify();
          }
        } else if (type === 'fetchError') {
          Logger.warn(`[RadioService] Worker reported fetch error: ${error}`);
          if (query === this.state.activeQuery) {
            this.state.isLoading = false;
            this.state.error = error || 'Impossibile caricare le stazioni radio';
            this.notify();
          }
        }
      };

      this.worker.onerror = (err) => {
        Logger.error('[RadioService] RadioWorker error', err);
        this.state.isLoading = false;
        this.notify();
      };

      this.isWorkerInitializing = false;
    } catch (e) {
      Logger.error('[RadioService] Could not instantiate RadioWorker, fallback to main thread fetch', e);
      this.isWorkerInitializing = false;
      this.worker = null;
    }
  }

  /**
   * Starts background preloading in an isolated Web Worker thread.
   * Can be called anytime, including at application boot before user opens the Radio section.
   */
  public preload() {
    if (this.hasStartedPreload && this.state.isPreloaded) return;
    this.hasStartedPreload = true;

    this.initWorker();

    if (this.worker) {
      Logger.log('[RadioService] Dispatching preload job to isolated Web Worker thread');
      this.worker.postMessage({ type: 'preload' });
    } else {
      // Fallback if workers are disabled
      this.fallbackFetch('');
    }
  }

  /**
   * Searches stations via the isolated Web Worker thread.
   */
  public search(query: string = '') {
    const trimmed = query.trim();
    this.state.activeQuery = trimmed;

    // If query is empty and we have preloaded stations, use them immediately
    if (!trimmed && this.preloadedDefaultStations.length > 0) {
      this.state.stations = this.preloadedDefaultStations;
      this.state.isLoading = false;
      this.notify();
      return;
    }

    this.state.isLoading = true;
    this.state.error = null;
    this.notify();

    this.initWorker();

    if (this.worker) {
      this.worker.postMessage({
        type: 'fetchStations',
        query: trimmed,
      });
    } else {
      this.fallbackFetch(trimmed);
    }
  }

  /**
   * Refreshes the current list of stations via background worker.
   */
  public refresh() {
    this.state.isLoading = true;
    this.notify();
    this.initWorker();
    if (this.worker) {
      this.worker.postMessage({
        type: 'fetchStations',
        query: this.state.activeQuery,
      });
    } else {
      this.fallbackFetch(this.state.activeQuery);
    }
  }

  private async fallbackFetch(query: string) {
    const mirrors = [
      'https://de1.api.radio-browser.info',
      'https://at1.api.radio-browser.info',
      'https://nl1.api.radio-browser.info',
      'https://fr1.api.radio-browser.info',
    ];

    let lastError: any = null;
    let stations: RadioStation[] = [];

    for (const mirror of mirrors) {
      try {
        const response = await fetch(`${mirror}/json/stations/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            countrycode: 'IT',
            limit: 100,
            name: query,
            hidebroken: true,
            order: 'clickcount',
            reverse: true,
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (Array.isArray(data)) {
          stations = data;
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (stations.length > 0) {
      if (!query) {
        this.preloadedDefaultStations = stations;
        this.persistCache(stations);
      }
      this.state.stations = stations;
      this.state.isLoading = false;
      this.state.isPreloaded = true;
      this.state.lastUpdated = Date.now();
      this.state.error = null;
    } else {
      this.state.isLoading = false;
      this.state.error = lastError?.message || 'Errore caricamento radio';
    }
    this.notify();
  }

  public getState(): RadioServiceState {
    return { ...this.state };
  }

  public getStations(): RadioStation[] {
    return this.state.stations;
  }

  public isLoading(): boolean {
    return this.state.isLoading;
  }

  public isPreloaded(): boolean {
    return this.state.isPreloaded;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Immediately notify subscriber with current state
    listener({ ...this.state });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentState = { ...this.state };
    for (const listener of this.listeners) {
      try {
        listener(currentState);
      } catch (err) {
        console.error('[RadioService] Error in listener', err);
      }
    }
  }
}

export const radioService = new RadioService();
