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
  assert.equal(await page.inputValue('#f-amount'), '3227');
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
