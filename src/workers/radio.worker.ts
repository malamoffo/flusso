import { RadioStation } from '../types';

const MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://fr1.api.radio-browser.info',
];

interface WorkerMessage {
  type: 'preload' | 'fetchStations';
  query?: string;
  countrycode?: string;
  limit?: number;
  requestId?: string;
}

let cachedDefaultStations: RadioStation[] = [];

/**
 * Executes a network fetch across distributed Radio Browser mirrors with fast failover.
 * All JSON parsing, sanitization, deduplication, and field normalization
 * take place exclusively within this isolated Web Worker thread.
 */
async function fetchStationsFromMirrors(
  query: string = '',
  countrycode: string = 'IT',
  limit: number = 100
): Promise<RadioStation[]> {
  let lastError: any = null;

  for (const mirror of MIRRORS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8500);

      const response = await fetch(`${mirror}/json/stations/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          countrycode,
          limit,
          name: query.trim(),
          hidebroken: true,
          order: 'clickcount',
          reverse: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }

      const rawData = await response.json();
      if (!Array.isArray(rawData)) {
        throw new Error('Radio Browser response is not an array');
      }

      // Parallel thread processing: Deduplication, sanitization, validation
      const seenUuids = new Set<string>();
      const seenUrls = new Set<string>();
      const stations: RadioStation[] = [];

      for (const item of rawData) {
        const uuid = item.stationuuid;
        const resolvedUrl = item.url_resolved || item.url;
        if (!uuid || !resolvedUrl) continue;

        if (seenUuids.has(uuid) || seenUrls.has(resolvedUrl)) continue;
        seenUuids.add(uuid);
        seenUrls.add(resolvedUrl);

        stations.push({
          stationuuid: String(uuid),
          name: String(item.name || 'Senza nome').trim(),
          url: String(item.url || ''),
          url_resolved: String(resolvedUrl),
          homepage: String(item.homepage || ''),
          favicon: String(item.favicon || ''),
          tags: String(item.tags || ''),
          country: String(item.country || 'Italy'),
          countrycode: String(item.countrycode || 'IT'),
          state: String(item.state || ''),
          language: String(item.language || ''),
          votes: Number(item.votes) || 0,
        });
      }

      return stations;
    } catch (err: any) {
      lastError = err;
      // Try next mirror
    }
  }

  throw lastError || new Error('All Radio Browser mirrors failed to respond');
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, query = '', countrycode = 'IT', limit = 100, requestId } = e.data || {};

  if (type === 'preload') {
    try {
      const stations = await fetchStationsFromMirrors('', countrycode, limit);
      cachedDefaultStations = stations;
      self.postMessage({
        type: 'stationsFetched',
        stations,
        query: '',
        requestId,
        isPreload: true,
      });
    } catch (err: any) {
      self.postMessage({
        type: 'fetchError',
        error: err?.message || 'Preload failed',
        query: '',
        requestId,
        isPreload: true,
      });
    }
  } else if (type === 'fetchStations') {
    // If querying empty string and preloaded stations are already cached, return immediately
    if (!query.trim() && cachedDefaultStations.length > 0) {
      self.postMessage({
        type: 'stationsFetched',
        stations: cachedDefaultStations,
        query: '',
        requestId,
      });
      return;
    }

    try {
      const stations = await fetchStationsFromMirrors(query, countrycode, limit);
      if (!query.trim()) {
        cachedDefaultStations = stations;
      }
      self.postMessage({
        type: 'stationsFetched',
        stations,
        query,
        requestId,
      });
    } catch (err: any) {
      // Fallback: If network failed during search but we have preloaded stations, perform thread-local search
      if (query.trim() && cachedDefaultStations.length > 0) {
        const q = query.toLowerCase();
        const filtered = cachedDefaultStations.filter(
          s => s.name.toLowerCase().includes(q) || s.tags.toLowerCase().includes(q)
        );
        self.postMessage({
          type: 'stationsFetched',
          stations: filtered,
          query,
          requestId,
          fallback: true,
        });
        return;
      }

      self.postMessage({
        type: 'fetchError',
        error: err?.message || 'Failed to fetch radio stations',
        query,
        requestId,
      });
    }
  }
};
