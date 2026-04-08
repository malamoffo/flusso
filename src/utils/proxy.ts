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
      console.log(`Direct fetch returned 304 Not Modified for ${url}`);
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
    } else {
      console.warn(`Direct fetch failed for ${url} with status ${directResponse.status}`);
    }
  } catch (e: any) {
    if (externalSignal?.aborted) throw new Error('Aborted');
    console.warn(`Direct fetch failed for ${url}: ${e.message || e}`);
    // Direct fetch failed (likely CORS or timeout), fallback to proxies
  }

  const proxies: { name: string, url: string, type: 'text' | 'json' | 'rss2json', timeout?: number }[] = [];
  
  if (isRss) {
    proxies.push({ name: 'RSS2JSON', url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`, type: 'rss2json', timeout: 15000 });
  }

  const cacheBuster = `&_cb=${Date.now()}`;
  const cacheBusterQuest = `?_cb=${Date.now()}`;

  proxies.push(
    { name: 'CorsProxy.io', url: `https://corsproxy.io/?${encodeURIComponent(url)}`, type: 'text', timeout: 12000 },
    { name: 'AllOrigins Raw', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}${cacheBuster}`, type: 'text', timeout: 15000 },
    { name: 'CodeTabs', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, type: 'text', timeout: 12000 },
    { name: 'CorsProxy.org', url: `https://corsproxy.org/?url=${encodeURIComponent(url)}`, type: 'text', timeout: 12000 },
    { name: 'AllOrigins JSON', url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}${cacheBuster}`, type: 'json', timeout: 15000 },
    { name: 'YACDN', url: `https://yacdn.org/proxy/${url}`, type: 'text', timeout: 12000 },
    { name: 'Cloudflare Worker', url: `https://cors-anywhere.azm.workers.dev/${url}`, type: 'text', timeout: 12000 },
    { name: 'ThingProxy', url: `https://thingproxy.freeboard.io/fetch/${url}`, type: 'text', timeout: 15000 }
  );

  let lastError: any;
  const defaultTimeout = 10000; // 10 seconds timeout per proxy

  for (let i = 0; i < proxies.length; i++) {
    if (externalSignal?.aborted) throw new Error('Aborted');
    
    const proxy = proxies[i];
    const timeout = proxy.timeout || defaultTimeout;
    console.log(`Attempting fetch via ${proxy.name} for ${url} (timeout: ${timeout}ms)`);
    
    let id: any;
    try {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between retries
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
          const trimmed = text.trim();
          if (isRss) {
            if (trimmed.includes('<rss') || trimmed.includes('<feed') || trimmed.includes('<?xml') || trimmed.includes('<rdf:RDF') || trimmed.startsWith('{')) {
              console.log(`Successfully fetched via ${proxy.name}`);
              return text;
            } else {
              lastError = new Error(`Proxy ${proxy.name} returned invalid content (not XML/RSS)`);
              console.warn(`${proxy.name} returned invalid content for ${url}`);
              continue;
            }
          } else {
            // For non-RSS (likely JSON/API), ensure it doesn't look like HTML
            if (trimmed.startsWith('<') && (trimmed.toLowerCase().includes('<html') || trimmed.toLowerCase().includes('<body') || trimmed.toLowerCase().includes('<!doctype'))) {
              lastError = new Error(`Proxy ${proxy.name} returned HTML instead of expected JSON/API response`);
              console.warn(`${proxy.name} returned HTML for ${url}`);
              continue;
            }
            console.log(`Successfully fetched via ${proxy.name}`);
            return text;
          }
        } else {
          lastError = new Error(`Proxy ${proxy.name} returned empty response`);
          console.warn(`${proxy.name} returned empty response for ${url}`);
          continue;
        }
      }
      lastError = new Error(`Proxy ${proxy.name} returned status ${response.status}`);
      console.warn(`${proxy.name} failed with status ${response.status} for ${url}`);
    } catch (e: any) {
      clearTimeout(id);
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
