/* 多幣記帳 網頁版：常數、工具、狀態、資料存取、收據照片、匯率、預算與提醒、外觀 */
/* 各檔案以一般 <script> 依序載入、共用同一個全域範圍（見 index.html 的載入順序）。 */
'use strict';

// ======================= 常數 =======================
const TYPES = {
  expense: { t: '支出', sign: '-' }, income: { t: '收入', sign: '+' },
  refund: { t: '退款', sign: '+' }, cardPayment: { t: '繳卡費', sign: '' }, exchange: { t: '換匯', sign: '+' }
};
const METHODS = { cash: '現金', creditCard: '信用卡', debitCard: '金融卡', ePayment: '電子支付', other: '其他' };
const METHOD_ICONS = { cash: '💵', creditCard: '💳', debitCard: '🏧', ePayment: '📱', other: '🔹' };
const RATE_SOURCES = { base: '新台幣（免換算）', bankOfTaiwan: '臺灣銀行牌告匯率', currencyAPI: 'Currency API（市場中間價）', manual: '手動輸入匯率',
  wallet: '外幣現金平均成本', exchange: '換匯成本', statement: '依信用卡帳單', cached: '最近一次查到的匯率（離線）' };
const FORM_TYPES = ['expense', 'income', 'refund', 'cardPayment'];
const DEFAULT_FAVORITES = ['TWD', 'USD', 'JPY', 'EUR', 'KRW', 'CNY', 'HKD', 'GBP', 'THB', 'SGD', 'AUD'];
const SUGGESTED_REGION = { TWD: 'TW', USD: 'US', JPY: 'JP', KRW: 'KR', CNY: 'CN', HKD: 'HK', MOP: 'MO', GBP: 'GB', THB: 'TH', SGD: 'SG', AUD: 'AU', NZD: 'NZ', CAD: 'CA', CHF: 'CH', VND: 'VN', MYR: 'MY', PHP: 'PH', IDR: 'ID', SEK: 'SE', ZAR: 'ZA', INR: 'IN' };
const COMMON_REGIONS = ['TW', 'JP', 'KR', 'US', 'CN', 'HK', 'MO', 'TH', 'SG', 'VN', 'MY', 'GB', 'FR', 'DE', 'IT', 'AU'];
const ALL_REGIONS = ('AD AE AF AG AI AL AM AO AR AS AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CU CV CW CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FO FR GA GB GD GE GF GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NG NI NL NO NP NR NZ OM PA PE PF PG PH PK PL PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WS XK YE ZA ZM ZW').split(' ');
/** iOS 版使用 SF Symbols，網頁版使用 emoji；備份檔互通時轉換 */
const ICON_MAP = {
  'fork.knife': '🍽️', 'tram.fill': '🚆', 'bed.double.fill': '🏨', 'bag.fill': '🛍️', 'gamecontroller.fill': '🎮',
  'ellipsis.circle.fill': '📦', 'banknote.fill': '💰', 'plus.circle.fill': '➕', 'cup.and.saucer.fill': '☕',
  'cart.fill': '🛒', 'car.fill': '🚗', 'airplane': '✈️', 'house.fill': '🏠', 'film.fill': '🎬', 'gift.fill': '🎁',
  'heart.fill': '❤️', 'cross.case.fill': '💊', 'book.fill': '📚', 'graduationcap.fill': '🎓', 'pawprint.fill': '🐾',
  'tshirt.fill': '👕', 'phone.fill': '📱', 'bolt.fill': '⚡', 'wifi': '📶', 'chart.line.uptrend.xyaxis': '📈',
  'briefcase.fill': '💼', 'tag.fill': '🏷️', 'star.fill': '⭐'
};
const ICON_REVERSE = Object.fromEntries(Object.entries(ICON_MAP).map(([k, v]) => [v, k]));
const ICONS = Object.values(ICON_MAP);
/** 線條圖示（24×24，使用目前文字顏色） */
const SVG_PATHS = {
  currency: '<path d="M7 7.5h12l-3.5-3.5"/><path d="M17 16.5H5l3.5 3.5"/>',
  categories: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
  cards: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
  fee: '<path d="M18.5 5.5l-13 13"/><circle cx="7.5" cy="7.5" r="2.3"/><circle cx="16.5" cy="16.5" r="2.3"/>',
  rates: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.4"/>',
  budget: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.8a2 2 0 0 0 4 0"/>',
  trips: '<rect x="4" y="7" width="16" height="12.5" rx="2.5"/><path d="M9 7V5.2c0-.7.5-1.2 1.2-1.2h3.6c.7 0 1.2.5 1.2 1.2V7M9 11v8.5M15 11v8.5"/>',
  wallets: '<rect x="3" y="6" width="18" height="12" rx="2.2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
  advances: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.6 14.4a4.6 4.6 0 0 1 5.4 4.6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  backup: '<path d="M12 3.5v10.5M7.5 9.5 12 14l4.5-4.5"/><path d="M4 15v3a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 18v-3"/>',
  install: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M10.5 18.3h3"/>',
  recurring: '<path d="M17 3l3.5 3.5L17 10"/><path d="M3.5 11.5V10A3.5 3.5 0 0 1 7 6.5h13.5"/><path d="M7 21l-3.5-3.5L7 14"/><path d="M20.5 12.5V14a3.5 3.5 0 0 1-3.5 3.5H3.5"/>',
  appearance: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>'
};
const SETTING_COLORS = {
  currency: '#2f9e5b', categories: '#e0892b', cards: '#3b82c4', fee: '#d1495b', rates: '#7d8a90', budget: '#e4572e',
  trips: '#6a5acd', wallets: '#23824a', advances: '#117a88', lock: '#5b6b73', backup: '#3b82c4', install: '#117a88', recurring: '#0e7490'
};
const svgIcon = (name, cls) => '<svg class="' + (cls || 'ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SVG_PATHS[name] + '</svg>';
/** 分類可選的顏色（淺色、深色模式都清楚） */
const CAT_COLORS = ['#e0892b', '#3b82c4', '#7c5cd6', '#d1495b', '#c2417f', '#2f9e5b', '#0e8a9a', '#b58a2b', '#6b7a83', '#e4572e'];
const DEFAULT_CAT_COLOR = { '餐飲': '#e0892b', '交通': '#3b82c4', '住宿': '#7c5cd6', '購物': '#d1495b', '娛樂': '#c2417f', '其他': '#6b7a83', '薪資': '#2f9e5b', '其他收入': '#0e8a9a' };
function catColor(c) {
  if (!c) return '#6b7a83';
  if (c.color) return c.color;
  if (DEFAULT_CAT_COLOR[c.name]) return DEFAULT_CAT_COLOR[c.name];
  let h = 0;
  for (const ch of c.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CAT_COLORS[h % CAT_COLORS.length];
}
/** 交易的代表色：分類色；繳卡費、換匯用固定色 */
const entryColor = e => e.type === 'cardPayment' ? '#3b82c4' : e.type === 'exchange' ? '#2f9e5b' : catColor(catById(e.categoryId));
const CHART_COLORS = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8'];

// ======================= 工具 =======================
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2)).toUpperCase();
const today = () => PL.todayKey();
let regionDN = null, currencyDN = null;
try { regionDN = new Intl.DisplayNames(['zh-Hant-TW'], { type: 'region' }); } catch (e) { /* 舊瀏覽器 */ }
try { currencyDN = new Intl.DisplayNames(['zh-Hant-TW'], { type: 'currency' }); } catch (e) { /* 舊瀏覽器 */ }
const regionName = c => { try { return regionDN ? regionDN.of(c) : c; } catch (e) { return c; } };
const currencyName = c => { try { return currencyDN ? currencyDN.of(c) : c; } catch (e) { return c; } };
const flag = c => String.fromCodePoint(...c.toUpperCase().split('').map(ch => 127397 + ch.charCodeAt(0)));
const regionLabel = c => flag(c) + ' ' + regionName(c);
const fmtDate = k => k ? k.replace(/-/g, '/') : '';
const weekday = k => '日一二三四五六'[PL.parseDay(k).getDay()];
const dayHeader = k => { const d = PL.parseDay(k); return (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + weekday(k); };
let ALL_CURRENCIES = [];
try { ALL_CURRENCIES = Intl.supportedValuesOf('currency'); } catch (e) { ALL_CURRENCIES = DEFAULT_FAVORITES.concat(['MOP', 'NZD', 'CAD', 'CHF', 'VND', 'MYR', 'PHP', 'IDR', 'SEK', 'INR']).sort(); }

/** 金額輸入：顯示千分位（1,234.5），內部保存純數字 */
function groupDigits(s) {
  s = String(s === null || s === undefined ? '' : s).replace(/,/g, '');
  if (!/^\d*\.?\d*$/.test(s)) return s;
  const parts = s.split('.');
  const i = parts[0].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? i + '.' + parts[1] : i;
}
function bindMoney(input, onRaw) {
  if (!input) return;
  input.addEventListener('input', () => {
    const pos = input.selectionStart === null ? input.value.length : input.selectionStart;
    const before = input.value.slice(0, pos).replace(/[^\d.]/g, '').length;
    let raw = input.value.replace(/[^\d.]/g, '');
    const dot = raw.indexOf('.');
    if (dot >= 0) raw = raw.slice(0, dot + 1) + raw.slice(dot + 1).replace(/\./g, '');
    const out = groupDigits(raw);
    if (out !== input.value) {
      input.value = out;
      let n = 0, k = 0;
      while (k < out.length && n < before) { if (/[\d.]/.test(out[k])) n++; k++; }
      try { input.setSelectionRange(k, k); } catch (e) { /* 部分輸入類型不支援 */ }
    }
    onRaw(raw);
  });
}
/** 畫面下方的提示；action 可加一顆按鈕（例如「復原」） */
function toast(msg, ms, action) {
  const t = $('#toast');
  t.replaceChildren();
  const text = document.createElement('span');
  text.textContent = msg;
  t.appendChild(text);
  t.classList.toggle('has-act', !!action);
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-act';
    b.textContent = action.label;
    b.onclick = () => { clearTimeout(toast._t); t.hidden = true; action.run(); };
    t.appendChild(b);
  }
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms || 2600);
}
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 忽略 */ } };

