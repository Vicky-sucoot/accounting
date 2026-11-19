// 端對端測試：用模擬的 iPhone 瀏覽器實際操作網頁版。
// 執行：node --test docs/app/tests/（需要 playwright 與 Chromium，見 README）
// 日期固定為 2026-11-18（台北時間）；匯率 API 以假資料回應，不需要網路。
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');   // docs/
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const RATES = { usd: 31.5, jpy: 0.21, eur: 34 };
const NOW = new Date('2026-11-18T10:00:00+08:00');

let server, base, browser;

test.before(async () => {
  server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(ROOT, url);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port + '/app/';
  browser = await chromium.launch();
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});

/** 開一個全新的 App（空資料），回傳 page 與錯誤清單 */
async function openApp(opts = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], timezoneId: 'Asia/Taipei', locale: 'zh-TW', acceptDownloads: true, serviceWorkers: 'block' });
  if (opts.standalone) await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.route(/currency-api/, route => {
    if (opts.offline) return route.abort('internetdisconnected');
    const m = route.request().url().match(/@([\w-]+)\/v1\/currencies\/(\w+)\.json|\/\/([\w-]+)\.currency-api\.pages\.dev\/v1\/currencies\/(\w+)\.json/);
    const date = (m[1] || m[3]) === 'latest' ? '2026-11-18' : (m[1] || m[3]);
    const cur = m[2] || m[4];
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ date, [cur]: { twd: RATES[cur] } }) });
  });
  await page.goto(base);
  await page.waitForSelector('.hero-card');
  return { page, ctx, errors, state: () => page.evaluate(() => JSON.parse(JSON.stringify(__PL_APP__.S))) };
}

const ui = page => ({
  tab: name => page.click('.tabbar [data-tab=' + name + ']'),
  save: async () => { await page.click('#pages [data-k=right]'); await page.waitForTimeout(250); },
  pagesOpen: () => page.$eval('#pages', el => !el.hidden),
  async add({ amount, currency, method, date, merchant, category }) {
    await page.click('.tabbar [data-tab=list]');
    await page.click('[data-k=add]');
    if (currency) await page.selectOption('#f-cur', currency);
    await page.fill('#f-amount', String(amount));
    if (date) { await page.fill('#f-date', date); await page.dispatchEvent('#f-date', 'change'); }
    if (method) await page.selectOption('#f-method', method);
    if (category) await page.selectOption('#f-cat', { label: category });
    if (merchant) await page.fill('#f-merchant', merchant);
    if (currency && currency !== 'TWD') await page.waitForFunction(() => !document.querySelector('#pages').innerText.includes('匯率中'));
    await page.click('#pages [data-k=right]'); await page.waitForTimeout(250);
  },
  async addCard(name, closing, due) {
    await page.click('.tabbar [data-tab=settings]'); await page.click('[data-k=cards]');
    await page.click('#pages [data-k=right]');
    await page.fill('#cd-name', name);
    if (closing) { await page.selectOption('#cd-close', String(closing)); await page.selectOption('#cd-due', String(due)); }
    await page.click('#pages [data-k=right]');
    await page.goBack(); await page.waitForTimeout(150);
  }
});

test('外幣刷卡：自動匯率、手續費與預算提醒', async () => {
  const { page, errors, state } = await openApp();
  const u = ui(page);
  await u.addCard('國泰 CUBE');
  await u.tab('budget'); await page.click('[data-k=edit]'); await page.fill('[data-b=total]', '3000'); await u.save();
  await u.add({ amount: 100, currency: 'USD', method: 'creditCard' });
  const e = (await state()).entries[0];
  assert.deepEqual([e.rate, e.amountTWD, e.feeTWD, e.rateSource], [31.5, 3150, 95, 'currencyAPI']);
  assert.match(await page.textContent('#toast'), /已超出預算/);
  assert.deepEqual((await state()).alerts.map(a => a.threshold).sort((x, y) => x - y), [80, 100]);
  assert.deepEqual(errors, []);
});

