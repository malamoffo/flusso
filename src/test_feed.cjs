const https = require('https');
https.get('https://feeds.feedburner.com/Fantascienzacom?format=xml', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const matches = data.match(/<img[^>]+src="([^">]+)"/g);
    console.log(matches ? matches.slice(0, 5) : 'No images found');
    
    const enclosures = data.match(/<enclosure[^>]+url="([^">]+)"/g);
    console.log(enclosures ? enclosures.slice(0, 5) : 'No enclosures found');
  });
});
