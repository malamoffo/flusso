import { Feed, Article } from '../types';
import DOMPurify from 'dompurify';
import he from 'he';
import { getSafeUrl, resolveUrl } from '../lib/utils';

// Helper to escape XML special characters
export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
    return c;
  });
}

// Helper to decode HTML entities safely
function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  return he.decode(text);
}

// Helper to sanitize article content into a safe text snippet
function sanitizeSnippet(input: string): string {
  if (!input) return '';
  const textOnly = DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  return textOnly.trim().substring(0, 200);
}

// Helper to extract the first URL from a srcset attribute efficiently
function getFirstSrcsetUrl(srcset: string | null | undefined): string | null {
  if (!srcset) return null;
  const commaIndex = srcset.indexOf(',');
  const firstPart = commaIndex !== -1 ? srcset.substring(0, commaIndex) : srcset;
  const spaceIndex = firstPart.indexOf(' ');
  return spaceIndex !== -1 ? firstPart.substring(0, spaceIndex) : firstPart;
}

// Helper to extract all images from HTML content
export function extractAllImages(content: string, baseUrl?: string): string[] {
  if (!content) return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  const imgTags = doc.getElementsByTagName('img');
  const images: string[] = [];
  
  for (let i = 0; i < imgTags.length; i++) {
    const url = imgTags[i].getAttribute('src');
    if (url) {
      images.push(resolveUrl(url, baseUrl || ''));
    }
  }
  return images;
}

// Helper to extract the best image from HTML content, avoiding tracking pixels and icons
export function extractBestImage(content: string, baseUrl?: string): string | null {
  if (!content) return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  
  const resolveUrlHelper = (url: string | null): string | null => {
    if (!url) return null;
    if (!baseUrl) return url;
    try {
      return new URL(url, baseUrl).href;
    } catch (e) {
      return url;
    }
  };

  // Try og:image
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (ogImage) return resolveUrlHelper(ogImage);

  const imgTags = doc.getElementsByTagName('img');
  
  for (let i = 0; i < imgTags.length; i++) {
    const imgTag = imgTags[i];
    const url = imgTag.getAttribute('data-src') || 
                imgTag.getAttribute('data-lazy-src') ||
                imgTag.getAttribute('data-original') ||
                  getFirstSrcsetUrl(imgTag.getAttribute('srcset')) ||
                imgTag.getAttribute('src');
    if (!url) continue;
    
    // Skip likely tracking pixels or icons based on URL
    const lowerUrl = url.toLowerCase();
    
    if (
      lowerUrl.includes('1x1') ||
      lowerUrl.includes('pixel') ||
      lowerUrl.includes('tracker') ||
      (lowerUrl.includes('feedburner') && (lowerUrl.includes('pixel') || lowerUrl.includes('1x1') || lowerUrl.includes('stats'))) ||
      lowerUrl.includes('stats') ||
      lowerUrl.includes('gravatar') ||
      lowerUrl.includes('avatar') ||
      lowerUrl.includes('favicon') ||
      lowerUrl.includes('icon') ||
      lowerUrl.includes('logo') ||
      lowerUrl.includes('wp-includes/images/smilies') ||
      lowerUrl.includes('share') ||
      lowerUrl.includes('button') ||
      lowerUrl.includes('badge') ||
      lowerUrl.includes('advert') ||
      lowerUrl.includes('spinner') ||
      lowerUrl.includes('loading')
    ) {
      continue;
    }

    // Check for width/height attributes that suggest a 1x1 pixel
    const width = parseInt(imgTag.getAttribute('width') || '0', 10);
    const height = parseInt(imgTag.getAttribute('height') || '0', 10);
    if (width > 0 && width <= 10) continue;
    if (height > 0 && height <= 10) continue;

    // First valid image found
    return resolveUrlHelper(url);
  }
  
  return null;
}

// Helper to get text content from a list of possible tags, including namespaced ones
function getTagText(element: Element, tags: string[]): string {
  for (const tag of tags) {
    const colonIndex = tag.indexOf(':');
    const localName = colonIndex !== -1 ? tag.substring(colonIndex + 1) : tag;
    const elements = getElementsByLocalName(element, localName);
    
    for (const el of elements) {
      if (el.textContent) return el.textContent.trim();
    }
  }
  return '';
}