test('離線時改為手動匯率', async () => {
  const { page, errors, state } = await openApp({ offline: true });
  await page.click('.fab');
  await page.selectOption('#f-cur', 'JPY');
  await page.waitForSelector('#f-rate');
  assert.match(await page.textContent('#pages'), /無法連線/);
  await page.fill('#f-amount', '8000'); await page.fill('#f-rate', '0.2');
  await page.click('#pages [data-k=right]'); await page.waitForTimeout(250);
  const e = (await state()).entries[0];
  assert.deepEqual([e.amountTWD, e.rateSource], [1600, 'manual']);
  assert.deepEqual(errors, []);
});

test('外幣現金錢包：換匯後現金支出用平均成本', async () => {
  const { page, errors, state } = await openApp();
  const u = ui(page);
  const exchange = async (amt, twd) => {
    await u.tab('settings'); await page.click('[data-k=wallets]');
    await page.click('#pages [data-k=right]');
    await page.selectOption('#f-cur', 'JPY');
    await page.fill('#f-amount', String(amt)); await page.fill('#f-paid', String(twd));
    await page.click('#pages [data-k=right]'); await page.waitForTimeout(250);
  };
  await exchange(10000, 2200);
  await exchange(10000, 2000);
  await u.add({ amount: 5000, currency: 'JPY', method: 'cash' });
  const s = await state();
  const spend = s.entries.find(x => x.type === 'expense');
  assert.deepEqual([spend.rate, spend.amountTWD, spend.rateSource], [0.21, 1050, 'wallet']);
  // 換匯不算支出
  await u.tab('home');
  assert.match(await page.textContent('.hero-card .big'), /NT\$1,050/);
  await u.tab('settings'); await page.click('[data-k=wallets]');
  assert.match(await page.textContent('#pages'), /JPY 15,000/);
  assert.deepEqual(errors, []);
});

test('代墊：不計入自己的支出，可標記收回', async () => {
  const { page, errors, state } = await openApp();
  await page.click('.fab');
  await page.selectOption('#f-cur', 'USD');
  await page.fill('#f-amount', '100');
  await page.selectOption('#f-method', 'cash');
  await page.click('[data-k=more]');
  await page.check('#f-adv');
  await page.fill('#f-advwho', '小明');
  await page.click('[data-k=advhalf]');
  await page.waitForFunction(() => !document.querySelector('#pages').innerText.includes('匯率中'));
  await page.click('#pages [data-k=right]'); await page.waitForTimeout(250);
  const e = (await state()).entries[0];
  assert.deepEqual([e.advAmount, e.advTWD, e.advWho], [50, 1575, '小明']);
  assert.match(await page.textContent('.hero-card .big'), /NT\$1,575/);
  await ui(page).tab('settings'); await page.click('[data-k=advances]');
  assert.match(await page.textContent('#pages'), /待收回合計\s*NT\$1,575/);
  await page.click('[data-settle]'); await page.waitForTimeout(150);
  assert.equal((await state()).entries[0].advSettled, true);
  assert.deepEqual(errors, []);
});

test('信用卡：結帳日／繳款提醒、依帳單對帳', async () => {
  const { page, errors, state } = await openApp();
  const u = ui(page);
  await u.addCard('國泰 CUBE', 15, 20);   // 上期 10/16–11/15，11/20 截止 → 即將到期
  await u.add({ amount: 100, currency: 'USD', method: 'creditCard', date: '2026-11-01' });
  await u.tab('home');
  assert.match(await page.textContent('[data-duecard]'), /即將到期.*NT\$3,245/s);
  // 依帳單調整
  await page.click('.erow'); await page.click('[data-k=reconcile]');
  await page.fill('#rc-amt', '3180'); await page.fill('#rc-fee', '47');
  await page.click('#pages [data-k=right]'); await page.waitForTimeout(200);
  const e = (await state()).entries[0];
  assert.deepEqual([e.amountTWD, e.feeTWD, e.rate, e.reconciled, e.rateSource], [3180, 47, 31.8, true, 'statement']);
  assert.equal(e.estimate.amountTWD, 3150);
  // 繳款帶入應繳金額
  await page.goBack(); await page.waitForTimeout(150);
  await page.click('[data-duecard]'); await page.click('[data-k=pay]');
  assert.equal(await page.inputValue('#f-amount'), '3,227');   // 千分位顯示
  await page.click('#pages [data-k=right]'); await page.waitForTimeout(250);
  assert.equal(await page.$('[data-duecard]'), null);
  // 取消對帳恢復估算
  await page.click('.erow:has-text("USD")'); await page.click('[data-k=unreconcile]'); await page.waitForTimeout(150);
  const back = (await state()).entries.find(x => x.type === 'expense');
  assert.deepEqual([back.amountTWD, back.feeTWD, back.reconciled], [3150, 95, false]);
  assert.deepEqual(errors, []);
});

