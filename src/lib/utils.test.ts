import { describe, it, expect } from 'vitest';
import { resolveUrl, isSafeUrl, getSafeUrl } from './utils';

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

describe('isSafeUrl & getSafeUrl', () => {
  it('allows safe http and https URLs', () => {
    expect(isSafeUrl('https://example.com/test')).toBe(true);
    expect(isSafeUrl('http://example.com/test')).toBe(true);
    expect(getSafeUrl('https://example.com')).toBe('https://example.com');
  });

  it('blocks javascript: and dangerous execution schemes', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JAVASCRIPT:alert(document.cookie)')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(getSafeUrl('javascript:alert(1)')).toBe('');
  });

  it('blocks unsafe data URLs while allowing image data URLs', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('data:application/javascript;base64,YWxlcnQoMSk=')).toBe(false);
    expect(isSafeUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')).toBe(true);
    expect(isSafeUrl('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E')).toBe(true);
    expect(isSafeUrl('data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=')).toBe(true);
    expect(getSafeUrl('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E');
  });
});

