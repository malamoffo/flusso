export async function fetchWithProxy(url: string, isRss: boolean = true): Promise<string> {
  // First try direct fetch (in case CORS is enabled on the target server)
  try {
    const directController = new AbortController();
    const directTimeoutId = setTimeout(() => directController.abort(), 10000);
    
    const directResponse = await fetch(url, {
      signal: directController.signal,
      headers: {
        ...(isRss ? { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' } : {})
      }
    });
    clearTimeout(directTimeoutId);
    
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
    console.warn(`Direct fetch failed for ${url}: ${e.message || e}`);
    // Direct fetch failed (likely CORS or timeout), fallback to proxies
  }

  const proxies = [
    { name: 'AllOrigins Raw', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, type: 'text' },
    { name: 'AllOrigins JSON', url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, type: 'json' },
    { name: 'CorsProxy.io', url: `https://corsproxy.io/?${encodeURIComponent(url)}`, type: 'text' },
    { name: 'CodeTabs', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, type: 'text' }
  ];

  if (isRss) {
    proxies.push({ name: 'RSS2JSON', url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`, type: 'rss2json' });
  }

  let lastError: any;
  const timeout = 10000; // 10 seconds timeout per proxy

  for (let i = 0; i < proxies.length; i++) {
    const proxy = proxies[i];
    console.log(`Attempting fetch via ${proxy.name} for ${url}`);
    
    let id: any;
    try {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between retries
      }
      
      const controller = new AbortController();
      id = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(proxy.url, { 
        signal: controller.signal
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
            const trimmed = text.trim();
            if (trimmed.includes('<rss') || trimmed.includes('<feed') || trimmed.includes('<?xml') || trimmed.includes('<rdf:RDF') || trimmed.startsWith('{')) {
              console.log(`Successfully fetched via ${proxy.name}`);
              return text;
            } else {
              lastError = new Error(`Proxy ${proxy.name} returned invalid content (not XML/RSS)`);
              console.warn(`${proxy.name} returned invalid content for ${url}`);
              continue;
            }
          } else {
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