// ======================= 狀態 =======================
const S = {
  entries: [], categories: [], cards: [], budgets: [], alerts: [], settings: null,
  tab: 'home',
  list: { search: '', filter: emptyFilter(), view: 'calendar', month: today().slice(0, 7), day: today() },
  report: { mode: 'month', anchor: today(), start: PL.addMonths(today(), -1), end: today(), dim: 'category', filter: emptyFilter() },
  budgetOffset: 0
};
function emptyFilter() { return { types: [], currencies: [], countries: [], categories: [], methods: [], cards: [], trips: [], useDates: false, from: PL.addMonths(today(), -1), to: today() }; }
function filterCount(f) {
  return ['types', 'currencies', 'countries', 'categories', 'methods', 'cards', 'trips'].filter(k => (f[k] || []).length).length + (f.useDates ? 1 : 0);
}
function matchFilter(e, f) {
  if (f.types.length && !f.types.includes(e.type)) return false;
  if (f.currencies.length && !f.currencies.includes(e.currency)) return false;
  if (f.countries.length && !f.countries.includes(e.countryCode)) return false;
  if (f.categories.length && !f.categories.includes(e.categoryId)) return false;
  if (f.methods.length && !f.methods.includes(e.method)) return false;
  if (f.cards.length && !f.cards.includes(e.cardId)) return false;
  if (f.trips && f.trips.length && !f.trips.includes(e.trip || '')) return false;
  if (f.useDates && (e.date < f.from || e.date > f.to)) return false;
  return true;
}

