// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseRssXml, extractSiteBrandingImage, extractYouTubeThumbnail } from '../rssParser';
import { extractArticleImages } from '../../components/RotatingImageCarousel';

describe('RSS Image Parser & Discovery Tests', () => {
  it('extracts YouTube thumbnail from watch link or embed', () => {
    const textWithYt = 'Guarda il nostro video su https://www.youtube.com/watch?v=1Jhskk68sdY per i dettagli';
    const thumb = extractYouTubeThumbnail(textWithYt);
    expect(thumb).toBe('https://img.youtube.com/vi/1Jhskk68sdY/hqdefault.jpg');

    const iframeText = '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>';
    expect(extractYouTubeThumbnail(iframeText)).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });

  it('extracts site branding image from HTML without blocking site logos', () => {
    const htmlWithLogo = `
      <!DOCTYPE html>
      <html>
        <head><title>Lucasdelirium</title></head>
        <body>
          <header>
            <a href="index.html"><img src="img/logo-lucasdelirium.png" alt="Lucasdelirium"></a>
          </header>
        </body>
      </html>
    `;
    const siteUrl = 'https://www.lucasdelirium.it/';
    const branding = extractSiteBrandingImage(htmlWithLogo, siteUrl);
    expect(branding).toBe('https://www.lucasdelirium.it/img/logo-lucasdelirium.png');
  });

  it('extracts og:image when present', () => {
    const htmlWithOg = `
      <html>
        <head>
          <meta property="og:image" content="https://example.com/cover.jpg" />
        </head>
        <body><h1>Article</h1></body>
      </html>
    `;
    const branding = extractSiteBrandingImage(htmlWithOg, 'https://example.com');
    expect(branding).toBe('https://example.com/cover.jpg');
  });

  it('correctly handles feeds like lucasdelirium with youtube links', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
    <rss version="2.0">
      <channel>
        <title>Lucasdelirium Feed</title>
        <link>https://www.lucasdelirium.it/</link>
        <description>Aggiornamenti mensili</description>
        <item>
          <title>AGGIORNAMENTO DEL 31-10-2026</title>
          <link>https://www.lucasdelirium.it/news.html#nov26</link>
          <pubDate>Sat, 31 Oct 2026 12:00:00 GMT</pubDate>
          <description>Nuovo video disponibile su https://www.youtube.com/watch?v=1Jhskk68sdY con approfondimenti.</description>
        </item>
      </channel>
    </rss>`;

    const parsed = parseRssXml(xml, 'https://www.lucasdelirium.it/download/lucasdelirium.xml');
    expect(parsed.feed.title).toBe('Lucasdelirium Feed');
    expect(parsed.articles.length).toBe(1);
    expect(parsed.articles[0].imageUrl).toBe('https://img.youtube.com/vi/1Jhskk68sdY/hqdefault.jpg');
  });

  it('extractArticleImages falls back to feed branding image when article has no images', () => {
    const article = {
      title: 'Articolo senza immagini',
      content: 'Solo testo senza immagini'
    };
    const images = extractArticleImages(article, undefined, 'https://www.lucasdelirium.it/img/logo-lucasdelirium.png');
    expect(images).toContain('https://www.lucasdelirium.it/img/logo-lucasdelirium.png');
  });

  it('correctly upgrades http URLs to https and extracts images from feeds like Fantascienza.com', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Fantascienza.com</title>
        <link>http://www.fantascienza.com/</link>
        <description>Notizie e recensioni</description>
        <image>
          <url>http://www.fantascienza.com/images/fantascienzacom.png</url>
          <title>Fantascienza.com</title>
          <link>http://www.fantascienza.com/</link>
        </image>
        <item>
          <title><![CDATA[Televisione: Fantascienza novita]]></title>
          <link>http://http://www.fantascienza.com/32119/fantascienza-novita</link>
          <description><![CDATA[<a href="http://http://www.fantascienza.com/32119/fantascienza-novita"><img src="http://www.fantascienza.com/imgbank/social/202611/48653.jpg" alt="Cover" /></a><p>Testo articolo</p>]]></description>
          <pubDate>Tue, 03 Nov 2026 00:00:00 +0100</pubDate>
        </item>
      </channel>
    </rss>`;

    const parsed = parseRssXml(xml, 'https://rss.delosnetwork.it/fantascienza.com/home.rss');
    expect(parsed.feed.title).toBe('Fantascienza.com');
    // Feed logo must be upgraded to https
    expect(parsed.feed.imageUrl).toBe('https://www.fantascienza.com/images/fantascienzacom.png');
    
    expect(parsed.articles.length).toBe(1);
    const article = parsed.articles[0];
    // Article image must be upgraded to https so Android usesCleartextTraffic="false" and mixed content do not block it
    expect(article.imageUrl).toBe('https://www.fantascienza.com/imgbank/social/202611/48653.jpg');
    expect(article.postImageUrls).toContain('https://www.fantascienza.com/imgbank/social/202611/48653.jpg');
    // Double protocol typo http://http:// must be cleaned
    expect(article.link).not.toContain('http://http://');
    expect(article.link).toBe('https://www.fantascienza.com/32119/fantascienza-novita');
  });
});
