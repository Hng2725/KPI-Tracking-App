import 'dotenv/config';

const API_KEY = process.env.API_CRAWL_KEY;
const taskId = '8c6b2ffb-2fc8-4189-8e58-fb43e0b451e6';

fetch(`https://crawl-search-dev.roxane.one/api/social/accountReadingResult/${taskId}`, {
  headers: { 'api-key': API_KEY || '' }
})
.then(r => r.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(console.error);