test('旅程、旅程預算、再記一筆、商家建議', async () => {
  const { page, errors, state } = await openApp();
  const u = ui(page);
  await u.tab('settings'); await page.click('[data-k=trips]');
  await page.fill('#t-active', '2026 東京'); await page.locator('#t-active').blur(); await page.waitForTimeout(150);
  await page.goBack(); await page.waitForTimeout(150);
  await u.add({ amount: 900, merchant: 'UNIQLO', category: '🛍️ 購物' });
  await u.tab('settings'); await page.click('[data-k=trips]'); await page.click('[data-trip]');
  await page.fill('#tb-amt', '1000'); await page.dispatchEvent('#tb-amt', 'change'); await page.waitForTimeout(200);
  assert.match(await page.textContent('#toast'), /旅程「2026 東京」.*80%/);
  // 再記一筆
  await page.goBack(); await page.waitForTimeout(100); await page.goBack(); await page.waitForTimeout(150);   // 關閉旅程頁與旅程清單
  await u.tab('home');
  await page.click('.erow'); await page.click('[data-k=again]');
  await page.click('[data-k=more]');   // 旅程在「更多選項」
  assert.equal(await page.inputValue('#f-merchant'), 'UNIQLO');
  assert.equal(await page.inputValue('#f-trip'), '2026 東京');
  await page.fill('#f-amount', '200'); await page.click('#pages [data-k=right]'); await page.waitForTimeout(250);
  assert.match(await page.textContent('#toast'), /已超出預算：旅程/);
  // 商家建議帶入分類
  await page.click('.fab');
  await page.fill('#f-merchant', 'UNIQLO'); await page.dispatchEvent('#f-merchant', 'change'); await page.waitForTimeout(100);
  assert.equal(await page.$eval('#f-cat', s => s.options[s.selectedIndex].text), '🛍️ 購物');
  assert.deepEqual((await state()).entries.map(e => e.trip), ['2026 東京', '2026 東京']);
  assert.deepEqual(errors, []);
});

test('返回手勢、備份提醒、備份還原、CSV、月趨勢', async () => {
  const { page, errors, state } = await openApp({ standalone: true });
  const u = ui(page);
  await u.add({ amount: 500, date: '2026-10-05' });
  await u.add({ amount: 300 });
  // 返回：瀏覽器上一頁與左緣滑動
  await u.tab('home');
  await page.click('.fab'); await page.goBack(); await page.waitForTimeout(150);
  assert.equal(await u.pagesOpen(), false);
  await page.click('.fab');
  await page.evaluate(() => {
    const T = x => new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 400 });
    document.dispatchEvent(new TouchEvent('touchstart', { touches: [T(5)] }));
    for (let x = 5; x <= 205; x += 20) document.dispatchEvent(new TouchEvent('touchmove', { touches: [T(x)] }));
    document.dispatchEvent(new TouchEvent('touchend', { touches: [] }));
  });
  assert.equal(await u.pagesOpen(), false);
  // 備份提醒 → 下載備份
  await u.tab('home');
  assert.ok(await page.$('.warnbanner'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-k=doBackup]')]);
  const backup = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  assert.equal(backup.app, 'PocketLedger');
  assert.equal(backup.entries.length, 2);
  await page.waitForTimeout(150);
  assert.equal(await page.$('.warnbanner'), null);
  // 還原
  await page.evaluate(async b => { await __PL_APP__.restoreBackup(b); }, backup);
  assert.equal((await state()).entries.length, 2);
  // 報表：月趨勢與 CSV
  await u.tab('reports');
  assert.match(await page.textContent('#trend'), /11月比10月少 40%/);
  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('[data-k=csv]')]);
  const text = fs.readFileSync(await csv.path(), 'utf8');
  assert.ok(text.startsWith('﻿日期,類型'));
  assert.equal(text.trim().split('\r\n').length, 2);
  assert.deepEqual(errors, []);
});

