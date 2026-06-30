import 'dotenv/config';
import { WebSocket } from 'ws';

const API_KEY = process.env.API_CRAWL_KEY || 'qZb7NqapDrMpivBmvuwsjDH4XKtXlNhe';
const BASE_URL = 'https://crawl-search-dev.roxane.one/api/social';
const HEADERS = { 'api-key': API_KEY };
const ROOM_ID = '6a2fd032670a67e0f437dc08';
const LIST_ID = '6a423fc77a0dbb7a6b79a20f';

// Khoảng thời gian crawl: 1 tuần kể từ hôm nay
const DATE_TO = new Date();
const DATE_FROM = new Date(DATE_TO);
DATE_FROM.setDate(DATE_FROM.getDate() - 7);

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DATE_FROM_STR = fmtDate(DATE_FROM);
const DATE_TO_STR = fmtDate(DATE_TO);

console.log(`📅 Crawl range: ${DATE_FROM_STR} → ${DATE_TO_STR}`);

// Mỗi account/platform → 1 stage (group kanban) riêng
const ACCOUNTS = [
  { platform: 'twitter', account: 'PrivOSAI', stageId: '6a432588b01c21fd9434e79e', stageName: 'PrivOS X' },
  { platform: 'twitter', account: 'stev_builds', stageId: '6a4332a4b01c21fd9434e874', stageName: 'Steve X' },
];

async function crawlAccount(platform: string, account: string) {
  console.log(`\n🕵️  Crawling ${platform} / ${account}...`);

  // API không hỗ trợ dateFrom/dateTo → filter client-side sau khi nhận kết quả
  const url = `${BASE_URL}/accountReading?platform=${platform}&account=${encodeURIComponent(account)}`;
  const startRes = await fetch(url, { headers: HEADERS });

  if (!startRes.ok) { console.error('Failed to start task:', await startRes.text()); return; }

  const startData = await startRes.json();
  const raw = startData.taskId || startData;
  const taskId = typeof raw === 'string' ? raw : raw.taskId;
  console.log(`Task ID: ${taskId} — polling every 15s...`);

  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 15000));
    const poll = await fetch(`${BASE_URL}/accountReadingResult/${taskId}`, { headers: HEADERS });
    if (!poll.ok) { console.error('Poll error:', await poll.text()); return; }
    const data = await poll.json();
    process.stdout.write(`[${data.status}] `);
    if (data.status === 'COMPLETED') { console.log('\n✅ Done!'); return data.results; }
    if (data.status === 'FAILED') { console.error('\n❌ Failed:', data.error); return; }
  }
  console.log('\n⏳ Timeout after 30 minutes.');
}