const defaultSettings = () => ({
  key: 'main', defaultFeeRate: 0.03, feeOnDebitCard: false, feeOnlyForeign: false, activeTrip: '', tripBudgets: {}, recurring: [],
  favoriteCurrencies: DEFAULT_FAVORITES.slice(), defaultCurrency: 'TWD', defaultCountry: 'TW',
  budgetStartDay: 1, budgetAlertsEnabled: true, warningPercent: 80
});
const catById = id => S.categories.find(c => c.id === id);
const cardById = id => S.cards.find(c => c.id === id);
const catName = e => e.type === 'cardPayment' ? '信用卡繳款' : e.type === 'exchange' ? '外幣換匯' : (catById(e.categoryId) ? catById(e.categoryId).name : '未分類');
const catIcon = e => e.type === 'cardPayment' ? '💳' : e.type === 'exchange' ? '💱' : (catById(e.categoryId) ? catById(e.categoryId).icon : '❔');
const cardLabel = c => c.lastFour ? c.name + '（' + c.lastFour + '）' : c.name;
const entryTitle = e => e.type === 'exchange' ? '換匯：' + e.currency + ' 現金' : e.type === 'cardPayment' ? '信用卡繳款' + (cardById(e.cardId) ? '・' + cardById(e.cardId).name : '') : (e.merchant || catName(e));

