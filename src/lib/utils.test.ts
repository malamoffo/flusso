import { describe, it, expect } from 'vitest';
import { resolveUrl } from './utils';

describe('resolveUrl', () => {
  it('should resolve a relative URL with a base URL', () => {
    expect(resolveUrl('/path/to/resource', 'https://example.com')).toBe('https://example.com/path/to/resource');
    expect(resolveUrl('resource', 'https://example.com/path/to/')).toBe('https://example.com/path/to/resource');
  });

  it('should return the original URL if it is already absolute', () => {
    expect(resolveUrl('https://absolute.com/path', 'https://example.com')).toBe('https://absolute.com/path');
    expect(resolveUrl('http://absolute.com/path', 'https://example.com')).toBe('http://absolute.com/path');
  });

  it('should handle empty urls and return the original url', () => {
    expect(resolveUrl('', 'https://example.com')).toBe('');
  });

  it('should return the original URL if URL parsing fails (e.g. malformed url and invalid base)', () => {
    expect(resolveUrl('malformed url', 'invalid base')).toBe('malformed url');
  });

  it('should return the original URL if base URL is invalid and original URL is not absolute', () => {
    expect(resolveUrl('/relative/path', 'invalid-base')).toBe('/relative/path');
  });
});
