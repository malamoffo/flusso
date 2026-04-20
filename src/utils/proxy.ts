import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';

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

export async function fetchWithProxy(url: string, isRss: boolean = true, sinceDate?: number, signal?: AbortSignal, etag?: string, lastModified?: string): Promise<{ data: string, etag?: string, lastModified?: string }> {
  // On native platforms, we don't need proxies as there's no CORS restriction
  if (Capacitor.isNativePlatform()) {
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.40 Mobile Safari/537.36',
        ...(isRss ? { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' } : {})
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
        connectTimeout: 7500,
        readTimeout: 7500
      });

      if (response.status === 304) return { 
        data: '',
        etag: getHeader(response.headers, 'etag'),
        lastModified: getHeader(response.headers, 'last-modified')
      };
      if (response.status >= 200 && response.status < 300) {
        return {
          data: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
          etag: getHeader(response.headers, 'etag'),
          lastModified: getHeader(response.headers, 'last-modified')
        };
      }
      throw new Error(`Native fetch failed with status ${response.status}`);
    } catch (e) {
      console.error(`Native fetch failed for ${url}, retrying with standard fetch:`, e);
      // Fallback to standard fetch if CapacitorHttp fails for some reason
    }
  }

  // First try direct fetch (in case CORS is enabled on the target server)
  try {
    if (signal?.aborted) throw new Error('Aborted');

    const directController = new AbortController();
    const directTimeoutId = setTimeout(() => directController.abort(), 5000);
    
    // Link external signal to our internal controller
    if (signal) {
      signal.addEventListener('abort', () => directController.abort(), { once: true });
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      ...(isRss ? { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' } : {})
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

    const directResponse = await fetch(url, {
      signal: directController.signal,
      headers
    });
    clearTimeout(directTimeoutId);
    
    if (directResponse.status === 304) {
      return { 
        data: '',
        etag: getHeader(directResponse.headers, 'etag'),
        lastModified: getHeader(directResponse.headers, 'last-modified')
      }; // Return empty to indicate no new content
    }

    if (directResponse.ok) {
      const text = await directResponse.text();
      if (isRss) {
        if (text && text.trim().length > 0 && (text.includes('<rss') || text.includes('<feed') || text.includes('<?xml') || text.includes('<rdf:RDF'))) {
          return {
            data: text,
            etag: getHeader(directResponse.headers, 'etag'),
            lastModified: getHeader(directResponse.headers, 'last-modified')
          };
        }
      } else {
        return {
          data: text,
          etag: getHeader(directResponse.headers, 'etag'),
          lastModified: getHeader(directResponse.headers, 'last-modified')
        };
      }
    }
  } catch (e: any) {
    if (signal?.aborted) throw new Error('Aborted');
    // Direct fetch failed (likely CORS or timeout), fallback to proxies
  }

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    ...(isRss ? { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' } : {})
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

  const proxies: { name: string, url: string, type: 'text' | 'json' | 'rss2json', timeout?: number }[] = [];
  
  const baseProxies: { name: string, url: string, type: 'text' | 'json' | 'rss2json', timeout?: number }[] = [
    { name: 'CorsProxy.io', url: `https://corsproxy.io/?${encodeURIComponent(url)}`, type: 'text', timeout: 6000 },
    { name: 'AllOrigins Raw', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, type: 'text', timeout: 7500 },
    { name: 'CodeTabs', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, type: 'text', timeout: 6000 },
    { name: 'CorsProxy.org', url: `https://corsproxy.org/?url=${encodeURIComponent(url)}`, type: 'text', timeout: 6000 },
    { name: 'AllOrigins JSON', url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, type: 'json', timeout: 7500 },
    { name: 'YACDN', url: `https://yacdn.org/proxy/${url}`, type: 'text', timeout: 6000 },
    { name: 'Cloudflare Worker', url: `https://cors-anywhere.azm.workers.dev/${url}`, type: 'text', timeout: 6000 },
    { name: 'ThingProxy', url: `https://thingproxy.freeboard.io/fetch/${url}`, type: 'text', timeout: 7500 },
    { name: 'CORS.sh', url: `https://proxy.cors.sh/${url}`, type: 'text', timeout: 6000 },
    { name: 'CORS-Anywhere Demo', url: `https://cors-anywhere.herokuapp.com/${url}`, type: 'text', timeout: 7500 }
  ];

  // Shuffle proxies to distribute load
  const shuffledBase = [...baseProxies].sort(() => Math.random() - 0.5);
  proxies.push(...shuffledBase);

  // Add RSS2JSON as a fallback at the end if it's an RSS feed
  if (isRss) {
    proxies.push({ name: 'RSS2JSON', url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`, type: 'rss2json', timeout: 7500 });
  }

  let lastError: any;
  const defaultTimeout = 6000; // Increased from 8s to 12s per proxy

  for (let i = 0; i < proxies.length; i++) {
    if (signal?.aborted) throw new Error('Aborted');
    
    const proxy = proxies[i];
    const timeout = proxy.timeout ? Math.min(proxy.timeout, 7500) : defaultTimeout;
    
    let id: any;
    try {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Reduced from 500ms to 200ms delay
      }
      
      const controller = new AbortController();
      id = setTimeout(() => controller.abort(), timeout);
      
      // Link external signal to our internal controller
      if (signal) {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      
      const response = await fetch(proxy.url, { 
        signal: controller.signal,
        headers: proxy.type === 'text' ? headers : undefined // Only send headers to text/raw proxies
      });
      clearTimeout(id);

      if (response.status === 304) {
        return { 
          data: '',
          etag: getHeader(response.headers, 'etag'),
          lastModified: getHeader(response.headers, 'last-modified')
        };
      }

      if (response.ok) {
        let text = '';
        if (proxy.type === 'json') {
          const data = await response.json();
          text = typeof data.contents === 'string' ? data.contents : JSON.stringify(data.contents);
        } else if (proxy.type === 'rss2json') {
          const data = await response.json();
          if (data.status === 'ok') {
            return { data: JSON.stringify(data) }; // Return the JSON string, parseRssXml will handle it
          } else {
            lastError = new Error(`rss2json returned error: ${data.message}`);
            continue;
          }
        } else {
          text = await response.text();
        }
        
        if (text && text.trim().length > 0) {
          const trimmed = text.trim();
          if (isRss) {
            if (trimmed.includes('<rss') || trimmed.includes('<feed') || trimmed.includes('<?xml') || trimmed.includes('<rdf:RDF') || trimmed.startsWith('{')) {
              return {
                data: text,
                etag: getHeader(response.headers, 'etag'),
                lastModified: getHeader(response.headers, 'last-modified')
              };
            } else {
              lastError = new Error(`Proxy ${proxy.name} returned invalid content (not XML/RSS)`);
              continue;
            }
          } else {
            // For non-RSS (likely JSON/API), ensure it doesn't look like HTML unless it's a known HTML source like Telegram
            const isTelegram = url.includes('t.me/');
            if (!isTelegram && trimmed.startsWith('<') && (trimmed.toLowerCase().includes('<html') || trimmed.toLowerCase().includes('<body') || trimmed.toLowerCase().includes('<!doctype'))) {
              lastError = new Error(`Proxy ${proxy.name} returned HTML instead of expected JSON/API response`);
              continue;
            }
            return {
              data: text,
              etag: getHeader(response.headers, 'etag'),
              lastModified: getHeader(response.headers, 'last-modified')
            };
          }
        } else {
          lastError = new Error(`Proxy ${proxy.name} returned empty response`);
          continue;
        }
      }
      lastError = new Error(`Proxy ${proxy.name} returned status ${response.status}`);
    } catch (e: any) {
      clearTimeout(id);
      if (e.name === 'AbortError') {
        lastError = new Error(`Proxy ${proxy.name} timed out after ${timeout}ms`);
      } else {
        lastError = e;
      }
    }
  }
  throw lastError || new Error('Failed to fetch from all proxies.');
}
