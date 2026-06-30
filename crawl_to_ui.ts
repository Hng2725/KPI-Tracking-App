import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const API_KEY = process.env.API_CRAWL_KEY || 'qZb7NqapDrMpivBmvuwsjDH4XKtXlNhe';
const BASE_URL = 'https://crawl-search-dev.roxane.one/api/social';
const HEADERS = { 'api-key': API_KEY };
const ROOM_ID = '6a2fd032670a67e0f437dc08'; // from user

async function crawlAccount(platform: string, account: string) {
  console.log(`\n🕵️ Crawling ${platform} account: ${account} for room ${ROOM_ID}`);
  const startRes = await fetch(`${BASE_URL}/accountReading?platform=${platform}&account=${encodeURIComponent(account)}`, { headers: HEADERS });
  
  if (!startRes.ok) {
    console.error('Failed to start task:', await startRes.text());
    return;
  }
  
  const startData = await startRes.json();
  const taskId = startData.taskId || startData;
  const id = typeof taskId === 'string' ? taskId : taskId.taskId;
  console.log(`Task started: ${id}. Polling for results (approx 5-10 mins)...`);

  let attempts = 0;
  while (attempts < 120) {
    await new Promise(r => setTimeout(r, 15000));
    const pollRes = await fetch(`${BASE_URL}/accountReadingResult/${id}`, { headers: HEADERS });
    
    if (!pollRes.ok) {
      console.error('Failed to poll:', await pollRes.text());
      return;
    }
    
    const data = await pollRes.json();
    process.stdout.write(`[${data.status}] `);
    
    if (data.status === 'COMPLETED') {
      console.log(`\n✅ Task COMPLETED!`);
      return data.results;
    } else if (data.status === 'FAILED') {
      console.error(`\n❌ Task FAILED:`, data.error);
      return;
    }
    attempts++;
  }
  console.log('\n⏳ Timeout waiting for results after 30 minutes.');
}

async function run() {
  const privosUrl = process.env.PRIVOS_URL;
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  
  if (!privosUrl || !clientId || !clientSecret) {
    console.error("Missing PrivOS credentials in .env");
    return;
  }

  const accounts = ['PrivOSAI', 'stev_builds'];
  let allFormatted: any[] = [];

  for (const acc of accounts) {
    const result = await crawlAccount('twitter', acc);
    
    if (result && result.posts) {
      const formatted = result.posts.map((p: any, i: number) => {
         const dateStr = p.timestamp || p.date || new Date().toISOString();
         const d = new Date(dateStr);
         const pad = (n: number) => n.toString().padStart(2, '0');
         const localDate = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

         return {
           id: `${acc.toLowerCase()}-x-${i}`,
           date: localDate, // YYYY-MM-DD theo múi giờ Local (như VN) thay vì cắt tĩnh theo UTC
           views: p.views || 0,
           reacts: (p.likes || 0) + (p.reposts || p.retweets || 0),
           comments: p.replies || p.comments || 0,
           summary: (p.content || '').substring(0, 100) + '...',
           link: p.url || p.link || `https://x.com/${acc}`
         };
      });
      allFormatted = allFormatted.concat(formatted);
      console.log(`✅ Got ${formatted.length} posts for ${acc}`);
    }
  }

  console.log(`\n✅ Crawled ${allFormatted.length} total posts`);

  console.log(`Connecting to PrivOS Relay for room: ${ROOM_ID}`);
  const resAuth = await fetch(`${privosUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
  });
  
  if (!resAuth.ok) {
    console.error("Auth failed:", await resAuth.text());
    return;
  }
  
  const { access_token } = await resAuth.json();
  const WebSocket = (await import('ws')).default;
  const wsUrl = privosUrl.replace(/^http/, 'ws') + '/api/v1/mcp-apps.relay';
  const ws = new WebSocket(wsUrl, { headers: { Authorization: `Bearer ${access_token}` } });
  
  ws.on('error', (e: any) => console.error("WS Error:", e));
  
  await new Promise(r => ws.on('open', r));
  console.log("👱‍♀️ Connected to Privos Relay");
  
  const callTool = (name: string, args: any) => new Promise((resolve) => {
    const id = Date.now() + Math.floor(Math.random()*1000);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args }}));
    const listener = (raw: any) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) { ws.off('message', listener); resolve(msg.result); }
    };
    ws.on('message', listener);
  });

  const listId = '6a423fc77a0dbb7a6b79a20f';
  console.log(`Pushing to privos.lists for listId: ${listId}`);
  for (const p of allFormatted) {
    await callTool('privos.lists.createItem', {
      listId,
      title: `Post ${p.id}`,
      description: p.summary,
      customFields: [
        { fieldId: 'f_id', value: p.id },
        { fieldId: 'f_date', value: p.date },
        { fieldId: 'f_views', value: p.views },
        { fieldId: 'f_reacts', value: p.reacts },
        { fieldId: 'f_comments', value: p.comments },
        { fieldId: 'f_link', value: p.link }
      ]
    });
  }
  console.log('✅ Pushed all items to privos.lists');
  ws.close();
}

run().catch(console.error);
