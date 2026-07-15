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

export async function fetchWithProxy(url: string, isRss: boolean = true, sinceDate?: number, signal?: AbortSignal, etag?: string, lastModified?: string, isHtml: boolean = false): Promise<{ data: string, etag?: string, lastModified?: string }> {
  // On native platforms, we MUST use direct fetch or CapacitorHttp (if bridged). 
  // We NEVER use web proxies as they aren't accessible or don't work natively.
  const isNative = Capacitor.isNativePlatform();

  // Try CapacitorHttp first if available
  if (isNative) {
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
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
        connectTimeout: 30000,
        readTimeout: 30000
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
    } catch (e: any) {
        if (e?.code !== 'UNIMPLEMENTED') {
          console.warn(`[Proxy] Direct native fetch failed for ${url} (Error: ${e.message}).`);
        }
        throw e; // Rethrow to stop fallback to web proxies
    }
  }

  // Web flow (with proxies)
  const isWeb = Capacitor.getPlatform() === 'web';
  
  // First try direct fetch (in case CORS is enabled on the target server)
  try {
    if (signal?.aborted) throw new Error('Aborted');

    const directController = new AbortController();
    const directTimeoutId = setTimeout(() => directController.abort(), 30000);
    
    // Link external signal to our internal controller
    if (signal) {
      signal.addEventListener('abort', () => directController.abort(), { once: true });
    }

    const headers: Record<string, string> = {
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
    } else {
      if (directResponse.status === 404 || directResponse.status === 410 || directResponse.status === 400 || directResponse.status === 502 || directResponse.status === 503 || directResponse.status === 504) {
        throw new UnreachableError(directResponse.status, `Direct fetch returned unreachable status ${directResponse.status}`);
      }
    }
  } catch (e: any) {
    if (signal?.aborted) throw new Error('Aborted');
    if (e.unreachable) throw e;
    // Direct fetch failed (likely CORS or timeout), fallback to proxies
  }

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'X-Requested-With': 'XMLHttpRequest',
    ...(isRss ? { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' } : { 'Accept': 'application/json, text/plain, */*' })
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
    { name: 'AllOrigins Raw', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, type: 'text', timeout: 15000 },
    { name: 'AllOrigins JSON', url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, type: 'json', timeout: 15000 },
    { name: 'CorsProxy.io', url: `https://corsproxy.io/?${encodeURIComponent(url)}`, type: 'text', timeout: 12000 },
    { name: 'CodeTabs', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, type: 'text', timeout: 12000 },
    { name: 'YACDN', url: `https://yacdn.org/proxy/${url}`, type: 'text', timeout: 12000 },
    { name: 'CorsProxy.org', url: `https://corsproxy.org/?url=${encodeURIComponent(url)}`, type: 'text', timeout: 12000 },
    { name: 'Cloudflare Worker', url: `https://cors-anywhere.azm.workers.dev/${url}`, type: 'text', timeout: 12000 },
    { name: 'ThingProxy', url: `https://thingproxy.freeboard.io/fetch/${url}`, type: 'text', timeout: 15000 },
    { name: 'CORS-Anywhere Demo', url: `https://cors-anywhere.herokuapp.com/${url}`, type: 'text', timeout: 15000 },
  ];

  // Remove shuffling of proxies to prevent IP-based rate limiting on services
  const orderedBase = [...baseProxies];
  proxies.push(...orderedBase);

  // Add RSS2JSON as a fallback at the end if it's an RSS feed
  if (isRss) {
    proxies.push({ name: 'RSS2JSON', url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`, type: 'rss2json', timeout: 10000 });
  }

  let lastError: any;
  const defaultTimeout = 12000;

  for (let i = 0; i < proxies.length; i++) {
    if (signal?.aborted) throw new Error('Aborted');
    
    const proxy = proxies[i];
    const timeout = proxy.timeout ? Math.min(proxy.timeout, 15000) : defaultTimeout;
    
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
          const lowerTrimmed = trimmed.toLowerCase();

          if (isRss) {
            // More robust RSS detection
            const hasRssTag = lowerTrimmed.includes('<rss') || lowerTrimmed.includes('<feed') || lowerTrimmed.includes('<rdf:rdf');
            const hasXmlDeclaration = lowerTrimmed.startsWith('<?xml');
            const isJson = trimmed.startsWith('{');

            if (hasRssTag || hasXmlDeclaration || isJson) {
              // Check if it's accidentally HTML
              if (!isJson && (lowerTrimmed.includes('<html') || lowerTrimmed.includes('<!doctype html'))) {
                lastError = new Error(`Proxy ${proxy.name} returned HTML instead of RSS XML`);
                continue;
              }
              
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
            // For non-RSS (likely JSON/API), ensure it doesn't look like HTML unless explicitly requested
            if (!isHtml && trimmed.startsWith('<') && (lowerTrimmed.includes('<html') || lowerTrimmed.includes('<body') || lowerTrimmed.includes('<!doctype'))) {
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
      } else {
        if (response.status === 404 || response.status === 410 || response.status === 400 || response.status === 502 || response.status === 503 || response.status === 504) {
          throw new UnreachableError(response.status, `Proxy ${proxy.name} returned unreachable status ${response.status}`);
        }
      }
      lastError = new Error(`Proxy ${proxy.name} returned status ${response.status}`);
    } catch (e: any) {
      clearTimeout(id);
      if (e.name === 'AbortError') {
        lastError = new Error(`Proxy ${proxy.name} timed out after ${timeout}ms`);
      } else if (e.message === 'Aborted') {
        lastError = e;
      } else if (e.unreachable) {
        throw e;
      } else {
        lastError = e;
      }
    }
  }
  throw lastError || new Error('Failed to fetch from all proxies.');
}
