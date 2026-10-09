import { describe, it, expect } from 'vitest';
import { deduplicateArticles, sortArticles, deduplicateAndSortSavedArticles, getArticleEvidenza } from '../articleUtils';
import { Article } from '../../types';

describe('articleUtils', () => {
  it('computes evidenza levels correctly (alta, media, bassa)', () => {
    const now = Date.now();
    const artAlta: Article = {
      id: 'a1',
      feedId: 'f1',
      title: 'Breaking News',
      link: 'https://example.com/a1',
      pubDate: now - 3600000, // 1h ago
      isRead: 0,
      isFavorite: 0,
      type: 'article'
    };
    expect(getArticleEvidenza(artAlta)).toBe('alta');

    const artMedia: Article = {
      id: 'a2',
      feedId: 'f1',
      title: 'Notable News',
      link: 'https://example.com/a2',
      pubDate: now - 36000000, // 10h ago
      isRead: 0,
      isFavorite: 0,
      type: 'article'
    };
    expect(getArticleEvidenza(artMedia)).toBe('media');

    const artBassa: Article = {
      id: 'a3',
      feedId: 'f1',
      title: 'Older News',
      link: 'https://example.com/a3',
      pubDate: now - 172800000, // 48h ago
      isRead: 0,
      isFavorite: 0,
      type: 'article'
    };
    expect(getArticleEvidenza(artBassa)).toBe('bassa');

    // Explicit override
    const artExplicit: Article = {
      ...artBassa,
      evidenza: 'alta'
    };
    expect(getArticleEvidenza(artExplicit)).toBe('alta');
  });
  const mockArticles: Article[] = [
    {
      id: '1',
      feedId: 'f1',
      title: 'Article 1',
      link: 'https://example.com/1',
      pubDate: 1000,
      isRead: 0,
      isFavorite: 1,
      type: 'article'
    },
    {
      id: '2',
      feedId: 'f1',
      title: 'Article 2 (Duplicate Link)',
      link: 'https://example.com/1',
      pubDate: 2000,
      isRead: 0,
      isFavorite: 1,
      type: 'article'
    },
    {
      id: '3',
      feedId: 'f2',
      title: 'Article 3 (Newer)',
      link: 'https://example.com/3',
      pubDate: 3000,
      isRead: 0,
      isFavorite: 1,
      type: 'article'
    },
    {
      id: '4',
      feedId: 'f2',
      title: 'Article 4 (Invalid Date)',
      link: 'https://example.com/4',
      pubDate: NaN,
      isRead: 0,
      isFavorite: 1,
      type: 'article'
    }
  ];

  it('deduplicates articles correctly keeping first occurrence by link/id', () => {
    const result = deduplicateArticles(mockArticles);
    expect(result.length).toBe(3);
    expect(result[0].id).toBe('1');
    expect(result[1].id).toBe('3');
    expect(result[2].id).toBe('4');
  });

  it('sorts articles deterministically by pubDate desc with tie-breaker and NaN handling', () => {
    const result = sortArticles(mockArticles);
    expect(result[0].id).toBe('3'); // pubDate 3000
    expect(result[1].id).toBe('2'); // pubDate 2000
    expect(result[2].id).toBe('1'); // pubDate 1000
    expect(result[3].id).toBe('4'); // NaN -> 0
  });

  it('deduplicates and sorts saved articles correctly', () => {
    const result = deduplicateAndSortSavedArticles(mockArticles);
    expect(result.length).toBe(3);
    expect(result[0].id).toBe('3'); // 3000
    expect(result[1].id).toBe('1'); // 1000 (since id '2' is a duplicate link of id '1')
    expect(result[2].id).toBe('4'); // NaN
  });
});
