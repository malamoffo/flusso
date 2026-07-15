// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseRssXml } from '../services/rssParser';
import fs from 'fs';
import path from 'path';

// Helper to generate mock articles
const generateMockArticles = (count: number, duplicateRatio = 0) => {
  const articles = [];
  for (let i = 0; i < count; i++) {
    // If duplicateRatio is met, we use a duplicate link
    const linkIndex = duplicateRatio > 0 && Math.random() < duplicateRatio ? Math.floor(i / 2) : i;
    articles.push({
      id: `id-${i}`,
      feedId: `feed-${i % 5}`,
      title: `Article Title ${i} with some search keywords like bolt and flusso`,
      link: `https://example.com/article-${linkIndex}`,
      pubDate: 1710000000000 + (i * 60000), // deterministic increment
      isRead: i % 3 === 0 ? 1 : 0,
      isFavorite: i % 7 === 0 ? 1 : 0,
      contentSnippet: `This is a short snippet for article ${i}. It has some content for testing.`,
      content: `Full content of article ${i} containing some other text elements.`
    });
  }
  return articles;
};

// Generate RSS 2.0 XML string
const generateRssXml = (itemCount: number) => {
  let items = '';
  for (let i = 0; i < itemCount; i++) {
    items += `
    <item>
      <title>Mock RSS Item ${i}</title>
      <link>https://example.com/rss-item-${i}</link>
      <description>This is the description for mock item ${i} with some HTML &lt;p&gt;content&lt;/p&gt;.</description>
      <pubDate>Wed, 15 Mar 2026 12:00:${i.toString().padStart(2, '0')} GMT</pubDate>
      <guid>https://example.com/rss-item-${i}</guid>
    </item>`;
  }
  return `<?xml version="1.0" encoding="UTF-8" ?>
  <rss version="2.0">
    <channel>
      <title>Mock RSS Feed</title>
      <link>https://example.com/rss-feed</link>
      <description>A mock feed for deterministic parsing benchmarks</description>
      ${items}
    </channel>
  </rss>`;
};

// Pure implementation of the mergeArticles worker logic
function runMergeArticles(prev: any[], incoming: any[]) {
  const merged = [...prev];
  const incomingArr = [...incoming];
  const existingLinks = new Set<string>();
  
  const initialUnique = [];
  for (let i = 0; i < merged.length; i++) {
    if (!existingLinks.has(merged[i].link)) {
      existingLinks.add(merged[i].link);
      initialUnique.push(merged[i]);
    }
  }
  
  const finalMerged = initialUnique;
  let hasNew = false;

  for (const newArticle of incomingArr) {
    if (!existingLinks.has(newArticle.link)) {
      hasNew = true;
      existingLinks.add(newArticle.link);

      if (finalMerged.length === 0 || newArticle.pubDate >= finalMerged[0].pubDate) {
        finalMerged.unshift(newArticle);
        continue;
      }

      let low = 0;
      let high = finalMerged.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (finalMerged[mid].pubDate > newArticle.pubDate) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      finalMerged.splice(low, 0, newArticle);
    }
  }
  return { merged: finalMerged, hasNew };
}

describe('Deterministic Performance Benchmarks', () => {
  it('should run benchmarks and save results', () => {
    const results: Record<string, { durationMs: number; operationsPerSec?: number; itemsProcessed?: number }> = {};

    // 1. RSS Parsing Benchmark (100 items)
    const rssXml = generateRssXml(100);
    const startParse = performance.now();
    const parseResult = parseRssXml(rssXml, 'https://example.com/rss-feed');
    const endParse = performance.now();
    results['rss_parsing'] = {
      durationMs: endParse - startParse,
      itemsProcessed: 100,
    };
    expect(parseResult.articles.length).toBe(100);

    // 2. Deduplication Benchmark (5000 items, 30% duplicates)
    const rawArticles = generateMockArticles(5000, 0.3);
    const startDedup = performance.now();
    const existingLinks = new Set<string>();
    const uniqueArticles = [];
    for (let i = 0; i < rawArticles.length; i++) {
      if (!existingLinks.has(rawArticles[i].link)) {
        existingLinks.add(rawArticles[i].link);
        uniqueArticles.push(rawArticles[i]);
      }
    }
    const endDedup = performance.now();
    results['deduplication'] = {
      durationMs: endDedup - startDedup,
      itemsProcessed: rawArticles.length,
    };
    expect(uniqueArticles.length).toBeLessThan(5000);

    // 3. Filtering Benchmark (5000 items)
    const filterArticles = generateMockArticles(5000, 0);
    const query = 'flusso';
    const startFilter = performance.now();
    const filtered = [];
    for (let i = 0; i < filterArticles.length; i++) {
      const art = filterArticles[i];
      if (
        art.title.toLowerCase().includes(query) ||
        (art.contentSnippet?.toLowerCase().includes(query)) ||
        (art.content?.toLowerCase().includes(query))
      ) {
        filtered.push(art);
      }
    }
    const endFilter = performance.now();
    results['filtering'] = {
      durationMs: endFilter - startFilter,
      itemsProcessed: filterArticles.length,
    };

    // 4. Sorting Benchmark (5000 items)
    const sortArticles = generateMockArticles(5000, 0);
    // Shuffle slightly
    sortArticles.reverse();
    const startSort = performance.now();
    sortArticles.sort((a, b) => b.pubDate - a.pubDate);
    const endSort = performance.now();
    results['sorting'] = {
      durationMs: endSort - startSort,
      itemsProcessed: sortArticles.length,
    };

    // 5. Merge Benchmark (5000 existing, 1000 incoming)
    const prevArticles = generateMockArticles(5000, 0);
    const incomingArticles = generateMockArticles(1000, 0).map(a => ({
      ...a,
      id: `new-${a.id}`,
      link: `${a.link}-new`,
      pubDate: a.pubDate + 500000, // newer dates
    }));
    const startMerge = performance.now();
    const mergeResult = runMergeArticles(prevArticles, incomingArticles);
    const endMerge = performance.now();
    results['merge'] = {
      durationMs: endMerge - startMerge,
      itemsProcessed: prevArticles.length + incomingArticles.length,
    };
    expect(mergeResult.merged.length).toBe(6000);

    // Write results to file
    const dir = path.resolve('dist');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(dir, 'benchmark-results.json'),
      JSON.stringify(results, null, 2)
    );
    console.log('Benchmark results written successfully to dist/benchmark-results.json');
  });
});
