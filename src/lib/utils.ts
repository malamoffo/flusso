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
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch (e) {
    // If URL parsing fails and it's not a relative path we handle above,
    // we return false to be safe.
    return false;
  }
}

/**
 * Returns the URL if it is safe, otherwise returns the fallback.
 */
export function getSafeUrl(url: string | null | undefined, fallback: string = ''): string {
  if (!url) return fallback;
  return isSafeUrl(url) ? url : fallback;
}
