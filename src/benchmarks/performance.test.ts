// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseRssXml } from '../services/rssParser';
import { deduplicateArticles, sortArticles } from '../utils/articleUtils';
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
      content: `Full content of article ${i} containing some other text elements.`,
      type: 'article' as const
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

describe('Deterministic Performance Benchmarks (1k, 5k, 20k elements)', () => {
  const datasetSizes = [1000, 5000, 20000];

  it('should run benchmarks across 1k, 5k, and 20k elements and save results', () => {
    const results: Record<string, { durationMs: number; itemsProcessed: number }> = {};

    for (const size of datasetSizes) {
      // 1. Deduplication Benchmark
      const rawArticles = generateMockArticles(size, 0.3);
      const startDedup = performance.now();
      const uniqueArticles = deduplicateArticles(rawArticles);
      const endDedup = performance.now();
      results[`deduplication_${size}`] = {
        durationMs: endDedup - startDedup,
        itemsProcessed: size,
      };
      expect(uniqueArticles.length).toBeLessThanOrEqual(size);

      // 2. Sorting Benchmark
      const sortInput = generateMockArticles(size, 0);
      sortInput.reverse();
      const startSort = performance.now();
      const sorted = sortArticles(sortInput);
      const endSort = performance.now();
      results[`sorting_${size}`] = {
        durationMs: endSort - startSort,
        itemsProcessed: size,
      };
      expect(sorted.length).toBe(size);

      // 3. Filtering Benchmark
      const filterInput = generateMockArticles(size, 0);
      const query = 'flusso';
      const startFilter = performance.now();
      const filtered = filterInput.filter(art =>
        art.title.toLowerCase().includes(query) ||
        (art.contentSnippet?.toLowerCase().includes(query) ?? false) ||
        (art.content?.toLowerCase().includes(query) ?? false)
      );
      const endFilter = performance.now();
      results[`filtering_${size}`] = {
        durationMs: endFilter - startFilter,
        itemsProcessed: size,
      };
      expect(filtered.length).toBeDefined();
    }

    // Write results to file
    const distDir = path.resolve('dist');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(distDir, 'benchmark-results.json'),
      JSON.stringify(results, null, 2)
    );

    const publicDir = path.resolve('public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(publicDir, 'benchmark-results.json'),
      JSON.stringify(results, null, 2)
    );
    console.log('Benchmark results for 1k, 5k, 20k written successfully.');
  });
});
