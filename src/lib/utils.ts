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

  // Basic protocol check
  const lowercase = trimmed.toLowerCase();
  return (
    lowercase.startsWith('http://') ||
    lowercase.startsWith('https://') ||
    lowercase.startsWith('mailto:')
  );
}

/**
 * Returns the URL if it is safe, otherwise returns the fallback.
 */
export function getSafeUrl(url: string | null | undefined, fallback: string = ''): string {
  if (!url) return fallback;
  return isSafeUrl(url) ? url : fallback;
}