async function run() {
  const privosUrl = process.env.PRIVOS_URL!;
  const clientId = process.env.CLIENT_ID!;
  const clientSecret = process.env.CLIENT_SECRET!;

  if (!privosUrl || !clientId || !clientSecret) {
    console.error('Missing PrivOS credentials in .env'); return;
  }

  // ── 1. Crawl ─────────────────────────────────────────────────────────────
  type AccountData = typeof ACCOUNTS[number] & { posts: any[] };
  const results: AccountData[] = [];

  for (const cfg of ACCOUNTS) {
    const raw = await crawlAccount(cfg.platform, cfg.account);
    if (!raw?.posts) { console.warn(`⚠️  No posts for ${cfg.account}`); continue; }

    const pad = (n: number) => String(n).padStart(2, '0');
    const fromMs = new Date(DATE_FROM_STR).setHours(0, 0, 0, 0);
    const toMs = new Date(DATE_TO_STR).setHours(23, 59, 59, 999);

    const allPosts: any[] = raw.posts.map((p: any, i: number) => {
      const d = new Date(p.timestamp || p.date || new Date());
      return {
        id: `${cfg.account.toLowerCase()}-x-${i}`,
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        dateMs: d.getTime(),
        views: p.views || 0,
        reacts: (p.likes || 0) + (p.reposts || p.retweets || 0),
        comments: p.replies || p.comments || 0,
        summary: (p.content || '').substring(0, 100) + '...',
        link: p.url || p.link || `https://x.com/${cfg.account}`,
      };
    });

    // Filter client-side theo khoảng ngày (fallback nếu API không hỗ trợ dateFrom/dateTo)
    const posts = allPosts.filter((p: any) => p.dateMs >= fromMs && p.dateMs <= toMs);

    console.log(`📊 ${cfg.stageName}: ${raw.posts.length} total → ${posts.length} posts in range (${DATE_FROM_STR} ~ ${DATE_TO_STR})`);

    if (posts.length === 0) {
      console.warn(`⚠️  No posts found in date range for ${cfg.account}`);
      continue;
    }

    results.push({ ...cfg, posts });
  }

  const total = results.reduce((s, r) => s + r.posts.length, 0);
  console.log(`\n📊 Total to push: ${total} posts`);

  if (total === 0) {
    console.log('Nothing to push. Exiting.');
    return;
  }

  // ── 2. Kết nối PrivOS Relay ───────────────────────────────────────────────
  const resAuth = await fetch(`${privosUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
  });
  if (!resAuth.ok) { console.error('Auth failed:', await resAuth.text()); return; }

  const { access_token } = await resAuth.json();
  const ws = new WebSocket(
    privosUrl.replace(/^http/, 'ws') + '/api/v1/mcp-apps.relay',
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  ws.on('error', (e: any) => console.error('WS Error:', e));
  await new Promise(r => ws.on('open', r));
  console.log('👱‍♀️ Connected to Privos Relay');

  const callTool = (name: string, args: any) => new Promise<any>(resolve => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }));
    const listener = (raw: any) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === id) { ws.off('message', listener); resolve(msg.result); }
    };
    ws.on('message', listener);
  });

  const parse = (res: any) => {
    if (res?.content?.[0]?.text) { try { return JSON.parse(res.content[0].text); } catch { } }
    return res;
  };

  // ── 3. Push từng account vào đúng stage (Chống trùng lặp) ────────────────
  console.log('\n🔍 Fetching existing items to prevent duplicates...');
  const existingRes = parse(await callTool('privos.lists.getItems', { listId: LIST_ID, count: 100 }));
  const existingItems = existingRes?.items || [];

  for (const { stageName, stageId, posts } of results) {
    console.log(`\n📤 Processing ${posts.length} posts for "${stageName}"...`);
    
    const newItems = [];
    let updatedCount = 0;

    for (const p of posts) {
      const itemTitle = `Post ${p.id}`;
      // Tìm xem item đã tồn tại chưa (dựa theo tiêu đề hoặc f_id)
      const existing = existingItems.find((item: any) => {
        if (item.name === itemTitle || item.title === itemTitle) return true;
        const fields = item.customFields;
        if (Array.isArray(fields)) {
          return fields.find(f => f.fieldId === 'f_id')?.value === p.id;
        } else if (fields && typeof fields === 'object') {
          return fields['f_id'] === p.id;
        }
        return false;
      });

      const customFields = [
        { fieldId: 'f_id', value: p.id },
        { fieldId: 'f_date', value: p.date },
        { fieldId: 'f_views', value: p.views },
        { fieldId: 'f_reacts', value: p.reacts },
        { fieldId: 'f_comments', value: p.comments },
        { fieldId: 'f_link', value: p.link },
      ];

      if (existing) {
        // Cập nhật item cũ thay vì tạo mới
        await callTool('privos.lists.updateItem', {
          itemId: existing._id,
          title: itemTitle,
          description: p.summary,
          customFields,
        });
        updatedCount++;
      } else {
        // Gom vào mảng để tạo mới
        newItems.push({
          title: itemTitle,
          description: p.summary,
          stageId,
          customFields,
        });
      }
    }

    if (newItems.length > 0) {
      const batchRes = parse(await callTool('privos.lists.batchCreateItems', {
        listId: LIST_ID,
        items: newItems,
      }));
      console.log(`✅ Created ${batchRes?.created ?? newItems.length} new items in "${stageName}"`);
    }
    
    if (updatedCount > 0) {
      console.log(`🔄 Updated ${updatedCount} existing items in "${stageName}"`);
    }
  }

  console.log('\n🎉 Done! Data synced without duplicates.');
  ws.close();
}

run().catch(console.error);
