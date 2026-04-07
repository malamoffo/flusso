import { Capacitor, CapacitorHttp } from '@capacitor/core';

export async function fetchWithProxy(url: string, isRss: boolean = true, sinceDate?: number, externalSignal?: AbortSignal): Promise<string> {
  // Check if we are on a native platform (Android/iOS)
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();

  if (isNative) {
    try {
      if (externalSignal?.aborted) throw new Error('Aborted');
      console.log(`[PROXY] Native direct fetch via CapacitorHttp: ${url}`);
      
      const headers: Record<string, string> = {
        ...(isRss ? { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' } : { 'Accept': 'application/json, text/plain, */*' })
      };

      if (sinceDate) {
        headers['If-Modified-Since'] = new Date(sinceDate).toUTCString();
      }

      const response = await CapacitorHttp.get({
        url,
        headers,
        connectTimeout: 15000,
        readTimeout: 15000
      });

      if (response.status === 304) {
        return '';
      }

      if (response.status === 200) {
        const dataString = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        if (dataString && dataString.trim().length > 0) {
          return dataString;
        }
      }
      console.warn(`Native fetch failed for ${url} with status ${response.status}`);
    } catch (e: any) {
      if (externalSignal?.aborted) throw new Error('Aborted');
      console.warn(`Native fetch failed for ${url}: ${e.message || e}`);
      // Fallback to web proxies if native fetch fails for some reason
    }
  }

  // First try direct fetch (in case CORS is enabled on the target server)
  try {
    if (externalSignal?.aborted) throw new Error('Aborted');

    const directController = new AbortController();
    const directTimeoutId = setTimeout(() => directController.abort(), 20000);
    
    // Link external signal to our internal controller
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => directController.abort(), { once: true });
    }

    // Note: User-Agent is a forbidden header in browsers, but we keep it for non-browser environments if applicable.
    // In browser, it will likely be ignored or cause a warning, but shouldn't crash.
    const headers: Record<string, string> = {
      ...(isRss ? { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' } : { 'Accept': 'application/json, text/plain, */*' }),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };

    if (sinceDate) {
      headers['If-Modified-Since'] = new Date(sinceDate).toUTCString();
    }

    const directResponse = await fetch(url, {
      signal: directController.signal,
      headers
    });
    clearTimeout(directTimeoutId);
    
    if (directResponse.status === 304) {
      console.log(`Direct fetch returned 304 Not Modified for ${url}`);
      return ''; // Return empty to indicate no new content
    }

    if (directResponse.ok) {
      const text = await directResponse.text();
      if (isRss) {
        const trimmed = text.trim();
        if (trimmed.length > 0 && (trimmed.includes('<rss') || trimmed.includes('<feed') || trimmed.includes('<?xml') || trimmed.includes('<rdf:RDF') || trimmed.startsWith('{'))) {
          console.log(`Successfully fetched directly: ${url}`);
          return text;
        }
      } else {
        if (text && text.trim().length > 0) {
          console.log(`Successfully fetched directly: ${url}`);
          return text;
        }
      }
    } else {
      console.warn(`Direct fetch failed for ${url} with status ${directResponse.status}`);
    }
  } catch (e: any) {
    if (externalSignal?.aborted) throw new Error('Aborted');
    console.warn(`Direct fetch failed for ${url}: ${e.message || e}`);
    // Direct fetch failed (likely CORS or timeout), fallback to proxies
  }

  const proxies: { name: string, url: string, type: 'text' | 'json' | 'rss2json', timeout?: number }[] = [];
  
  // Primary proxies (more reliable)
  proxies.push(
    { name: 'AllOrigins Raw', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, type: 'text', timeout: 25000 },
    { name: 'AllOrigins Raw (Unencoded)', url: `https://api.allorigins.win/raw?url=${url}`, type: 'text', timeout: 25000 },
    { name: 'CorsProxy.io', url: `https://corsproxy.io/?${url}`, type: 'text' },
    { name: 'CorsProxy.io (Encoded)', url: `https://corsproxy.io/?${encodeURIComponent(url)}`, type: 'text' },
    { name: 'CorsProxy.org', url: `https://corsproxy.org/?url=${encodeURIComponent(url)}`, type: 'text' },
    { name: 'CorsProxy.org (Unencoded)', url: `https://corsproxy.org/?url=${url}`, type: 'text' },
    { name: 'CodeTabs', url: `https://api.codetabs.com/v1/proxy?quest=${url}`, type: 'text' },
    { name: 'CodeTabs (Encoded)', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, type: 'text' },
    { name: 'Proxy.cors.sh', url: `https://proxy.cors.sh/${url}`, type: 'text' },
    { name: 'Proxy.cors.sh (Encoded)', url: `https://proxy.cors.sh/${encodeURIComponent(url)}`, type: 'text' }
  );

  // RSS specific proxy
  if (isRss) {
    proxies.push(
      { name: 'RSS2JSON', url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`, type: 'rss2json', timeout: 25000 },
      { name: 'RSS2JSON (Unencoded)', url: `https://api.rss2json.com/v1/api.json?rss_url=${url}`, type: 'rss2json', timeout: 25000 }
    );
  }

  // Secondary proxies
  proxies.push(
    { name: 'ThingProxy', url: `https://thingproxy.freeboard.io/fetch/${url}`, type: 'text' },
    { name: 'ThingProxy (Encoded)', url: `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(url)}`, type: 'text' },
    { name: 'YACDN', url: `https://yacdn.org/proxy/${url}`, type: 'text' },
    { name: 'YACDN (Encoded)', url: `https://yacdn.org/proxy/${encodeURIComponent(url)}`, type: 'text' },
    { name: 'AllOrigins Raw (Buster)', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}&_=${Date.now()}`, type: 'text' },
    { name: 'Cloudflare Worker', url: `https://cors-anywhere.azm.workers.dev/${url}`, type: 'text' },
    { name: 'Cloudflare Worker (Encoded)', url: `https://cors-anywhere.azm.workers.dev/${encodeURIComponent(url)}`, type: 'text' },
    { name: 'AllOrigins JSON', url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, type: 'json' },
    { name: 'AllOrigins JSON (Unencoded)', url: `https://api.allorigins.win/get?url=${url}`, type: 'json' }
  );

  let lastError: any;
  const defaultTimeout = 15000; // Increased to 15 seconds timeout per proxy

  for (let i = 0; i < proxies.length; i++) {
    if (externalSignal?.aborted) throw new Error('Aborted');
    
    const proxy = proxies[i];
    const timeout = proxy.timeout || defaultTimeout;
    console.log(`Attempting fetch via ${proxy.name} for ${url} (timeout: ${timeout}ms)`);
    
    let id: any;
    try {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 800)); // 800ms delay between retries to avoid rate limiting
      }
      
      const controller = new AbortController();
      id = setTimeout(() => controller.abort(), timeout);
      
      // Link external signal to our internal controller
      if (externalSignal) {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      
      const response = await fetch(proxy.url, { 
        signal: controller.signal,
        headers: {
          'Accept': isRss ? 'application/rss+xml, application/xml, text/xml, */*' : 'application/json, text/plain, */*'
        }
      });
      clearTimeout(id);
      
      if (response.ok) {
        let text = '';
        if (proxy.type === 'json') {
          const data = await response.json();
          text = data.contents || '';
        } else if (proxy.type === 'rss2json') {
          const data = await response.json();
          if (data.status === 'ok') {
            console.log(`Successfully fetched via ${proxy.name} (RSS2JSON)`);
            return JSON.stringify(data); // Return the JSON string, parseRssXml will handle it
          } else {
            lastError = new Error(`rss2json returned error: ${data.message}`);
            console.warn(`${proxy.name} returned error: ${data.message}`);
            continue;
          }
        } else {
          text = await response.text();
        }
        
        if (text && text.trim().length > 0) {
          if (isRss) {
            const trimmed = text.trim().toLowerCase();
            // Check if it looks like XML or JSON
            if (trimmed.includes('<rss') || trimmed.includes('<feed') || trimmed.includes('<?xml') || trimmed.includes('<rdf:rdf') || trimmed.startsWith('{')) {
              console.log(`Successfully fetched via ${proxy.name}`);
              return text;
            } else {
              const snippet = trimmed.substring(0, 100).replace(/\n/g, ' ');
              lastError = new Error(`Proxy ${proxy.name} returned invalid content (not XML/RSS). Snippet: ${snippet}`);
              console.warn(`${proxy.name} returned invalid content for ${url}. Snippet: ${snippet}`);
              continue;
            }
          } else {
            const trimmed = text.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              try {
                // Verify it's valid JSON
                JSON.parse(trimmed);
                console.log(`Successfully fetched via ${proxy.name}`);
                return text;
              } catch (e) {
                lastError = new Error(`Proxy ${proxy.name} returned malformed JSON content.`);
                console.warn(`${proxy.name} returned malformed JSON for ${url}`);
                continue;
              }
            } else {
              const snippet = trimmed.substring(0, 100).replace(/\n/g, ' ');
              lastError = new Error(`Proxy ${proxy.name} returned invalid JSON content. Snippet: ${snippet}`);
              console.warn(`${proxy.name} returned invalid JSON for ${url}. Snippet: ${snippet}`);
              continue;
            }
          }
        } else {
          lastError = new Error(`Proxy ${proxy.name} returned empty response`);
          console.warn(`${proxy.name} returned empty response for ${url}`);
          continue;
        }
      } else {
        lastError = new Error(`Proxy ${proxy.name} returned status ${response.status}`);
        console.warn(`${proxy.name} failed with status ${response.status} for ${url}`);
      }
    } catch (e: any) {
      if (id) clearTimeout(id);
      if (e.name === 'AbortError') {
        lastError = new Error(`Proxy ${proxy.name} timed out after ${timeout}ms`);
        console.warn(`${proxy.name} timed out for ${url}`);
      } else {
        lastError = e;
        console.warn(`${proxy.name} error for ${url}: ${e.message || e}`);
      }
    }
  }
  console.error(`All fetch attempts failed for ${url}`);
  throw lastError || new Error('Failed to fetch from all proxies.');
}