test('交易紀錄月曆：每日金額、點選日期、在該日新增', async () => {
  const { page, errors, state } = await openApp();
  const u = ui(page);
  await u.add({ amount: 1200, date: '2026-11-03' });
  await u.add({ amount: 300, date: '2026-11-03' });
  await u.add({ amount: 800, date: '2026-10-20' });
  await u.tab('list');
  // 預設為月曆，今天（11/18）已選取
  assert.ok(await page.$('.cal-cell.today.sel[data-day="2026-11-18"]'));
  assert.match(await page.textContent('[data-day="2026-11-03"]'), /3\s*1,500/);
  assert.match(await page.textContent('.tiles'), /本月支出\s*NT\$1,500/);
  // 點 11/3 → 下方列出兩筆
  await page.click('[data-day="2026-11-03"]');
  assert.equal(await page.$$eval('#cal-day .erow', r => r.length), 2);
  // 在 11/3 新增一筆
  await page.click('[data-k=addday]');
  assert.equal(await page.inputValue('#f-date'), '2026-11-03');
  await page.fill('#f-amount', '100'); await page.click('#pages [data-k=right]'); await page.waitForTimeout(250);
  assert.equal((await state()).entries.filter(e => e.date === '2026-11-03').length, 3);
  // 上個月
  await page.click('[data-k=prevm]');
  assert.match(await page.textContent('.cal-title'), /2026年10月/);
  assert.match(await page.textContent('[data-day="2026-10-20"]'), /800/);
  // 左右滑動切換月份
  await page.evaluate(() => {
    const g = document.querySelector('#cal-grid');
    const T = x => new Touch({ identifier: 1, target: g, clientX: x, clientY: 300 });
    g.dispatchEvent(new TouchEvent('touchstart', { touches: [T(300)], bubbles: true }));
    g.dispatchEvent(new TouchEvent('touchend', { changedTouches: [T(150)], touches: [], bubbles: true }));
  });
  assert.match(await page.textContent('.cal-title'), /2026年11月/);
  // 切換成清單並記住選擇
  await page.click('[data-k=view] button[data-v=list]');
  assert.equal(await page.$('.cal'), null);
  assert.ok(await page.$('.dayh'));
  assert.deepEqual(errors, []);
});

test('介面：圖示、滑入動畫、千分位、更多選項、下方儲存鈕、左滑刪除、近 7 天圖', async () => {
  const { page, errors, state } = await openApp();
  const u = ui(page);
  // 20. 分頁使用 SVG 圖示；21. 設定頁彩色圖示方塊
  assert.equal(await page.$$eval('.tabbar svg.ti', s => s.length), 5);
  await u.tab('settings');
  assert.equal(await page.$$eval('.sicon svg', s => s.length), 14);
  // 23. 開啟子頁面有滑入動畫，關閉時有滑出畫面
  await page.click('[data-k=fee]');
  assert.ok(await page.$('#pages .page.enter'));
  await page.click('#pages [data-k=back]');
  assert.ok(await page.$('.ghost'));
  await page.waitForTimeout(400);
  assert.equal(await page.$('.ghost'), null);
  // 24. 金額千分位；25. 精簡表單與下方儲存鈕
  await u.tab('home');
  await page.click('.fab');
  await page.fill('#f-amount', '1234567.5');
  assert.equal(await page.inputValue('#f-amount'), '1,234,567.5');
  assert.equal(await page.$('#f-note'), null);              // 收在「更多選項」
  assert.equal(await page.$('#f-file'), null);
  await page.fill('#f-merchant', '全聯');
  await page.click('[data-k=more]');
  await page.fill('#f-note', '週末採買');
  await page.click('[data-k=more]');                        // 收合後摘要顯示已填內容
  assert.match(await page.textContent('[data-k=more]'), /備註/);
  await page.click('[data-k=footsave]'); await page.waitForTimeout(300);
  const e = (await state()).entries[0];
  assert.deepEqual([e.amount, e.note, e.merchant], [1234567.5, '週末採買', '全聯']);
  // 28. 近 7 天支出小圖：今天有一筆，點一下跳到紀錄月曆
  assert.equal(await page.$$eval('.wbar', b => b.length), 7);
  assert.match(await page.textContent('.wbar.today'), /123\.5萬/);
  await page.click('.wbar.today');
  assert.equal(await page.$eval('.tabbar .on', b => b.dataset.tab), 'list');
  assert.ok(await page.$('.cal-cell.sel[data-day="2026-11-18"]'));
  // 26. 左滑刪除
  await u.tab('home');
  const swipeRow = async () => page.evaluate(() => {
    const sw = document.querySelector('.swipe'), r = sw.getBoundingClientRect();
    const T = x => new Touch({ identifier: 1, target: sw, clientX: x, clientY: r.top + 20 });
    sw.dispatchEvent(new TouchEvent('touchstart', { touches: [T(300)], bubbles: true }));
    for (let x = 290; x >= 180; x -= 15) sw.dispatchEvent(new TouchEvent('touchmove', { touches: [T(x)], bubbles: true }));
    sw.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [T(180)], bubbles: true }));
  });
  await swipeRow();
  assert.match(await page.$eval('.swipe .erow', r => r.style.transform), /-84px/);
  await page.click('.swdel'); await page.waitForTimeout(400);
  assert.equal((await state()).entries.length, 0);
  assert.match(await page.textContent('#toast'), /已刪除/);
  assert.deepEqual(errors, []);
});

