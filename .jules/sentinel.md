# Sentinel's Security Journal - Flusso

## 2025-05-22 - XSS and XML Injection in RSS/OPML processing
**Vulnerability:** Use of `innerHTML` on a `textarea` element for HTML entity decoding and lack of XML escaping in OPML export.
**Learning:** Even "safer" elements like `textarea` can be a liability when used with `innerHTML` for decoding. Furthermore, simple string replacement for quotes in XML attributes is insufficient for preventing XML injection or ensuring data integrity when dealing with arbitrary feed titles and URLs.
**Prevention:** Always use `DOMParser` with `textContent` for HTML entity decoding. Implement a comprehensive `escapeXml` function for all user-controlled data when generating XML/OPML exports.

## 2025-05-23 - URL Protocol XSS and DOM Clobbering in Article Rendering
**Vulnerability:** Lack of URL protocol validation (allowing `javascript:`) and missing `DOMPurify` protection against DOM Clobbering in dynamically rendered article content.
**Learning:** Sanitizing HTML tags is insufficient if malicious URLs can still be injected into `href` or `src` attributes, or if `id` and `name` attributes are allowed to clobber global JavaScript variables. RSS readers are particularly vulnerable due to the arbitrary nature of feed content.
**Prevention:** Implement a whitelist for safe URL protocols (e.g., `http:`, `https:`, `mailto:`) and use it to sanitize all incoming URLs at both the storage and UI layers. Always include `FORBID_ATTR: ['id', 'name']` in `DOMPurify` configurations for user-generated content.
