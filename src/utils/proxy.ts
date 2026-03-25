export async function fetchWithProxy(url: string, isRss: boolean = true): Promise<string> {
  // First try direct fetch (in case CORS is enabled on the target server)
  try {
    const directResponse = await fetch(url, {
      headers: {
        ...(isRss ? { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' } : {})
      }
    });
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
  } catch (e) {
    // Direct fetch failed (likely CORS), fallback to proxies
  }

  const proxies = [
    { url: `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, type: 'text' },
    { url: `https://corsproxy.io/?${encodeURIComponent(url)}`, type: 'text' },
    { url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, type: 'json' },
    { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, type: 'text' },
    { url: `https://thingproxy.freeboard.io/fetch/${url}`, type: 'text' }
  ];

  if (isRss) {
    proxies.push({ url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`, type: 'rss2json' });
  }

  let lastError: any;
  const timeout = 10000; // 10 seconds timeout per proxy

  for (let i = 0; i < proxies.length; i++) {
    const proxy = proxies[i];
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between retries
      }
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
            return JSON.stringify(data); // Return the JSON string, parseRssXml will handle it
          } else {
            lastError = new Error(`rss2json returned error: ${data.message}`);
            continue;
          }
        } else {
          text = await response.text();
        }
        
        if (text && text.trim().length > 0) {
          if (isRss) {
            const trimmed = text.trim();
            if (trimmed.includes('<rss') || trimmed.includes('<feed') || trimmed.includes('<?xml') || trimmed.includes('<rdf:RDF') || trimmed.startsWith('{')) {
              return text;
            } else {
              lastError = new Error(`Proxy ${proxy.url} returned invalid content (not XML/RSS)`);
              continue;
            }
          } else {
            return text;
          }
        } else {
          lastError = new Error(`Proxy ${proxy.url} returned empty response`);
          continue;
        }
      }
      lastError = new Error(`Proxy ${proxy.url} returned status ${response.status}`);
    } catch (e: any) {
      clearTimeout(id);
      if (e.name === 'AbortError') {
        lastError = new Error(`Proxy ${proxy.url} timed out after ${timeout}ms`);
      } else {
        lastError = e;
      }
    }
  }
  throw lastError || new Error('Failed to fetch from all proxies.');
}