test('刪除可復原：明細刪除、左滑刪除，含收據照片', async () => {
  const { page, errors, state } = await openApp();
  // 新增一筆有收據的交易
  await page.click('.fab');
  await page.fill('#f-amount', '450'); await page.fill('#f-merchant', '星巴克');
  await page.click('[data-k=more]');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('#f-file', { name: 'r.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('#f-receipt img');
  await page.click('[data-k=footsave]'); await page.waitForTimeout(300);
  const receipt = (await state()).entries[0].receipt;
  assert.ok(receipt);
  const hasReceipt = () => page.evaluate(async n => !!(await DB.get('receipts', n)), receipt);
  // 從明細刪除（不再跳確認視窗）→ 復原
  await page.click('.erow'); await page.click('[data-k=del]'); await page.waitForTimeout(200);
  assert.equal((await state()).entries.length, 0);
  assert.equal(await hasReceipt(), false);
  assert.match(await page.textContent('#toast'), /已刪除「星巴克」/);
  await page.click('.toast-act'); await page.waitForTimeout(300);
  assert.equal((await state()).entries.length, 1);
  assert.equal(await hasReceipt(), true);
  assert.match(await page.textContent('#toast'), /已復原/);
  assert.equal(await page.$$eval('.erow', r => r.length) > 0, true);
  // 左滑刪除 → 復原
  await page.evaluate(() => {
    const sw = document.querySelector('.swipe'), r = sw.getBoundingClientRect();
    const T = x => new Touch({ identifier: 1, target: sw, clientX: x, clientY: r.top + 20 });
    sw.dispatchEvent(new TouchEvent('touchstart', { touches: [T(300)], bubbles: true }));
    for (let x = 290; x >= 180; x -= 15) sw.dispatchEvent(new TouchEvent('touchmove', { touches: [T(x)], bubbles: true }));
    sw.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [T(180)], bubbles: true }));
  });
  await page.click('.swdel'); await page.waitForTimeout(400);
  assert.equal((await state()).entries.length, 0);
  await page.click('.toast-act'); await page.waitForTimeout(300);
  const back = (await state()).entries;
  assert.deepEqual([back.length, back[0].merchant, back[0].receipt], [1, '星巴克', receipt]);
  assert.equal(await hasReceipt(), true);
  assert.deepEqual(errors, []);
});