// ======================= 資料存取 =======================
async function loadAll() {
  const [entries, categories, cards, budgets, alerts, settings] = await Promise.all([
    DB.getAll('entries'), DB.getAll('categories'), DB.getAll('cards'), DB.getAll('budgets'), DB.getAll('alerts'), DB.get('settings', 'main')
  ]);
  Object.assign(S, { entries, categories, cards, budgets, alerts });
  S.settings = Object.assign(defaultSettings(), settings || {});
  if (!settings) await DB.put('settings', S.settings);
  if (!categories.length) await seedCategories();
  sortData();
}
async function seedCategories() {
  const exp = [['餐飲', '🍽️'], ['交通', '🚆'], ['住宿', '🏨'], ['購物', '🛍️'], ['娛樂', '🎮'], ['其他', '📦']];
  const inc = [['薪資', '💰'], ['其他收入', '➕']];
  const cats = exp.map((c, i) => ({ id: uid(), name: c[0], icon: c[1], kind: 'expense', sortOrder: i, color: DEFAULT_CAT_COLOR[c[0]] }))
    .concat(inc.map((c, i) => ({ id: uid(), name: c[0], icon: c[1], kind: 'income', sortOrder: i, color: DEFAULT_CAT_COLOR[c[0]] })));
  await DB.putMany('categories', cats);
  S.categories = cats;
}
function sortData() {
  S.entries.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  S.categories.sort((a, b) => a.sortOrder - b.sortOrder);
  S.cards.sort((a, b) => a.sortOrder - b.sortOrder);
}
async function saveSettings() { await DB.put('settings', S.settings); }
async function upsert(store, list, obj) {
  const i = list.findIndex(x => x.id === obj.id);
  if (i >= 0) list[i] = obj; else list.push(obj);
  await DB.put(store, obj);
  sortData();
}
async function remove(store, list, id) {
  const i = list.findIndex(x => x.id === id);
  if (i >= 0) list.splice(i, 1);
  await DB.delete(store, id);
}
async function deleteEntry(e) {
  if (e.receipt) await DB.delete('receipts', e.receipt);
  await remove('entries', S.entries, e.id);
  await evaluateBudgets();
}
/** 刪除交易，6 秒內可按「復原」還原（含收據照片） */
const UNDO_MS = 6000;
async function deleteEntryWithUndo(e) {
  const copy = JSON.parse(JSON.stringify(e));
  const receipt = e.receipt ? await DB.get('receipts', e.receipt) : null;   // 照片保留在記憶體中
  await deleteEntry(e);
  return () => toast('已刪除「' + entryTitle(copy) + '」', UNDO_MS, {
    label: '復原',
    run: async () => {
      if (S.entries.some(x => x.id === copy.id)) return;
      if (receipt) await DB.put('receipts', receipt);
      await upsert('entries', S.entries, copy);
      await evaluateBudgets();
      if (stack.length) rerenderTop();
      refreshView();
      toast('已復原');
    }
  });
}
function requestPersist() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* 忽略 */ }
}

