import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';

export class UnreachableError extends Error {
  unreachable = true;
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'UnreachableError';
    this.status = status;
  }
}

function getHeader(headers: Record<string, string | undefined> | Headers, name: string): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(name) || undefined;
  }
  const lowerName = name.toLowerCase();
  for (const key in headers) {
    if (key.toLowerCase() === lowerName) {
      return headers[key];
    }
  }
  return undefined;
}

/**
 * Direct Content & Feed Fetcher
 * - Uses CapacitorHttp on native iOS/Android (bypasses CORS completely).
 * - Uses direct fetch in Web / development environments.
 */
export async function fetchWithProxy(
  url: string, 
  isRss: boolean = true, 
  sinceDate?: number, 
  signal?: AbortSignal, 
  etag?: string, 
  lastModified?: string, 
  _isHtml: boolean = false
): Promise<{ data: string, etag?: string, lastModified?: string }> {
  const isNative = Capacitor.isNativePlatform();

  // 1. Native platform (CapacitorHttp)
  if (isNative) {
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': isRss 
          ? 'application/rss+xml, application/xml, text/xml, */*' 
          : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      };

      if (sinceDate) {
        headers['If-Modified-Since'] = new Date(sinceDate).toUTCString();
      }
      if (etag) {
        headers['If-None-Match'] = etag;
      }
      if (lastModified) {
        headers['If-Modified-Since'] = lastModified;
      }

      const response = await CapacitorHttp.get({
        url,
        headers,
        connectTimeout: 10000,
        readTimeout: 10000
      });

      if (response.status === 304) {
        return { 
          data: '',
          etag: getHeader(response.headers, 'etag'),
          lastModified: getHeader(response.headers, 'last-modified')
        };
      }
      if (response.status >= 200 && response.status < 300) {
        return {
          data: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
          etag: getHeader(response.headers, 'etag'),
          lastModified: getHeader(response.headers, 'last-modified')
        };
      }
      throw new Error(`Native fetch failed with status ${response.status}`);
    } catch (e: any) {
      if (e?.code !== 'UNIMPLEMENTED') {
        console.warn(`[DirectFetch] Native fetch failed for ${url} (Error: ${e.message})`);
      }
      throw e;
    }
  }

  // 2. Web / Dev Direct Fetch
  if (signal?.aborted) throw new Error('Aborted');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const headers: Record<string, string> = {
    'Accept': isRss 
      ? 'application/rss+xml, application/xml, text/xml, */*' 
      : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };

  if (sinceDate) {
    headers['If-Modified-Since'] = new Date(sinceDate).toUTCString();
  }
  if (etag) {
    headers['If-None-Match'] = etag;
  }
  if (lastModified) {
    headers['If-Modified-Since'] = lastModified;
  }

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers
    });
    clearTimeout(timeoutId);
    
    if (response.status === 304) {
      return { 
        data: '',
        etag: getHeader(response.headers, 'etag'),
        lastModified: getHeader(response.headers, 'last-modified')
      };
    }

    if (response.ok) {
      const text = await response.text();
      return {
        data: text,
        etag: getHeader(response.headers, 'etag'),
        lastModified: getHeader(response.headers, 'last-modified')
      };
    } else {
      if (response.status === 404 || response.status === 410 || response.status === 400 || response.status === 502 || response.status === 503 || response.status === 504) {
        throw new UnreachableError(response.status, `Direct fetch returned unreachable status ${response.status}`);
      }
      throw new Error(`Fetch failed with status ${response.status}`);
    }
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (signal?.aborted) throw new Error('Aborted');
    throw e;
  }
}