test('離線匯率：用最近一次查到的匯率，有網路時補查', async () => {
  const { page, ctx, errors, state } = await openApp();
  const u = ui(page);
  // 有網路時預先下載常用外幣匯率（JPY 0.21）
  await page.waitForFunction(() => __PL_APP__.lastRates.JPY, null, { timeout: 8000 });
  // 切成離線：匯率 API 失敗
  await page.unroute(/currency-api/);
  await page.route(/currency-api/, r => r.abort('internetdisconnected'));
  await page.click('.fab');
  await page.selectOption('#f-cur', 'JPY');
  await page.waitForFunction(() => document.querySelector('#pages').innerText.includes('目前離線'));
  await page.fill('#f-amount', '1000');
  await page.click('[data-k=footsave]'); await page.waitForTimeout(300);
  let e = (await state()).entries[0];
  assert.deepEqual([e.rate, e.amountTWD, e.rateSource], [0.21, 210, 'cached']);
  assert.match(await page.textContent('.esub'), /離線匯率/);
  assert.match(await page.textContent('.warnbanner'), /1 筆交易使用離線匯率/);
  // 恢復網路：交易日匯率為 0.215
  await page.unroute(/currency-api/);
  await page.route(/currency-api/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ date: '2026-11-18', jpy: { twd: 0.215 } }) }));
  await page.click('[data-k=refreshRates]'); await page.waitForTimeout(400);
  e = (await state()).entries[0];
  assert.deepEqual([e.rate, e.amountTWD, e.rateSource], [0.215, 215, 'currencyAPI']);
  assert.match(await page.textContent('#toast'), /已補查 1 筆匯率/);
  assert.equal(await page.$('[data-k=refreshRates]'), null);
  assert.deepEqual(errors, []);
});

test('固定收支：建立後補記過去月份、從交易設定、暫停', async () => {
  const { page, errors, state } = await openApp();
  const u = ui(page);
  const reload = async () => { await page.reload(); await page.waitForFunction(() => window.__PL_APP__ && __PL_APP__.S.settings); await page.waitForTimeout(400); };
  // 房租：每月 5 日，從 9 月開始 → 立即補記 9、10、11 月
  await u.tab('settings'); await page.click('[data-k=recurring]');
  await page.click('#pages [data-k=right]');
  await page.fill('#r-name', '房租');
  await page.fill('#r-amount', '18000');
  await page.selectOption('#r-day', '5');
  await page.fill('#r-start', '2026-09'); await page.dispatchEvent('#r-start', 'change');
  await page.click('#pages [data-k=right]'); await page.waitForTimeout(400);
  let s = await state();
  assert.deepEqual(s.entries.map(e => e.date).sort(), ['2026-09-05', '2026-10-05', '2026-11-05']);
  assert.ok(s.entries.every(e => e.amount === 18000 && e.merchant === '房租' && e.recurringId));
  assert.match(await page.textContent('#toast'), /已自動記錄 3 筆固定收支/);
  assert.match(await page.textContent('#pages'), /下次 2026\/12\/05/);
  // 重新整理不會重複產生
  await reload();
  assert.equal((await state()).entries.length, 3);
  // 從交易建立：Netflix 刷卡，本月已記 → 從下月開始
  await page.goBack().catch(() => {});
  await u.addCard('國泰 CUBE');
  await u.add({ amount: 390, method: 'creditCard', merchant: 'Netflix', date: '2026-11-12' });
  await u.tab('home');
  await page.click('.erow:has-text("Netflix")'); await page.click('[data-k=mkrule]');
  assert.equal(await page.inputValue('#r-name'), 'Netflix');
  assert.equal(await page.inputValue('#r-amount'), '390');
  assert.equal(await page.inputValue('#r-day'), '12');
  await page.click('#pages [data-k=right]'); await page.waitForTimeout(300);
  s = await state();
  const rule = s.settings.recurring.find(r => r.name === 'Netflix');
  assert.deepEqual([rule.lastGenerated, rule.method, s.entries.length], ['2026-11', 'creditCard', 4]);
  // 下個月 12 日打開 App → 自動記 Netflix（含刷卡手續費）與房租
  await page.clock.setFixedTime(new Date('2026-12-15T10:00:00+08:00'));
  await reload();
  s = await state();
  const dec = s.entries.filter(e => e.date.startsWith('2026-12'));
  assert.deepEqual(dec.map(e => e.merchant).sort(), ['Netflix', '房租']);
  assert.equal(dec.find(e => e.merchant === 'Netflix').feeTWD, 12);
  // 暫停後不再產生
  await u.tab('settings'); await page.click('[data-k=recurring]');
  await page.click('[data-rule]:has-text("房租")');
  await page.uncheck('#r-active'); await page.click('#pages [data-k=right]'); await page.waitForTimeout(200);
  await page.clock.setFixedTime(new Date('2027-01-20T10:00:00+08:00'));
  await reload();
  s = await state();
  assert.deepEqual(s.entries.filter(e => e.date.startsWith('2027-01')).map(e => e.merchant), ['Netflix']);
  // 備份包含固定收支設定
  const b = await page.evaluate(() => __PL_APP__.buildBackup());
  assert.equal(b.settings.recurring.length, 2);
  assert.deepEqual(errors, []);
});

