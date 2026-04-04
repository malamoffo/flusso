import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Validates if a URL uses a safe protocol (http, https, mailto).
 * Prevents javascript: and other dangerous protocols.
 */
export function isSafeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Allow protocol-relative URLs, relative paths, and anchors
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('#')
  ) {
    return true;
  }

  try {
    // Use the URL constructor for robust protocol validation
    const parsed = new URL(trimmed);
    return ['http:', 'https:', 'mailto:', 'tel:', 'capacitor:', 'blob:', 'data:'].includes(parsed.protocol);
  } catch (e) {
    // If it's a protocol-relative URL, it's safe
    if (trimmed.startsWith('//')) return true;
    
    // If URL parsing fails and it's not a relative path we handle above,
    // we return false to be safe.
    return false;
  }
}

/**
 * Returns the URL if it is safe, otherwise returns the fallback.
 */
export function getSafeUrl(url: string | null | undefined): string;
export function getSafeUrl<T>(url: string | null | undefined, fallback: T): string | T;
export function getSafeUrl(url: string | null | undefined, fallback: any = ''): any {
  if (!url) return fallback;
  if (!isSafeUrl(url)) return fallback;
  
  // Ensure protocol-relative URLs are converted to https
  if (url.startsWith('//')) {
    return `https:${url}`;
  }
  
  return url;
}

/**
 * Resolves a potentially relative URL against a base URL.
 */
export function resolveUrl(url: string | null | undefined, base: string | null | undefined): string {
  if (!url) return '';
  if (!base) return getSafeUrl(url);
  
  try {
    return new URL(url, base).href;
  } catch (e) {
    return getSafeUrl(url);
  }
}

/**
 * Parses a duration string (HH:MM:SS, MM:SS, or seconds) into total seconds.
 */
export function parseDurationToSeconds(durationStr: string | null | undefined): number {
  if (!durationStr) return 0;
  const str = String(durationStr).trim();
  if (!isNaN(Number(str))) return Number(str);
  
  const parts = str.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Formats seconds into a HH:MM:SS or MM:SS string.
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
