import { extractBestImage } from './src/services/storage';

const spotifyUrl = 'https://creators.spotify.com/pod/profile/lumacofono/episodes/One-Piece-Capitolo-1178-e3h3kqt';
// This is just a page URL, not HTML content. extractBestImage expects HTML content.
// The contentFetcher is likely fetching the HTML content of the page.

// If I want to test extractBestImage, I need the HTML content.
// I can try to fetch it using the proxy.

import { fetchWithProxy } from './src/utils/proxy';

async function test() {
  const html = await fetchWithProxy(spotifyUrl, false);
  const imageUrl = extractBestImage(html);
  console.log('Extracted image URL:', imageUrl);
}

test();
