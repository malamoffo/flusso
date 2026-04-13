export async function fetchWithProxy(url: string, isRss: boolean = true, sinceDate?: number, externalSignal?: AbortSignal): Promise<string> {
  // First try direct fetch (in case CORS is enabled on the target server)
  try {
    if (externalSignal?.aborted) throw new Error('Aborted');

    const directController = new AbortController();
    const directTimeoutId = setTimeout(() => directController.abort(), 10000);
    
    // Link external signal to our internal controller
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => directController.abort(), { once: true });
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      ...(isRss ? { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' } : {})
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
      return ''; // Return empty to indicate no new content
    }

    if (directResponse.ok) {
      const text = await directResponse.text();
      if (isRss) {
        if (text && text.trim().length > 0 && (text.includes('<rss') || text.includes('<feed') || text.includes('<?xml') || text.includes('<rdf:RDF'))) {
          return text;
        }
      } else {
        return text;
      }
    }
  } catch (e: any) {
    if (externalSignal?.aborted) throw new Error('Aborted');
    // Direct fetch failed (likely CORS or timeout), fallback to proxies
  }

  const proxies: { name: string, url: string, type: 'text' | 'json' | 'rss2json', timeout?: number }[] = [];
  
  if (isRss) {
    proxies.push({ name: 'RSS2JSON', url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`, type: 'rss2json', timeout: 15000 });
  }

  const cacheBuster = `&_cb=${Date.now()}`;
  
  const baseProxies: { name: string, url: string, type: 'text' | 'json' | 'rss2json', timeout?: number }[] = [
    { name: 'CorsProxy.io', url: `https://corsproxy.io/?${encodeURIComponent(url)}`, type: 'text', timeout: 12000 },
    { name: 'AllOrigins Raw', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}${cacheBuster}`, type: 'text', timeout: 15000 },
    { name: 'CodeTabs', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, type: 'text', timeout: 12000 },
    { name: 'CorsProxy.org', url: `https://corsproxy.org/?url=${encodeURIComponent(url)}`, type: 'text', timeout: 12000 },
    { name: 'AllOrigins JSON', url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}${cacheBuster}`, type: 'json', timeout: 15000 },
    { name: 'YACDN', url: `https://yacdn.org/proxy/${url}`, type: 'text', timeout: 12000 },
    { name: 'Cloudflare Worker', url: `https://cors-anywhere.azm.workers.dev/${url}`, type: 'text', timeout: 12000 },
    { name: 'ThingProxy', url: `https://thingproxy.freeboard.io/fetch/${url}`, type: 'text', timeout: 15000 },
    { name: 'CORS.sh', url: `https://proxy.cors.sh/${url}`, type: 'text', timeout: 12000 },
    { name: 'CORS-Anywhere Demo', url: `https://cors-anywhere.herokuapp.com/${url}`, type: 'text', timeout: 15000 }
  ];

  // Shuffle proxies to distribute load and avoid hitting a failing one first consistently
  const shuffledBase = [...baseProxies].sort(() => Math.random() - 0.5);
  proxies.push(...shuffledBase);

  let lastError: any;
  const defaultTimeout = 8000; // Reduced from 10s to 8s per proxy

  for (let i = 0; i < proxies.length; i++) {
    if (externalSignal?.aborted) throw new Error('Aborted');
    
    const proxy = proxies[i];
    const timeout = proxy.timeout ? Math.min(proxy.timeout, 10000) : defaultTimeout;
    
    let id: any;
    try {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Reduced from 500ms to 200ms delay
      }
      
      const controller = new AbortController();
      id = setTimeout(() => controller.abort(), timeout);
      
      // Link external signal to our internal controller
      if (externalSignal) {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      
      const response = await fetch(proxy.url, { 
        signal: controller.signal
      });
      clearTimeout(id);
      if (response.ok) {
        let text = '';
        if (proxy.type === 'json') {
          const data = await response.json();
          text = typeof data.contents === 'string' ? data.contents : JSON.stringify(data.contents);
        } else if (proxy.type === 'rss2json') {
          const data = await response.json();
          if (data.status === 'ok') {
            return JSON.stringify(data); // Return the JSON string, parseRssXml will handle it
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
              return text;
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
            return text;
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
