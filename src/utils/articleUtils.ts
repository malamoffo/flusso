import { Article, EvidenzaLevel } from '../types';

/**
 * Computes or retrieves the evidenza level for an article.
 * - 'alta': Breaking/very fresh news (<= 4h or explicit 'alta')
 * - 'media': Notable/today's news (<= 24h or explicit 'media')
 * - 'bassa': Standard/older news (> 24h or explicit 'bassa')
 */
export function getArticleEvidenza(article: Article): EvidenzaLevel {
  if (article.evidenza === 'alta' || article.evidenza === 'media' || article.evidenza === 'bassa') {
    return article.evidenza;
  }
  const now = Date.now();
  const pubTime = typeof article.pubDate === 'string' ? new Date(article.pubDate).getTime() : article.pubDate;
  if (!pubTime || isNaN(pubTime)) return 'bassa';
  
  const diffHours = (now - pubTime) / (1000 * 60 * 60);
  if (diffHours <= 4) {
    return 'alta';
  } else if (diffHours <= 24) {
    return 'media';
  } else {
    return 'bassa';
  }
}

/**
 * Deduplicates articles by link or id.
 */
export function deduplicateArticles(articles: Article[]): Article[] {
  const uniqueMap = new Map<string, Article>();
  for (let i = 0; i < articles.length; i++) {
    const art = articles[i];
    const key = art.link || art.id;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, art);
    }
  }
  return Array.from(uniqueMap.values());
}

/**
 * Deterministic sort for articles by pubDate descending, with id tie-breaker.
 * Handles missing or invalid dates safely.
 */
export function sortArticles(articles: Article[]): Article[] {
  // Create a shallow copy before sorting to avoid mutating input array
  const copied = [...articles];
  copied.sort((a, b) => {
    const timeA = typeof a.pubDate === 'string' ? new Date(a.pubDate).getTime() : a.pubDate;
    const timeB = typeof b.pubDate === 'string' ? new Date(b.pubDate).getTime() : b.pubDate;
    const valA = isNaN(timeA) ? 0 : timeA;
    const valB = isNaN(timeB) ? 0 : timeB;
    if (valB !== valA) return valB - valA;
    return b.id.localeCompare(a.id);
  });
  return copied;
}

/**
 * Deduplicates and sorts saved articles in a single efficient pass / pipeline.
 */
export function deduplicateAndSortSavedArticles(savedArticles: Article[]): Article[] {
  const deduplicated = deduplicateArticles(savedArticles);
  return sortArticles(deduplicated);
}