test('外觀：可在設定切換跟隨系統／淺色／深色，並記住選擇', async () => {
  const { page, errors } = await openApp();
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.emulateMedia({ colorScheme: 'light' });
  await ui(page).tab('settings');
  assert.ok(await page.$('[data-theme-opt=system].on'));
  const light = await bg();
  await page.click('[data-theme-opt=dark]');
  assert.equal(await theme(), 'dark');
  assert.notEqual(await bg(), light);
  // 重新開啟仍是深色
  await page.reload(); await page.waitForFunction(() => window.__PL_APP__ && __PL_APP__.S.settings);
  assert.equal(await theme(), 'dark');
  assert.ok(await page.$('[data-theme-opt=dark].on'));
  // 系統是深色時選「淺色」仍為淺色
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('[data-theme-opt=light]');
  assert.equal(await bg(), light);
  // 跟隨系統
  await page.click('[data-theme-opt=system]');
  assert.equal(await theme(), null);
  assert.notEqual(await bg(), light);
  assert.deepEqual(errors, []);
});

test('分類顏色、首頁待辦卡、報表點進去看交易', async () => {
  const { page, errors, state } = await openApp();
  const u = ui(page);
  await u.addCard('國泰 CUBE', 15, 20);
  await u.add({ amount: 300, category: '🍽️ 餐飲', merchant: '麥當勞' });
  await u.add({ amount: 120, category: '🍽️ 餐飲', merchant: '星巴克' });
  await u.add({ amount: 800, category: '🚆 交通', merchant: '高鐵', method: 'creditCard', date: '2026-11-02' });
  // 35. 交易列使用分類顏色
  await u.tab('home');
  assert.match(await page.$eval('.erow:has-text("高鐵") .eicon', el => el.getAttribute('style')), /#3b82c4/);
  // 改分類顏色
  await u.tab('settings'); await page.click('[data-k=categories]');
  await page.click('[data-edit]');   // 第一個：餐飲
  await page.click('.colorpick [data-c="#2f9e5b"]');
  await page.click('#pages [data-k=right]'); await page.waitForTimeout(150);
  assert.equal((await state()).categories.find(c => c.name === '餐飲').color, '#2f9e5b');
  await page.goBack(); await page.waitForTimeout(150);
  // 27. 待辦卡：卡費即將到期、該備份了、加入主畫面 → 一張卡三行
  await u.tab('home');
  assert.equal(await page.$$eval('.todo', t => t.length), 1);
  assert.equal(await page.$$eval('.todo-row', r => r.length), 3);
  assert.match(await page.textContent('.todo .sec-h'), /待辦 3/);
  await page.click('[data-k=hideInstall]');
  assert.equal(await page.$$eval('.todo-row', r => r.length), 2);
  // 37. 報表：圓餅圖使用分類色，點「餐飲」列出兩筆
  await u.tab('reports');
  assert.equal(await page.$eval('.donut circle[data-gkey]', c => c.getAttribute('stroke')), '#3b82c4');   // 交通 800 最大
  await page.click('.legend [data-gkey]:has-text("餐飲")');
  assert.match(await page.textContent('#pages .pbar h1'), /餐飲/);
  assert.match(await page.textContent('#pages .hero-card'), /NT\$420.*2 筆交易/s);
  assert.equal(await page.$$eval('#pages .erow', r => r.length), 2);
  await page.goBack(); await page.waitForTimeout(150);
  // 付款方式長條圖 → 信用卡（含 3% 手續費）
  await page.click('[data-k=dim] button[data-v=method]');
  await page.click('button.hbar:has-text("信用卡")');
  assert.match(await page.textContent('#pages .hero-card'), /NT\$824.*1 筆交易/s);
  assert.deepEqual(errors, []);
});