// Optimized single-pass text retrieval using a pre-computed tag dictionary
function getSingleTagText(tagDict: Record<string, Element[]>, tags: string[]): string {
  for (let t = 0; t < tags.length; t++) {
    const elements = tagDict[tags[t].toLowerCase()];
    if (elements && elements.length > 0 && elements[0].textContent) {
      return elements[0].textContent.trim();
    }
  }
  return '';
}

// Helper to get elements by local name regardless of namespace
function getElementsByLocalName(parent: Element, localName: string): Element[] {
  const results: Element[] = [];
  const all = parent.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const nodeName = el.nodeName.toLowerCase();
    if (nodeName === localName.toLowerCase() || nodeName.endsWith(':' + localName.toLowerCase())) {
      results.push(el);
    }
  }
  return results;
}

// Helper to parse RSS/Atom XML using native DOMParser
export function parseRssXml(xmlString: string, feedUrl: string, sinceDate?: number): { feed: Feed; articles: Article[] } {
  if (typeof xmlString !== 'string') {
    xmlString = JSON.stringify(xmlString);
  }
  if (!xmlString || xmlString.trim() === '') {
    throw new Error('Received empty response from the feed URL.');
  }

  // Check if it's a JSON response from rss2json fallback
  if (xmlString.trim().startsWith('{')) {
    try {
      const data = JSON.parse(xmlString);
      if (data.status === 'ok' && data.feed && data.items) {
        const feedId = crypto.randomUUID();
        const articles: Article[] = data.items.map((item: any) => {
          let imageUrl = item.thumbnail || null;
          let mediaUrl = null;
          let mediaType: string | undefined = undefined;
          if (item.enclosure && item.enclosure.link && item.enclosure.type) {
            if (item.enclosure.type.startsWith('image/')) {
              if (!imageUrl) imageUrl = item.enclosure.link;
            } else if (item.enclosure.type.startsWith('audio/') || item.enclosure.type.startsWith('video/')) {
              mediaUrl = item.enclosure.link;
              mediaType = item.enclosure.type;
            }
          }
          if (!imageUrl) {
            const content = item.content || item.description || '';
            imageUrl = extractBestImage(content);
          }

          let pubDate = Date.now();
          if (item.pubDate) {
            // rss2json returns dates like "2026-03-22 07:01:18" which might need parsing
            pubDate = new Date(item.pubDate.replace(' ', 'T') + 'Z').getTime();
            if (isNaN(pubDate)) pubDate = new Date(item.pubDate).getTime();
            if (isNaN(pubDate)) pubDate = Date.now();
          }

          if (sinceDate && pubDate <= sinceDate) return null;

          return {
            id: crypto.randomUUID(),
            feedId,
            title: decodeHtmlEntities(item.title || 'Untitled'),
            link: getSafeUrl(item.link),
            pubDate,
            imageUrl: imageUrl ? getSafeUrl(imageUrl) : undefined,
            isRead: 0,
            isFavorite: 0,
            type: 'article',
            contentSnippet: sanitizeSnippet(decodeHtmlEntities(item.content || item.description || '')),
          };
        }).filter(Boolean) as Article[];

        return {
          feed: {
            id: feedId,
            title: data.feed.title || 'Untitled Feed',
            description: data.feed.description || '',
            link: getSafeUrl(data.feed.link),
            feedUrl: getSafeUrl(feedUrl),
            imageUrl: getSafeUrl(data.feed.image, undefined),
            lastFetched: Date.now(),
            lastRefreshStatus: 'success',
            type: 'article'
          },
          articles
        };
      }
    } catch (e) {
      // Fall through to XML parsing if JSON parsing fails
    }
  }

  const parser = new DOMParser();
  let xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  // Check for parsing errors
  let parserError = xmlDoc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    xmlDoc = parser.parseFromString(xmlString, 'text/html');
  }
  
  // Check again for parsing errors
  parserError = xmlDoc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error('Failed to parse XML: ' + parserError.textContent);
  }

  const isAtom = xmlDoc.getElementsByTagName('feed').length > 0;
  const feedId = crypto.randomUUID();
  
  if (isAtom) {
    const feedNode = xmlDoc.getElementsByTagName('feed')[0];
    const title = getTagText(feedNode, ['title', 'dc:title']) || 'Untitled Atom Feed';
    const description = getTagText(feedNode, ['subtitle', 'description', 'summary']) || '';
    const link = feedNode.getElementsByTagName('link')[0]?.getAttribute('href') || '';
    
    const itunesFeedImage = (feedNode.getElementsByTagName('itunes:image')[0]?.getAttribute('href') || '').trim();
    const feedImage = itunesFeedImage || getTagText(feedNode, ['logo', 'icon']) || '';
    const feedDescription = getTagText(feedNode, ['subtitle', 'description', 'summary']) || '';

    const entries = Array.from(xmlDoc.getElementsByTagName('entry'));
    const articles: Article[] = [];
    
    const isBluesky = feedUrl.includes('bsky.app');
    let profileImageUrl: string | undefined = undefined;
    if (isBluesky) {
      const feedImage = xmlDoc.getElementsByTagName('image')[0] || xmlDoc.getElementsByTagName('logo')[0] || xmlDoc.getElementsByTagName('icon')[0];
      if (feedImage) {
        profileImageUrl = feedImage.textContent || undefined;
      }
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      
      // Single-pass iteration to build a dictionary of all descendant elements
      const tagDict: Record<string, Element[]> = {};
      const children = entry.getElementsByTagName('*');
      for (let c = 0; c < children.length; c++) {
        const child = children[c];
        const nodeName = child.nodeName.toLowerCase();
        
        let elements = tagDict[nodeName];
        if (!elements) {
          elements = [];
          tagDict[nodeName] = elements;
        }
        elements.push(child);
        
        const colonIndex = nodeName.indexOf(':');
        if (colonIndex !== -1) {
          const localName = nodeName.substring(colonIndex + 1);
          let localElements = tagDict[localName];
          if (!localElements) {
            localElements = [];
            tagDict[localName] = localElements;
          }
          localElements.push(child);
        }
      }

      const content = getSingleTagText(tagDict, ['content:encoded', 'content', 'description', 'itunes:summary', 'summary', 'itunes:subtitle']) || '';
      let entryTitle = getSingleTagText(tagDict, ['title', 'dc:title']);
      
      if (!entryTitle) {
        const plainText = sanitizeSnippet(decodeHtmlEntities(content));
        entryTitle = plainText.length > 50 ? plainText.substring(0, 50) + '...' : plainText;
        if (!entryTitle) entryTitle = 'Untitled';
      }
      
      const linkElements = tagDict['link'] || [];
      const entryLink = resolveUrl(linkElements.length > 0 ? (linkElements[0].getAttribute('href') || '') : '', feedUrl);
      const pubDateStr = getSingleTagText(tagDict, ['published', 'updated', 'pubDate']);
      let pubDate = pubDateStr ? new Date(pubDateStr).getTime() : Date.now();
      if (isNaN(pubDate)) pubDate = Date.now();
      if (pubDate > Date.now()) pubDate = Date.now();
      
      if (sinceDate && pubDate <= sinceDate) continue;
      
      let imageUrl: string | null = null;
      let mediaUrl: string | null = null;
      let mediaType: string | undefined = undefined;
      
      for (let j = 0; j < linkElements.length; j++) {
        const l = linkElements[j];
        const rel = l.getAttribute('rel');
        const type = l.getAttribute('type');
        const href = l.getAttribute('href');
        if (rel === 'enclosure' && type && href) {
          if (type.startsWith('image/')) {
            if (!imageUrl) imageUrl = resolveUrl(href, feedUrl);
          } else if (type.startsWith('audio/') || type.startsWith('video/')) {
            mediaUrl = resolveUrl(href, feedUrl);
            mediaType = type;
          }
        }
      }

      const groupElements = tagDict['media:group'] || tagDict['group'] || [];
      const mediaContentElements = [...(tagDict['media:content'] || tagDict['content'] || [])];
      
      for (let j = 0; j < groupElements.length; j++) {
        const groupChildren = groupElements[j].children;
        for (let k = 0; k < groupChildren.length; k++) {
          const nn = groupChildren[k].nodeName.toLowerCase();
          if (nn === 'media:content' || nn.endsWith(':content') || nn === 'content') {
            mediaContentElements.push(groupChildren[k]);
          }
        }
      }

      if (mediaContentElements.length > 0) {
        const mediaContent = mediaContentElements[0];
        const type = mediaContent.getAttribute('type');
        const url = mediaContent.getAttribute('url');
        if (type?.startsWith('image/')) {
          if (!imageUrl && url) imageUrl = resolveUrl(url, feedUrl);
        } else if (type?.startsWith('audio/') || type?.startsWith('video/')) {
          if (url) {
            mediaUrl = resolveUrl(url, feedUrl);
            mediaType = type;
          }
        } else if (!type && url && (url.endsWith('.jpg') || url.endsWith('.png'))) {
          if (!imageUrl) imageUrl = resolveUrl(url, feedUrl);
        }
      }
      
      if (!imageUrl) {
        // We need to allow img tags to extract the best image
        const sanitizedForImage = DOMPurify.sanitize(content, {
          ALLOWED_TAGS: ['img', 'figure', 'picture', 'source'],
          ALLOWED_ATTR: ['src', 'data-src', 'data-lazy-src', 'data-original', 'width', 'height', 'alt', 'srcset', 'data-srcset']
        });
        imageUrl = extractBestImage(sanitizedForImage, entryLink);
      }

      articles.push({
        id: crypto.randomUUID(),
        feedId,
        title: decodeHtmlEntities(entryTitle),
        link: resolveUrl(entryLink, feedUrl),
        pubDate,
        imageUrl: imageUrl ? resolveUrl(imageUrl, feedUrl) : undefined,
        profileImageUrl: isBluesky ? (profileImageUrl ? resolveUrl(profileImageUrl, feedUrl) : undefined) : undefined,
        postImageUrls: extractAllImages(content, resolveUrl(entryLink, feedUrl)),
        isRead: 0,
        isFavorite: 0,
        type: 'article',
        contentSnippet: sanitizeSnippet(decodeHtmlEntities(content)),
        content: content,
      });
    }

    return {
      feed: {
        id: feedId,
        title,
        description: feedDescription,
        link: getSafeUrl(link),
        feedUrl: getSafeUrl(feedUrl),
        imageUrl: getSafeUrl(feedImage, undefined),
        lastFetched: Date.now(),
        lastRefreshStatus: 'success',
        type: 'article'
      },
      articles
    };
  } else {
    // Assume RSS 2.0
    let channel = xmlDoc.getElementsByTagName('channel')[0];
    if (!channel) {
      // Try to find RSS 1.0 (RDF)
      channel = xmlDoc.getElementsByTagName('rdf:RDF')[0] || xmlDoc.getElementsByTagName('RDF')[0];
    }
    if (!channel) throw new Error('Invalid RSS feed: missing <channel>');
    
    const title = getTagText(channel, ['title', 'dc:title']) || 'Untitled RSS Feed';
    const description = getTagText(channel, ['description', 'subtitle', 'summary']) || '';
    const link = getTagText(channel, ['link']) || '';
    
    // Try itunes:image first for feed image, fallback to image/url
    const imageElements = getElementsByLocalName(channel, 'image');
    let feedImage = '';
    for (const imgEl of imageElements) {
      const href = imgEl.getAttribute('href') || imgEl.getAttribute('url');
      if (href) {
        const resolved = resolveUrl(href, feedUrl);
        if (!resolved.toLowerCase().includes('favicon') && !resolved.toLowerCase().includes('icon')) {
          feedImage = resolved;
          break;
        }
      }
      const urlChild = getElementsByLocalName(imgEl, 'url')[0];
      if (urlChild?.textContent) {
        const resolved = resolveUrl(urlChild.textContent.trim(), feedUrl);
        if (!resolved.toLowerCase().includes('favicon') && !resolved.toLowerCase().includes('icon')) {
          feedImage = resolved;
          break;
        }
      }
    }

    if (!feedImage) {
      const itunesImage = getTagText(channel, ['itunes:image', 'logo', 'icon']);
      if (itunesImage && !itunesImage.toLowerCase().includes('favicon') && !itunesImage.toLowerCase().includes('icon')) {
        feedImage = itunesImage;
      }
    }

    if (!feedImage) {
      // Try media:thumbnail or media:content at channel level
      const mediaElements = [...getElementsByLocalName(channel, 'content'), ...getElementsByLocalName(channel, 'thumbnail')];
      for (const mediaEl of mediaElements) {
        const url = mediaEl.getAttribute('url');
        if (url && (url.match(/\.(jpg|jpeg|png|gif|webp)/i))) {
          feedImage = resolveUrl(url, feedUrl);
          break;
        }
      }
    }
    
    const feedDescription = getTagText(channel, ['itunes:summary', 'description', 'subtitle', 'summary', 'itunes:subtitle']) || '';

    const items = Array.from(xmlDoc.getElementsByTagName('item'));
    const articles: Article[] = [];
    
    const isBluesky = feedUrl.includes('bsky.app');
    let profileImageUrl: string | undefined = undefined;
    if (isBluesky) {
      const feedImage = xmlDoc.getElementsByTagName('image')[0];
      if (feedImage) {
        profileImageUrl = feedImage.getElementsByTagName('url')[0]?.textContent || undefined;
      }
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      const tagDict: Record<string, Element[]> = {};
      const children = item.getElementsByTagName('*');
      for (let c = 0; c < children.length; c++) {
        const child = children[c];
        const nodeName = child.nodeName.toLowerCase();
        
        let elements = tagDict[nodeName];
        if (!elements) {
          elements = [];
          tagDict[nodeName] = elements;
        }
        elements.push(child);
        
        const colonIndex = nodeName.indexOf(':');
        if (colonIndex !== -1) {
          const localName = nodeName.substring(colonIndex + 1);
          let localElements = tagDict[localName];
          if (!localElements) {
            localElements = [];
            tagDict[localName] = localElements;
          }
          localElements.push(child);
        }
      }
      
      const content = getSingleTagText(tagDict, ['content:encoded', 'content', 'description', 'itunes:summary', 'summary', 'itunes:subtitle']) || '';
      let itemTitle = getSingleTagText(tagDict, ['title', 'dc:title']);
      if (!itemTitle) {
        const plainText = sanitizeSnippet(decodeHtmlEntities(content));
        itemTitle = plainText.length > 50 ? plainText.substring(0, 50) + '...' : plainText;
        if (!itemTitle) itemTitle = 'Untitled';
      }
      
      const itemLink = resolveUrl(getSingleTagText(tagDict, ['link']) || '', feedUrl);
      const pubDateStr = getSingleTagText(tagDict, ['pubDate', 'published', 'updated']);
      let pubDate = pubDateStr ? new Date(pubDateStr).getTime() : Date.now();
      if (isNaN(pubDate)) pubDate = Date.now();
      if (pubDate > Date.now()) pubDate = Date.now();
      
      if (sinceDate && pubDate <= sinceDate) continue;
      
      let imageUrl: string | null = null;
      let mediaUrl: string | null = null;
      let mediaType: string | undefined = undefined;
      
      // Prioritize itunes:image or any image tag with an href (common in podcasts)
      const itunesImageElements = getElementsByLocalName(item, 'image');
      
      for (const imgEl of itunesImageElements) {
        const href = imgEl.getAttribute('href') || imgEl.getAttribute('url');
        if (href) {
          const resolved = resolveUrl(href, feedUrl);
          if (!resolved.toLowerCase().includes('favicon') && !resolved.toLowerCase().includes('icon')) {
            imageUrl = resolved;
            break;
          }
        }
        const urlChild = getElementsByLocalName(imgEl, 'url')[0];
        if (urlChild?.textContent) {
          const resolved = resolveUrl(urlChild.textContent.trim(), feedUrl);
          if (!resolved.toLowerCase().includes('favicon') && !resolved.toLowerCase().includes('icon')) {
            imageUrl = resolved;
            break;
          }
        }
        if (imgEl.textContent && imgEl.textContent.trim().startsWith('http')) {
          const resolved = resolveUrl(imgEl.textContent.trim(), feedUrl);
          if (!resolved.toLowerCase().includes('favicon') && !resolved.toLowerCase().includes('icon')) {
            imageUrl = resolved;
            break;
          }
        }
      }

      if (!imageUrl) {
        const mediaElements = [...getElementsByLocalName(item, 'content'), ...getElementsByLocalName(item, 'thumbnail')];
        for (const mediaEl of mediaElements) {
          const type = mediaEl.getAttribute('type');
          const medium = mediaEl.getAttribute('medium');
          const url = mediaEl.getAttribute('url');
          if (url && (type?.startsWith('image/') || medium === 'image' || url.match(/\.(jpg|jpeg|png|gif|webp)/i))) {
            const resolved = resolveUrl(url, feedUrl);
            if (!resolved.toLowerCase().includes('favicon') && !resolved.toLowerCase().includes('icon')) {
              imageUrl = resolved;
              break;
            }
          }
        }
      }

      const enclosures = tagDict['enclosure'] || [];
      for (let j = 0; j < enclosures.length; j++) {
        const enclosure = enclosures[j];
        const type = enclosure.getAttribute('type');
        const url = enclosure.getAttribute('url');
        if (type && url) {
          if (type.startsWith('image/')) {
            if (!imageUrl) {
              const resolved = resolveUrl(url, feedUrl);
              if (!resolved.toLowerCase().includes('favicon') && !resolved.toLowerCase().includes('icon')) {
                imageUrl = resolved;
              }
            }
          } else if (type.startsWith('audio/') || type.startsWith('video/')) {
            mediaUrl = resolveUrl(url, feedUrl);
            mediaType = type;
          }
        }
      }
      
      const groupElements = tagDict['media:group'] || tagDict['group'] || [];
      const mediaContentElements = [...(tagDict['media:content'] || tagDict['content'] || tagDict['media:thumbnail'] || tagDict['thumbnail'] || [])];
      
      for (let j = 0; j < groupElements.length; j++) {
        const groupChildren = groupElements[j].children;
        for (let k = 0; k < groupChildren.length; k++) {
          const nn = groupChildren[k].nodeName.toLowerCase();
          if (nn === 'media:content' || nn.endsWith(':content') || nn === 'content' || nn === 'media:thumbnail' || nn.endsWith(':thumbnail') || nn === 'thumbnail') {
            mediaContentElements.push(groupChildren[k]);
          }
        }
      }

      if (!imageUrl && mediaContentElements.length > 0) {
        const mediaContent = mediaContentElements[0];
        const type = mediaContent.getAttribute('type');
        const url = mediaContent.getAttribute('url');
        if (type?.startsWith('image/')) {
          if (url) imageUrl = resolveUrl(url, feedUrl);
        } else if (url) {
          imageUrl = resolveUrl(url, feedUrl);
        }
      }

      if (!imageUrl) {
        imageUrl = extractBestImage(content, itemLink);
      }

      articles.push({
        id: crypto.randomUUID(),
        feedId,
        title: decodeHtmlEntities(itemTitle),
        link: resolveUrl(itemLink, feedUrl),
        pubDate,
        imageUrl: imageUrl ? resolveUrl(imageUrl, feedUrl) : undefined,
        profileImageUrl: isBluesky ? (profileImageUrl ? resolveUrl(profileImageUrl, feedUrl) : undefined) : undefined,
        postImageUrls: extractAllImages(content, resolveUrl(itemLink, feedUrl)),
        isRead: 0,
        isFavorite: 0,
        type: 'article',
        contentSnippet: sanitizeSnippet(decodeHtmlEntities(content)),
        content: content,
      });
    }

    return {
      feed: {
        id: feedId,
        title,
        description: feedDescription,
        link: getSafeUrl(link),
        feedUrl: getSafeUrl(feedUrl),
        imageUrl: getSafeUrl(feedImage, undefined),
        lastFetched: Date.now(),
        lastRefreshStatus: 'success',
        type: 'article'
      },
      articles
    };
  }
}