// ======================= 收據照片 =======================
async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const max = 2000, scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise(res => canvas.toBlob(b => res(b || file), 'image/jpeg', 0.75));
  } finally { URL.revokeObjectURL(url); }
}
const objectURLs = [];
function blobURL(blob) { const u = URL.createObjectURL(blob); objectURLs.push(u); return u; }
function revokeURLs() { while (objectURLs.length) URL.revokeObjectURL(objectURLs.pop()); }
async function receiptURL(name) { const r = await DB.get('receipts', name); return r && r.blob ? blobURL(r.blob) : null; }

// ======================= 匯率 =======================
const rateCache = lsGet('pl.rateCache', {});
async function fetchJSON(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) return { ok: false, network: false };
    return { ok: true, json: await r.json() };
  } catch (e) { return { ok: false, network: true }; } finally { clearTimeout(t); }
}
/** 依交易日查匯率：Currency API（jsDelivr → pages.dev 備援）；當天或昨天查不到時改用最新一筆 */
/** 最近一次查到的各幣別匯率（離線時使用） */
const lastRates = lsGet('pl.lastRates', {});
function remember(code, rate, date) { PL.rememberRate(lastRates, code, rate, date); lsSet('pl.lastRates', lastRates); }
const offlineError = msg => Object.assign(new Error(msg), { offline: true });
/** 依交易日查匯率；離線時改用最近一次查到的匯率（標示為離線匯率） */
async function lookupRate(code, dateKey) {
  try {
    return await fetchRateOnline(code, dateKey);
  } catch (err) {
    const last = lastRates[code];
    if (err.offline && last) {
      return { rate: last.rate, rateDate: last.date, source: 'cached', detail: '離線，採 ' + fmtDate(last.date) + ' 的匯率（最近一次查到）；有網路時可補查交易日匯率' };
    }
    throw err;
  }
}
/** 有網路時，預先下載常用外幣的最新匯率（每天一次） */
let prefetching = false;
async function prefetchRates() {
  if (prefetching || navigator.onLine === false || lsGet('pl.prefetchDay', '') === today()) return;
  prefetching = true;
  let ok = 0;
  try {
    for (const code of S.settings.favoriteCurrencies.filter(c => c !== 'TWD')) {
      const base = code.toLowerCase();
      for (const url of ['https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/' + base + '.json',
        'https://latest.currency-api.pages.dev/v1/currencies/' + base + '.json']) {
        const r = await fetchJSON(url);
        const pr = r.ok && PL.parseCurrencyAPI(r.json, code);
        if (pr) { remember(code, pr.rate, pr.date); ok++; break; }
      }
    }
    if (ok) lsSet('pl.prefetchDay', today());
  } finally { prefetching = false; }
}
/** 使用離線匯率、尚未對帳的交易 */
const cachedRateEntries = () => S.entries.filter(e => e.rateSource === 'cached' && !e.reconciled);
/** 補查離線匯率：改用交易日的實際匯率並重算新台幣、手續費、代墊 */
async function refreshCachedRates() {
  let done = 0, failed = 0;
  for (const e of cachedRateEntries()) {
    try {
      const q = await fetchRateOnline(e.currency, e.date);
      Object.assign(e, { rate: q.rate, rateSource: q.source, rateDate: q.rateDate, rateDetail: q.detail, amountTWD: PL.convert(e.amount, q.rate), updatedAt: new Date().toISOString() });
      if (e.includesFee && !e.isFeeManual) e.feeTWD = PL.fee(e.amountTWD, e.feeRate);
      if (e.advAmount) Object.assign(e, PL.advanceSplit(e.amount, e.amountTWD, e.feeTWD, e.advAmount));
      await upsert('entries', S.entries, e);
      done++;
    } catch (err) { failed++; }
  }
  await evaluateBudgets();
  refreshView();
  toast(done ? '已補查 ' + done + ' 筆匯率' + (failed ? '，' + failed + ' 筆仍查不到' : '') : '目前仍無法取得匯率，請稍後再試');
}
async function fetchRateOnline(code, dateKey) {
  const target = dateKey > today() ? today() : dateKey;
  const ck = code + '|' + target;
  if (rateCache[ck]) return rateCache[ck];
  if (target < '2024-03-02') throw new Error('資料來源只有 2024 年 3 月之後的匯率，請手動輸入匯率。');
  if (navigator.onLine === false) throw offlineError('目前無法連線，請手動輸入匯率。');
  const base = code.toLowerCase();
  const dates = [target];
  if (target >= PL.addDays(today(), -1)) dates.push('latest');
  let networkFail = 0, attempts = 0;
  for (const d of dates) {
    for (const url of [
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@' + d + '/v1/currencies/' + base + '.json',
      'https://' + d + '.currency-api.pages.dev/v1/currencies/' + base + '.json'
    ]) {
      attempts++;
      const r = await fetchJSON(url);
      if (r.network) networkFail++;
      if (!r.ok) continue;
      const p = PL.parseCurrencyAPI(r.json, code);
      if (p) {
        const q = { rate: p.rate, rateDate: p.date, source: 'currencyAPI', detail: 'Currency API 市場中間價' + (p.date !== target ? '（採 ' + fmtDate(p.date) + ' 匯率）' : '') };
        if (d !== 'latest') { rateCache[ck] = q; lsSet('pl.rateCache', rateCache); }
        remember(code, q.rate, q.rateDate);
        return q;
      }
    }
  }
  throw networkFail === attempts ? offlineError('目前無法連線，請手動輸入匯率。') : new Error('查無該日匯率，請手動輸入匯率。');
}

