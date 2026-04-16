const https = require('https');
https.get('https://www.fantascienza.com/imgbank/social/202604/48043-fuga-new-york.jpg', (res) => {
  console.log('Status code:', res.statusCode);
});
