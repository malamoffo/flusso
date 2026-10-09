import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Validates if a URL uses a safe protocol (http, https, mailto, tel, capacitor, or safe image data).
 * Prevents javascript:, data:text/html, and other dangerous protocols.
 */
export function isSafeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  // Reject obvious dangerous pseudo-protocols
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/html') ||
    lower.startsWith('data:application/') ||
    lower.startsWith('data:text/javascript')
  ) {
    return false;
  }

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

  // Allow safe image data URLs (including urlencoded and base64 SVG, PNG, JPEG, GIF, WebP, etc.)
  if (lower.startsWith('data:image/')) {
    return /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml|avif|bmp|x-icon|vnd\.microsoft\.icon)(;[a-z0-9=._-]+)*([,;])/i.test(trimmed);
  }

  // Allow blob URLs
  if (lower.startsWith('blob:')) {
    return true;
  }

  try {
    // Use the URL constructor for robust protocol validation
    const parsed = new URL(trimmed);
    if (['http:', 'https:', 'mailto:', 'tel:', 'capacitor:'].includes(parsed.protocol)) {
      return true;
    }
    return false;
  } catch (e) {
    // If it's a protocol-relative URL, it's safe
    if (trimmed.startsWith('//')) return true;
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

/**
 * Resolves a relative URL against a base URL.
 */
export function resolveUrl(url: string, baseUrl: string): string {
  if (!url) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch (e) {
    return url; // Return original if resolution fails
  }
}

/**
 * Safely extracts the hostname from a URL string.
 * Handles missing protocols by prepending https://
 */
export function getHostname(url: string | null | undefined): string {
  if (!url) return '';
  let trimmed = url.trim();
  if (!trimmed) return '';
  
  // If it doesn't have a protocol, add one for parsing
  if (!trimmed.includes('://') && !trimmed.startsWith('//')) {
    trimmed = 'https://' + trimmed;
  }
  
  try {
    const parsed = new URL(trimmed);
    return parsed.hostname;
  } catch (e) {
    // Fallback for simple domain-like strings that might fail URL parsing
    const match = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?([^\/\s?#]+)/i);
    return match ? match[1] : '';
  }
}