// ======================= 預算與提醒 =======================
function budgetDefs() {
  const defs = [];
  const total = S.budgets.find(b => b.isTotal);
  if (total && total.amount > 0) defs.push({ key: 'total', name: '每月總預算', icon: '🎯', amount: total.amount, categoryId: null });
  S.categories.forEach(c => {
    const b = S.budgets.find(x => !x.isTotal && x.categoryId === c.id);
    if (b && b.amount > 0) defs.push({ key: c.id, name: c.name, icon: c.icon, amount: b.amount, categoryId: c.id });
  });
  return defs;
}
function currentPeriod() { return PL.budgetPeriod(today(), S.settings.budgetStartDay); }
async function notify(title, body, tag) {
  try {
    if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) { await reg.showNotification(title, { body: body, tag: tag, icon: 'icons/icon-192.png' }); return; }
      new Notification(title, { body: body, tag: tag }); return;
    }
  } catch (e) { /* 改用畫面提示 */ }
  toast(title + '｜' + body, 5000);
}
async function evaluateBudgets() {
  try { await checkCardDue(); } catch (e) { /* 忽略 */ }
  try { await checkTripBudgets(); } catch (e) { /* 忽略 */ }
  const period = currentPeriod();
  const stale = S.alerts.filter(a => a.periodKey !== period.key);
  for (const a of stale) await DB.delete('alerts', a.id);
  S.alerts = S.alerts.filter(a => a.periodKey === period.key);
  if (!S.settings.budgetAlertsEnabled) return;
  const thresholds = PL.alertThresholds(S.settings.warningPercent);
  for (const u of PL.usages(budgetDefs(), S.entries, period)) {
    const sent = new Set(S.alerts.filter(a => a.budgetKey === u.key).map(a => a.threshold));
    const pending = PL.pendingAlerts(u, thresholds, sent);
    if (!pending.length) continue;
    for (const t of pending) {
      const rec = { id: period.key + '|' + u.key + '|' + t, periodKey: period.key, budgetKey: u.key, threshold: t, sentAt: new Date().toISOString() };
      S.alerts.push(rec); await DB.put('alerts', rec);
    }
    const top = pending[pending.length - 1];
    const txt = PL.notificationText(u, top);
    await notify(txt.title, txt.body, 'budget-' + period.key + '-' + u.key + '-' + top);
  }
}
/** 信用卡繳款提醒：截止前 3 天內或逾期、且仍有應繳金額 */
function cardDueList() {
  return S.cards.filter(c => c.kind === 'credit' && c.closingDay && c.dueDay).map(c => {
    const s = PL.cardStatement(S.entries.filter(e => e.cardId === c.id), c.closingDay, c.dueDay, today());
    return { card: c, st: s.last };
  }).filter(x => x.st.status === 'dueSoon' || x.st.status === 'overdue');
}
function cardStatusChip(c) {
  if (c.kind !== 'credit' || !c.closingDay || !c.dueDay) return '';
  const s = PL.cardStatement(S.entries.filter(e => e.cardId === c.id), c.closingDay, c.dueDay, today()).last;
  if (s.status === 'overdue') return '<br><span class="chip" style="color:var(--bad)">⚠️ 逾期未繳 ' + PL.fmtTWD(s.remaining) + '</span>';
  if (s.status === 'dueSoon') return '<br><span class="chip">⏰ ' + fmtDate(s.due).slice(5) + ' 前應繳 ' + PL.fmtTWD(s.remaining) + '</span>';
  return '';
}
async function checkCardDue() {
  const sent = lsGet('pl.cardAlerts', {});
  for (const { card, st } of cardDueList()) {
    const key = card.id + '|' + st.close + '|' + st.status;
    if (sent[key]) continue;
    sent[key] = today();
    const title = st.status === 'overdue' ? '信用卡已逾期：' + card.name : '信用卡繳款提醒：' + card.name;
    const body = (st.status === 'overdue' ? '繳款截止日 ' + fmtDate(st.due) + ' 已過，' : fmtDate(st.due) + ' 前（還有 ' + st.daysLeft + ' 天）') + '應繳 ' + PL.fmtTWD(st.remaining);
    await notify(title, body, 'card-' + key);
  }
  // 只保留近 120 天的紀錄
  const cutoff = PL.addDays(today(), -120);
  Object.keys(sent).forEach(k => { if (sent[k] < cutoff) delete sent[k]; });
  lsSet('pl.cardAlerts', sent);
}

/** 預算或門檻變更後：清除新設定下已不再達到的提醒紀錄，再重新評估 */
async function budgetsChanged() {
  const period = currentPeriod();
  const us = PL.usages(budgetDefs(), S.entries, period);
  for (const a of S.alerts.slice()) {
    if (a.periodKey !== period.key) continue;
    const u = us.find(x => x.key === a.budgetKey);
    if (!u || !PL.isReached(u, a.threshold)) {
      S.alerts.splice(S.alerts.indexOf(a), 1); await DB.delete('alerts', a.id);
    }
  }
  await evaluateBudgets();
}

// ======================= 外觀（淺色／深色） =======================
const currentTheme = () => { const t = lsGet('pl.theme', 'system'); return t === 'light' || t === 'dark' ? t : 'system'; };
/** system：跟隨 iPhone 設定；light／dark：固定 */
function applyTheme(t) {
  lsSet('pl.theme', t);
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  syncThemeColor();
}
/** 讓 iPhone 狀態列顏色跟著背景色 */
function syncThemeColor() {
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.setAttribute('content', getComputedStyle(document.body).backgroundColor || '#117a88');
}
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor); } catch (e) { /* 舊版瀏覽器 */ }
