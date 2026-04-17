const https = require('https');

const urls = [
  "https://blackworld-c4k6x4v4c-all4elis-projects.vercel.app",
  "https://blackworld-2t6swz7z5-all4elis-projects.vercel.app",
  "https://blackworld-7b1drbkyo-all4elis-projects.vercel.app",
  "https://blackworld-77185uh1g-all4elis-projects.vercel.app",
  "https://blackworld-o7vwvcxpd-all4elis-projects.vercel.app",
  "https://blackworld-oap7lyvvf-all4elis-projects.vercel.app",
  "https://blackworld-pimejdepm-all4elis-projects.vercel.app",
  "https://blackworld-i7fty5ez8-all4elis-projects.vercel.app",
  "https://blackworld-ioolvd2ba-all4elis-projects.vercel.app",
  "https://blackworld-hxmet7lrh-all4elis-projects.vercel.app"
];

const checkUrl = async (url) => {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'x-vercel-protection-bypass': 'Bf3hSBW2R'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ url, status: res.statusCode, length: data.length, failed: res.statusCode >= 500 });
      });
    }).on('error', (err) => {
      resolve({ url, error: err.message, failed: true });
    });
  });
};

(async () => {
  for (const url of urls) {
    const result = await checkUrl(url);
    console.log(`URL: ${result.url.padEnd(65)} | Status: ${result.status} | Length: ${result.length} | Error: ${result.failed ? 'YES' : 'NO'}`);
  }
})();
