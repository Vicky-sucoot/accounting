/* 多幣記帳 網頁版（PWA）主程式 */
(function () {
  'use strict';
  const PL = globalThis.PL, DB = globalThis.DB;

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
    recurring: '<path d="M17 3l3.5 3.5L17 10"/><path d="M3.5 11.5V10A3.5 3.5 0 0 1 7 6.5h13.5"/><path d="M7 21l-3.5-3.5L7 14"/><path d="M20.5 12.5V14a3.5 3.5 0 0 1-3.5 3.5H3.5"/>'
  };
  const SETTING_COLORS = {
    currency: '#2f9e5b', categories: '#e0892b', cards: '#3b82c4', fee: '#d1495b', rates: '#7d8a90', budget: '#e4572e',
    trips: '#6a5acd', wallets: '#23824a', advances: '#117a88', lock: '#5b6b73', backup: '#3b82c4', install: '#117a88', recurring: '#0e7490'
  };
  const svgIcon = (name, cls) => '<svg class="' + (cls || 'ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SVG_PATHS[name] + '</svg>';
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
    const cats = exp.map((c, i) => ({ id: uid(), name: c[0], icon: c[1], kind: 'expense', sortOrder: i }))
      .concat(inc.map((c, i) => ({ id: uid(), name: c[0], icon: c[1], kind: 'income', sortOrder: i })));
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

  // ======================= 頁面堆疊 =======================
  const stack = [];
  // 瀏覽器「上一頁」與 iPhone 返回手勢：子頁面開啟時保留一筆歷史紀錄，按返回時關閉最上層頁面
  let historyGuard = false;
  function pushPage(p) {
    stack.push(p);
    if (!historyGuard) { try { history.pushState({ plPage: true }, ''); historyGuard = true; } catch (e) { /* 忽略 */ } }
    renderPages(true); $('#pages').scrollTop = 0;
  }
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** 關閉頁面時：複製目前畫面，讓它向右滑出（實際的頁面狀態立即更新） */
  function ghostOut() {
    const cur = $('#pages .page');
    if (!cur || reduceMotion()) return;
    const g = document.createElement('div');
    g.className = 'ghost';
    const clone = cur.cloneNode(true);
    clone.classList.remove('enter');
    clone.style.marginTop = (-$('#pages').scrollTop) + 'px';
    g.appendChild(clone);
    document.body.appendChild(g);
    const from = cur.style.transform || 'translateX(0)';
    clone.style.transform = from;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clone.style.transition = 'transform .26s cubic-bezier(.3,.7,.3,1)';
      clone.style.transform = 'translateX(105%)';
    }));
    setTimeout(() => g.remove(), 320);
  }
  window.addEventListener('popstate', () => {
    historyGuard = false;
    if (!stack.length) return;
    popPage();
    if (stack.length) { try { history.pushState({ plPage: true }, ''); historyGuard = true; } catch (e) { /* 忽略 */ } }
  });
  function popPage() { ghostOut(); const p = stack.pop(); if (p && p.onClose) p.onClose(); renderPages(); refreshView(); }
  function popPages(n) { ghostOut(); for (let i = 0; i < n && stack.length; i++) { const p = stack.pop(); if (p.onClose) p.onClose(); } renderPages(); refreshView(); }
  /** 主畫面 App 沒有瀏覽器返回手勢：從螢幕左緣向右滑關閉子頁面 */
  (function edgeSwipe() {
    let sx = 0, sy = 0, active = false, moved = 0;
    const host = () => $('#pages .page');
    document.addEventListener('touchstart', ev => {
      const t = ev.touches[0];
      active = !!stack.length && isStandalone() && t.clientX < 28;
      sx = t.clientX; sy = t.clientY; moved = 0;
    }, { passive: true });
    document.addEventListener('touchmove', ev => {
      if (!active) return;
      const t = ev.touches[0], dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
      if (dy > 60 && dx < 40) { active = false; const h = host(); if (h) h.style.transform = ''; return; }
      moved = Math.max(0, dx);
      const h = host(); if (h) { h.style.transition = 'none'; h.style.transform = 'translateX(' + moved + 'px)'; }
    }, { passive: true });
    document.addEventListener('touchend', () => {
      if (!active) return;
      active = false;
      const h = host();
      if (moved > 90) { popPage(); return; }
      if (h) { h.style.transition = 'transform .2s'; h.style.transform = ''; }
    });
  })();
  function closeAllPages() { if (stack.length) ghostOut(); while (stack.length) { const p = stack.pop(); if (p.onClose) p.onClose(); } renderPages(); refreshView(); }
  function renderPages(entering) {
    const host = $('#pages');
    if (!stack.length) { host.hidden = true; host.replaceChildren(); document.body.style.overflow = ''; return; }
    const p = stack[stack.length - 1];
    const el = document.createElement('div');
    el.className = 'page' + (entering === true && !reduceMotion() ? ' enter' : '') + (p.footer ? ' has-foot' : '');
    el.innerHTML = '<header class="pbar"><button class="l" data-k="back">' + esc(p.leftLabel || (stack.length > 1 ? '‹ 返回' : '關閉')) + '</button>' +
      '<h1>' + esc(p.title) + '</h1>' +
      (p.right ? '<button class="r" data-k="right">' + esc(p.right.label) + '</button>' : '<span></span>') + '</header><div class="pbody"></div>';
    $('[data-k=back]', el).onclick = () => popPage();
    if (p.right) $('[data-k=right]', el).onclick = () => p.right.action();
    // 25. 固定在下方的主要按鈕（單手好按）
    if (p.footer && p.right) {
      el.insertAdjacentHTML('beforeend', '<div class="pfoot"><button class="btn primary block" data-k="footsave">' + esc(p.right.label) + '</button></div>');
      $('[data-k=footsave]', el).onclick = () => p.right.action();
    }
    host.replaceChildren(el);
    host.hidden = false;
    document.body.style.overflow = 'hidden';
    p.render($('.pbody', el), p, el);
  }
  function rerenderTop() { if (stack.length) renderPages(); }
  function setRightEnabled(enabled) { $$('#pages [data-k=right], #pages [data-k=footsave]').forEach(b => { b.disabled = !enabled; }); }

  // ======================= 共用片段 =======================
  function entryRowHTML(e) {
    const t = TYPES[e.type];
    const foreign = e.currency !== 'TWD';
    let sub = [];
    if (e.type !== 'cardPayment') { sub.push(flag(e.countryCode)); sub.push(cardById(e.cardId) ? cardById(e.cardId).name : METHODS[e.method]); }
    if (e.type === 'refund') sub.push('退款');
    if (e.trip) sub.push('🧳 ' + e.trip);
    if (foreign && e.rateSource === 'manual') sub.push('手動匯率');
    if (e.rateSource === 'wallet') sub.push('現金成本');
    if (e.rateSource === 'cached') sub.push('離線匯率');
    if (e.recurringId) sub.push('🔁 固定');
    if (e.reconciled) sub.push('✓已對帳');
    if (e.advAmount) sub.push('代墊' + (e.advWho ? '・' + e.advWho : '') + (e.advSettled ? '（已收回）' : ''));
    let second = foreign ? (e.type === 'exchange' ? '付 ' : '≈ ') + PL.fmtTWD(e.amountTWD) : '';
    if (e.feeTWD) second += (second ? ' ' : '') + '＋費 ' + PL.fmtTWD(e.feeTWD);
    const cls = e.type === 'income' || e.type === 'refund' ? 'pos' : (e.type === 'cardPayment' || e.type === 'exchange' ? 'muted' : '');
    return '<div class="swipe"><button class="swdel" data-del="' + esc(e.id) + '" tabindex="-1">刪除</button><button class="erow" data-entry="' + esc(e.id) + '">' +
      '<span class="eicon">' + esc(catIcon(e)) + '</span>' +
      '<span class="emain"><div class="etitle">' + esc(entryTitle(e)) + (e.receipt ? ' 📎' : '') + '</div><div class="esub">' + esc(sub.join(' · ')) + '</div></span>' +
      '<span class="eamt"><div class="a ' + cls + '">' + esc(t.sign + PL.fmtMoney(e.amount, e.currency)) + '</div>' +
      (second ? '<div class="b">' + esc(second) + '</div>' : '') + '</span></button></div>';
  }
  /** 交易列：點選開啟明細；向左滑出現「刪除」 */
  const SWIPE_W = 84;
  let openSwipe = null;
  function hideDel(row) { setTimeout(() => { if (openSwipe !== row && row.parentNode) row.parentNode.classList.remove('sw-on'); }, 230); }
  function closeSwipe() { if (openSwipe) { const r = openSwipe; r.style.transform = ''; openSwipe = null; hideDel(r); } }
  function bindEntryRows(el) {
    $$('.swipe', el).forEach(sw => {
      const row = $('.erow', sw), del = $('.swdel', sw);
      let sx = 0, sy = 0, base = 0, dx = 0, mode = null;
      row.onclick = ev => {
        if (mode === 'swipe') { ev.preventDefault(); return; }
        if (openSwipe) { const was = openSwipe; closeSwipe(); if (was === row) return; }
        openDetail(row.dataset.entry);
      };
      sw.addEventListener('touchstart', ev => {
        const t = ev.touches[0];
        sx = t.clientX; sy = t.clientY; dx = 0; mode = null;
        base = openSwipe === row ? -SWIPE_W : 0;
        if (openSwipe && openSwipe !== row) closeSwipe();
      }, { passive: true });
      sw.addEventListener('touchmove', ev => {
        const t = ev.touches[0], mx = t.clientX - sx, my = t.clientY - sy;
        if (!mode) { if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) mode = 'swipe'; else if (Math.abs(my) > 8) mode = 'scroll'; }
        if (mode !== 'swipe') return;
        dx = Math.min(0, Math.max(-SWIPE_W - 30, base + mx));
        sw.classList.add('sw-on');
        row.style.transition = 'none';
        row.style.transform = 'translateX(' + dx + 'px)';
      }, { passive: true });
      sw.addEventListener('touchend', () => {
        if (mode !== 'swipe') return;
        row.style.transition = '';
        if (dx < -SWIPE_W / 2) { row.style.transform = 'translateX(' + (-SWIPE_W) + 'px)'; openSwipe = row; }
        else { row.style.transform = ''; if (openSwipe === row) openSwipe = null; hideDel(row); }
        setTimeout(() => { mode = null; }, 50);
      });
      del.onclick = async () => {
        const e = S.entries.find(x => x.id === del.dataset.del);
        openSwipe = null;
        if (!e) return;
        sw.classList.add('removing');
        const showUndo = await deleteEntryWithUndo(e);
        setTimeout(() => { if (stack.length) rerenderTop(); refreshView(); showUndo(); }, 180);
      };
    });
  }
  function budgetHTML(u) {
    const w = S.settings.warningPercent;
    const cls = u.percent >= 100 ? 'bad' : (u.percent >= w ? 'warn' : '');
    return '<div class="budget"><div class="top"><span>' + esc(u.icon + ' ' + u.name) + '</span><span class="num ' + (cls === 'bad' ? 'danger' : '') + '">' + u.percent + '%</span></div>' +
      '<div class="bar ' + cls + '"><i style="width:' + Math.min(100, u.ratio * 100).toFixed(1) + '%"></i></div>' +
      '<div class="bot"><span>已用 ' + PL.fmtTWD(u.spent) + '</span>' +
      (u.remaining >= 0 ? '<span>剩餘 ' + PL.fmtTWD(u.remaining) + '</span>' : '<span class="danger">超支 ' + PL.fmtTWD(-u.remaining) + '</span>') + '</div>' +
      '<div class="bot"><span>預算 ' + PL.fmtTWD(u.budget) + '</span></div></div>';
  }
  function currencyHTML(list) {
    if (!list.length) return '<div class="row muted">尚無資料</div>';
    return list.map(c => '<div class="row"><span class="k"><b>' + esc(c.currency) + '</b> <span class="muted small">' + esc(currencyName(c.currency)) + '</span></span><span class="v num">' +
      ((c.expense || c.refund) ? '支出 ' + esc(PL.fmtMoney(c.net, c.currency)) : '') +
      (c.income ? '<br><span class="pos">收入 ' + esc(PL.fmtMoney(c.income, c.currency)) + '</span>' : '') + '</span></div>').join('');
  }
  function switchHTML(id, checked, label) {
    return '<label class="row" for="' + id + '"><span class="k">' + esc(label) + '</span><span class="switch"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '><span></span></span></label>';
  }
  function optionList(items, selected) {
    return items.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
  }
  function regionOptions(selected) {
    const all = ALL_REGIONS.slice().sort((a, b) => regionName(a).localeCompare(regionName(b), 'zh-Hant'));
    return '<optgroup label="常用">' + optionList(COMMON_REGIONS.map(c => [c, regionLabel(c)]), selected) + '</optgroup>' +
      '<optgroup label="全部">' + optionList(all.map(c => [c, regionLabel(c)]), COMMON_REGIONS.includes(selected) ? null : selected) + '</optgroup>';
  }
  function currencyOptions(selected) {
    const fav = S.settings.favoriteCurrencies;
    return '<optgroup label="常用幣別">' + optionList(fav.map(c => [c, c + ' ' + currencyName(c)]), selected) + '</optgroup>' +
      '<optgroup label="所有幣別">' + optionList(ALL_CURRENCIES.map(c => [c, c + ' ' + currencyName(c)]), fav.includes(selected) ? null : selected) + '</optgroup>';
  }
  function isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }

  // ======================= 分頁：總覽 =======================
  function renderHome(v) {
    const period = currentPeriod();
    const pe = S.entries.filter(e => PL.inRange(e.date, period.start, period.end));
    const s = PL.summarize(pe);
    const total = PL.usages(budgetDefs().filter(d => d.key === 'total'), pe, period)[0];
    const showInstall = !isStandalone() && !lsGet('pl.hideInstall', false);
    const remind = backupReminder();
    const dueCards = cardDueList();
    const cachedN = cachedRateEntries().length;
    v.innerHTML =
      '<h1 class="large">收支總覽</h1>' +
      (cachedN ? '<div class="banner warnbanner"><span>💱</span><span><b>' + cachedN + ' 筆交易使用離線匯率</b><br>有網路時補查交易日的實際匯率，新台幣金額與手續費會一併更新。' +
        '<span class="btnrow" style="padding:8px 0 0"><button class="btn primary" data-k="refreshRates">補查匯率</button></span></span></div>' : '') +
      dueCards.map(x => '<button class="banner warnbanner" style="width:100%;border:0;text-align:left" data-duecard="' + esc(x.card.id) + '"><span>💳</span><span><b>' +
        esc(x.card.name) + (x.st.status === 'overdue' ? ' 已逾期' : ' 即將到期') + '</b><br>' +
        (x.st.status === 'overdue' ? '截止日 ' + fmtDate(x.st.due) + ' 已過，' : fmtDate(x.st.due) + ' 前（還有 ' + x.st.daysLeft + ' 天）') + '應繳 ' + PL.fmtTWD(x.st.remaining) + '</span></button>').join('') +
      (remind ? '<div class="banner warnbanner"><span>💾</span><span><b>該備份了</b><br>' + esc(remind) +
        '<span class="btnrow" style="padding:8px 0 0"><button class="btn primary" data-k="doBackup">立即備份</button><button class="btn" data-k="snooze">3 天後提醒</button></span></span></div>' : '') +
      (showInstall ? '<div class="banner"><span>📲</span><span>在 Safari 點「分享」→「加入主畫面」，就能像 App 一樣開啟並離線使用。</span><button data-k="hideInstall" aria-label="關閉">×</button></div>' : '') +
      '<div class="hero-card"><div class="lbl">本期 ' + esc(period.title) + '・支出（含手續費）</div><div class="big">' + PL.fmtTWD(s.expense) + '</div>' +
      '<div class="tiles"><div class="tile"><div class="k">收入</div><div class="v pos">' + PL.fmtTWD(s.income) + '</div></div>' +
      '<div class="tile"><div class="k">手續費</div><div class="v" style="color:var(--warn)">' + PL.fmtTWD(s.fee) + '</div></div>' +
      '<div class="tile"><div class="k">結餘</div><div class="v ' + (s.balance < 0 ? 'danger' : '') + '">' + PL.fmtTWD(s.balance) + '</div></div></div></div>' +
      (S.settings.activeTrip && (S.settings.tripBudgets || {})[S.settings.activeTrip] ? '<div class="sec"><div class="group"><button class="row" style="display:block;padding:0" data-k="toTrip">' +
        budgetHTML(Object.assign(tripUsage(S.settings.activeTrip), { name: S.settings.activeTrip + ' 旅程預算' })) + '</button></div></div>' : '') +
      '<div class="sec"><div class="group">' + (total ? '<button class="row" style="display:block;padding:0" data-k="toBudget">' + budgetHTML(total) + '</button>' :
        '<button class="row link" data-k="toBudget"><span class="k">🎯 設定每月預算，掌握支出進度</span></button>') + '</div></div>' +
      '<div class="sec"><div class="sec-h"><span>各幣別原始金額</span></div><div class="group">' + currencyHTML(s.byCurrency) + '</div>' +
      '<div class="sec-f">不同幣別不直接相加，合計請看上方新台幣金額。</div></div>' +
      weekChartHTML() +
      '<div class="sec"><div class="sec-h"><span>最近交易</span><button class="iconbtn" style="height:auto;min-width:0;padding:0;background:none" data-k="toList">查看全部</button></div>' +
      '<div class="group">' + (S.entries.length ? S.entries.slice(0, 6).map(entryRowHTML).join('') : '<div class="empty"><b>尚無交易</b>點右下角 ＋ 開始記帳</div>') + '</div></div>' +
      '<button class="fab" data-k="add" aria-label="新增交易">＋</button>';
    bindEntryRows(v);
    $$('[data-k=toBudget]', v).forEach(b => { b.onclick = () => switchTab('budget'); });
    $('[data-k=toList]', v).onclick = () => switchTab('list');
    $('[data-k=add]', v).onclick = () => openForm(null);
    const rr = $('[data-k=refreshRates]', v);
    if (rr) rr.onclick = async () => { rr.disabled = true; rr.textContent = '查詢中…'; await refreshCachedRates(); };
    $$('[data-duecard]', v).forEach(b => { b.onclick = () => openCardDetail(b.dataset.duecard); });
    $$('[data-wday]', v).forEach(b => {
      b.onclick = () => { S.list.month = b.dataset.wday.slice(0, 7); S.list.day = b.dataset.wday; lsSet('pl.listView', 'calendar'); switchTab('list'); };
    });
    const tt = $('[data-k=toTrip]', v); if (tt) tt.onclick = () => openTripDetail(S.settings.activeTrip);
    const db = $('[data-k=doBackup]', v);
    if (db) db.onclick = async () => { if (await exportBackup()) refreshView(); };
    const sz = $('[data-k=snooze]', v);
    if (sz) sz.onclick = () => { lsSet('pl.snoozeBackup', PL.addDays(today(), 3)); refreshView(); };
    const hi = $('[data-k=hideInstall]', v);
    if (hi) hi.onclick = () => { lsSet('pl.hideInstall', true); refreshView(); };
  }

  /** 首頁：近 7 天每日支出小長條圖，點一天跳到紀錄月曆 */
  function weekChartHTML() {
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(PL.addDays(today(), -i));
    const totals = PL.dailyTotals(S.entries.filter(e => e.date >= days[0] && e.date <= days[6]));
    const vals = days.map(d => totals[d] ? Math.max(totals[d].expense, 0) : 0);
    const sum = PL.round(vals.reduce((a, b) => a + b, 0), 2);
    const prevStart = PL.addDays(days[0], -7), prevEnd = PL.addDays(days[0], -1);
    const prev = PL.round(S.entries.filter(e => e.date >= prevStart && e.date <= prevEnd).reduce((a, e) => a + PL.netExpense(e), 0), 2);
    const max = Math.max(...vals, 1);
    const cmp = prev > 0 ? (sum >= prev ? '比前 7 天多 ' : '比前 7 天少 ') + Math.round(Math.abs(sum - prev) / prev * 100) + '%' : '';
    return '<div class="sec"><div class="sec-h"><span>近 7 天支出</span><span>' + esc(cmp) + '</span></div><div class="group week">' +
      '<div class="week-sum">' + PL.fmtTWD(sum) + '</div><div class="week-bars">' +
      days.map((d, i) => '<button class="wbar' + (i === 6 ? ' today' : '') + '" data-wday="' + d + '" aria-label="' + esc(dayHeader(d) + ' 支出 ' + PL.fmtTWD(vals[i])) + '">' +
        '<span class="wv">' + (vals[i] ? esc(shortTWD(vals[i])) : '') + '</span>' +
        '<span class="wtrack"><i style="height:' + (vals[i] ? Math.max(6, vals[i] / max * 100) : 0).toFixed(0) + '%"></i></span>' +
        '<span class="wd">' + (i === 6 ? '今天' : weekday(d)) + '</span></button>').join('') + '</div></div></div>';
  }

  // ======================= 分頁：紀錄 =======================
  function renderList(v) {
    const f = S.list.filter, q = S.list.search.trim().toLowerCase();
    const L = S.list;
    L.view = lsGet('pl.listView', L.view);
    const cal = L.view === 'calendar';
    v.innerHTML = '<div class="toprow"><h1 class="large">交易紀錄</h1><div class="tools">' +
      '<button class="iconbtn ' + (filterCount(f) ? 'active' : '') + '" data-k="filter">篩選' + (filterCount(f) ? ' ' + filterCount(f) : '') + '</button>' +
      '<button class="iconbtn" data-k="add" aria-label="新增交易">＋</button></div></div>' +
      '<div class="seg" data-k="view"><button data-v="calendar" class="' + (cal ? 'on' : '') + '">月曆</button><button data-v="list" class="' + (cal ? '' : 'on') + '">清單</button></div>' +
      '<input class="search" type="search" id="list-search" placeholder="搜尋商家、備註、分類、卡片" value="' + esc(S.list.search) + '">' +
      '<div id="list-body"></div>';
    $('[data-k=filter]', v).onclick = () => openFilter('篩選紀錄', S.list.filter, true, nf => { S.list.filter = nf; });
    // 月曆模式：新增的交易預設為選取的日期
    $('[data-k=add]', v).onclick = () => openForm(null, cal && L.day ? { date: L.day } : {});
    $$('[data-k=view] button', v).forEach(b => { b.onclick = () => { lsSet('pl.listView', b.dataset.v); L.view = b.dataset.v; refreshView(); }; });
    $('#list-search', v).oninput = ev => { S.list.search = ev.target.value; drawBody(); };
    function drawBody() {
      const qq = S.list.search.trim().toLowerCase();
      const items = S.entries.filter(e => matchFilter(e, f) && (!qq ||
        [e.merchant, e.note, catName(e), cardById(e.cardId) ? cardById(e.cardId).name : ''].some(x => (x || '').toLowerCase().includes(qq))));
      const body = $('#list-body', v);
      if (cal) { drawCalendar(body, items, filterCount(f) > 0 || !!qq); return; }
      if (!items.length) {
        body.innerHTML = '<div class="empty"><b>' + (S.entries.length ? '沒有符合條件的交易' : '尚無交易') + '</b>' + (S.entries.length ? '請調整搜尋或篩選條件' : '點右上角 ＋ 新增第一筆記帳') + '</div>';
        return;
      }
      let html = '';
      if (filterCount(f) || qq) {
        const s = PL.summarize(items);
        html += '<div class="sec-h" style="margin-top:6px"><span>符合條件 ' + items.length + ' 筆</span></div><div class="tiles" style="margin-bottom:6px">' +
          '<div class="tile" style="background:var(--surface)"><div class="k">收入</div><div class="v pos">' + PL.fmtTWD(s.income) + '</div></div>' +
          '<div class="tile" style="background:var(--surface)"><div class="k">支出含費</div><div class="v">' + PL.fmtTWD(s.expense) + '</div></div>' +
          '<div class="tile" style="background:var(--surface)"><div class="k">手續費</div><div class="v">' + PL.fmtTWD(s.fee) + '</div></div></div>';
      }
      const groups = new Map();
      items.forEach(e => { if (!groups.has(e.date)) groups.set(e.date, []); groups.get(e.date).push(e); });
      for (const [day, list] of groups) {
        const net = PL.round(list.reduce((a, e) => a + PL.netExpense(e), 0), 2);
        html += '<div class="dayh"><span>' + esc(dayHeader(day)) + '</span>' + (net ? '<span class="num">支出 ' + PL.fmtTWD(net) + '</span>' : '<span></span>') + '</div>' +
          '<div class="group">' + list.map(entryRowHTML).join('') + '</div>';
      }
      body.innerHTML = html;
      bindEntryRows(body);
    }
    drawBody();
    if (q && document.activeElement !== $('#list-search', v)) { /* 保持搜尋內容 */ }
  }

  /** 月曆：每格顯示當天淨支出（顏色越深花越多）與收入；點日期在下方列出當天交易 */
  function drawCalendar(body, items, filtered) {
    const L = S.list;
    const month = L.month;
    const [y, m] = month.split('-').map(Number);
    const monthItems = items.filter(e => e.date.slice(0, 7) === month);
    const totals = PL.dailyTotals(monthItems);
    const s = PL.summarize(monthItems);
    const max = Math.max(1, ...Object.values(totals).map(t => t.expense));
    const t0 = today();
    if (!L.day || L.day.slice(0, 7) !== month) L.day = t0.slice(0, 7) === month ? t0 : null;
    const weeks = PL.calendarWeeks(month);
    const cell = d => {
      if (!d) return '<span class="cal-cell empty"></span>';
      const t = totals[d];
      const heat = t && t.expense > 0 ? (0.08 + 0.42 * t.expense / max).toFixed(2) : 0;
      const cls = ['cal-cell', d === t0 ? 'today' : '', d === L.day ? 'sel' : '', d > t0 ? 'future' : ''].filter(Boolean).join(' ');
      return '<button class="' + cls + '" data-day="' + d + '" style="--heat:' + heat + '" aria-label="' + esc(dayHeader(d)) + (t ? '，' + t.count + ' 筆' : '') + '">' +
        '<span class="cal-d">' + Number(d.slice(8)) + '</span>' +
        (t && t.expense > 0 ? '<span class="cal-x">' + esc(shortTWD(t.expense)) + '</span>' : '') +
        (t && t.income > 0 ? '<span class="cal-in">+' + esc(shortTWD(t.income)) + '</span>' : '') +
        (t && !t.expense && !t.income ? '<span class="cal-dot">•</span>' : '') + '</button>';
    };
    let html = '<div class="cal-nav"><button class="iconbtn" data-k="prevm" aria-label="上個月">‹</button>' +
      '<button class="cal-title" data-k="thism">' + y + '年' + m + '月</button>' +
      '<button class="iconbtn" data-k="nextm" aria-label="下個月">›</button></div>' +
      '<div class="tiles" style="margin-bottom:10px">' +
      '<div class="tile" style="background:var(--surface)"><div class="k">本月支出</div><div class="v">' + PL.fmtTWD(s.expense) + '</div></div>' +
      '<div class="tile" style="background:var(--surface)"><div class="k">收入</div><div class="v pos">' + PL.fmtTWD(s.income) + '</div></div>' +
      '<div class="tile" style="background:var(--surface)"><div class="k">手續費</div><div class="v" style="color:var(--warn)">' + PL.fmtTWD(s.fee) + '</div></div></div>' +
      '<div class="cal" id="cal-grid"><div class="cal-week cal-head">' + '日一二三四五六'.split('').map((w, i) => '<span class="' + (i === 0 || i === 6 ? 'we' : '') + '">' + w + '</span>').join('') + '</div>' +
      weeks.map(w => '<div class="cal-week">' + w.map(cell).join('') + '</div>').join('') + '</div>' +
      '<div class="sec-f">' + (filtered ? '已套用搜尋或篩選條件。' : '') + '格子內為當天淨支出（含手續費），顏色越深花越多；綠色為收入。左右滑動可切換月份。</div>';
    // 選取日期的交易
    if (L.day) {
      const list = items.filter(e => e.date === L.day);
      const net = PL.round(list.reduce((a, e) => a + PL.netExpense(e), 0), 2);
      html += '<div class="dayh"><span>' + esc(dayHeader(L.day)) + '</span>' + (net ? '<span class="num">支出 ' + PL.fmtTWD(net) + '</span>' : '<span></span>') + '</div>' +
        '<div class="group" id="cal-day">' + (list.length ? list.map(entryRowHTML).join('') : '<div class="empty" style="padding:20px 16px">這天沒有交易</div>') +
        '<button class="row center accent" data-k="addday">＋ 記一筆在 ' + (Number(L.day.slice(5, 7))) + '/' + Number(L.day.slice(8)) + '</button></div>';
    } else {
      html += '<div class="sec-f" style="text-align:center;margin-top:14px">點選日期查看當天的交易</div>';
    }
    body.innerHTML = html;
    bindEntryRows(body);
    const go = n => { const d = new Date(y, m - 1 + n, 1); L.month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); L.day = null; refreshView(); };
    $('[data-k=prevm]', body).onclick = () => go(-1);
    $('[data-k=nextm]', body).onclick = () => go(1);
    $('[data-k=thism]', body).onclick = () => { L.month = t0.slice(0, 7); L.day = t0; refreshView(); };
    $$('[data-day]', body).forEach(b => {
      b.onclick = () => {
        L.day = b.dataset.day; refreshView();
        // 當天交易在畫面下方看不到時，捲動到可見位置
        const dl = $('#cal-day');
        if (dl) {
          const r = dl.getBoundingClientRect(), bottom = window.innerHeight - 120;
          if (r.top > bottom - 80) window.scrollBy({ top: Math.min(r.top - 200, r.bottom - bottom), behavior: 'smooth' });
        }
      };
    });
    const ad = $('[data-k=addday]', body); if (ad) ad.onclick = () => openForm(null, { date: L.day });
    // 左右滑動切換月份
    const grid = $('#cal-grid', body);
    let sx = null, sy = 0;
    grid.addEventListener('touchstart', ev => { sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; }, { passive: true });
    grid.addEventListener('touchend', ev => {
      if (sx === null) return;
      const t = ev.changedTouches[0], dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
      sx = null;
      if (Math.abs(dx) > 60 && dy < 50) go(dx < 0 ? 1 : -1);
    });
  }

  // ======================= 篩選頁 =======================
  function openFilter(title, current, showDates, onApply) {
    const f = JSON.parse(JSON.stringify(current));
    const currencies = [...new Set(S.entries.map(e => e.currency))].sort();
    const countries = [...new Set(S.entries.map(e => e.countryCode))].sort();
    pushPage({
      title: title, leftLabel: '完成',
      right: { label: '清除', action: () => { Object.assign(f, emptyFilter()); onApply(JSON.parse(JSON.stringify(f))); rerenderTop(); } },
      onClose: () => onApply(f),
      render(body) {
        const sec = (name, key, items) => '<div class="sec"><div class="sec-h"><span>' + esc(name) + '</span><span>' + (f[key].length ? '' : '未選＝全部') + '</span></div><div class="group">' +
          (items.length ? items.map(([v, l]) => '<label class="row"><span class="k">' + esc(l) + '</span><input type="checkbox" data-f="' + key + '" value="' + esc(v) + '"' + (f[key].includes(v) ? ' checked' : '') + '></label>').join('') : '<div class="row muted">尚無資料</div>') +
          '</div></div>';
        body.innerHTML =
          (showDates ? '<div class="sec"><div class="sec-h"><span>日期</span></div><div class="group">' + switchHTML('f-usedates', f.useDates, '限定日期區間') +
            (f.useDates ? '<label class="row"><span class="k">開始</span><input type="date" id="f-from" value="' + f.from + '"></label><label class="row"><span class="k">結束</span><input type="date" id="f-to" value="' + f.to + '"></label>' : '') + '</div></div>' : '') +
          sec('類型', 'types', Object.keys(TYPES).map(k => [k, TYPES[k].t])) +
          sec('幣別', 'currencies', currencies.map(c => [c, c + ' ' + currencyName(c)])) +
          sec('國家／地區', 'countries', countries.map(c => [c, regionLabel(c)])) +
          sec('分類', 'categories', S.categories.map(c => [c.id, c.icon + ' ' + c.name + (c.kind === 'income' ? '（收入）' : '')])) +
          sec('付款方式', 'methods', Object.keys(METHODS).map(k => [k, METHODS[k]])) +
          (tripNames().length ? sec('旅程', 'trips', tripNames().map(t => [t, '🧳 ' + t]).concat([['', '（不屬於任何旅程）']])) : '') +
          (S.cards.length ? sec('卡片', 'cards', S.cards.map(c => [c.id, cardLabel(c)])) : '');
        $$('[data-f]', body).forEach(cb => {
          cb.onchange = () => {
            const k = cb.dataset.f;
            f[k] = cb.checked ? f[k].concat([cb.value]) : f[k].filter(x => x !== cb.value);
          };
        });
        const ud = $('#f-usedates', body);
        if (ud) ud.onchange = () => { f.useDates = ud.checked; rerenderTop(); };
        const fr = $('#f-from', body), to = $('#f-to', body);
        if (fr) fr.onchange = () => { f.from = fr.value || f.from; };
        if (to) to.onchange = () => { f.to = to.value || f.to; };
      }
    });
  }

  // ======================= 分頁：報表 =======================
  function reportRange() {
    const r = S.report, d = PL.parseDay(r.anchor);
    if (r.mode === 'month') {
      const s = new Date(d.getFullYear(), d.getMonth(), 1), e = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      return { start: PL.dayKey(s), end: PL.dayKey(e), title: d.getFullYear() + '年' + (d.getMonth() + 1) + '月' };
    }
    if (r.mode === 'year') return { start: d.getFullYear() + '-01-01', end: (d.getFullYear() + 1) + '-01-01', title: d.getFullYear() + '年' };
    const a = r.start <= r.end ? r.start : r.end, b = r.start <= r.end ? r.end : r.start;
    return { start: a, end: PL.addDays(b, 1), title: fmtDate(a) + ' – ' + fmtDate(b) };
  }
  function renderReports(v) {
    const r = S.report, range = reportRange();
    const items = S.entries.filter(e => PL.inRange(e.date, range.start, range.end) && matchFilter(e, r.filter));
    const s = PL.summarize(items);
    const fc = filterCount(r.filter);
    v.innerHTML = '<div class="toprow"><h1 class="large">統計報表</h1><div class="tools"><button class="iconbtn" data-k="csv" aria-label="匯出 CSV">匯出</button><button class="iconbtn ' + (fc ? 'active' : '') + '" data-k="filter">篩選' + (fc ? ' ' + fc : '') + '</button></div></div>' +
      '<div class="seg" data-k="mode">' + [['month', '月'], ['year', '年'], ['custom', '自訂']].map(([k, l]) => '<button data-v="' + k + '" class="' + (r.mode === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div>' +
      (r.mode === 'custom'
        ? '<div class="sec"><div class="group"><label class="row"><span class="k">開始</span><input type="date" id="r-start" value="' + r.start + '"></label><label class="row"><span class="k">結束</span><input type="date" id="r-end" value="' + r.end + '"></label></div></div>'
        : '<div class="sec"><div class="group"><div class="row"><button class="iconbtn" data-k="prev" aria-label="上一期">‹</button><span class="k center" style="display:flex;font-weight:700">' + esc(range.title) + '</span><button class="iconbtn" data-k="next" aria-label="下一期">›</button></div></div></div>') +
      '<div class="sec"><div class="sec-h"><span>新台幣合計</span></div><div class="tiles two on-bg">' +
      '<div class="tile"><div class="k">收入</div><div class="v pos">' + PL.fmtTWD(s.income) + '</div></div>' +
      '<div class="tile"><div class="k">支出（含手續費）</div><div class="v">' + PL.fmtTWD(s.expense) + '</div></div>' +
      '<div class="tile"><div class="k">刷卡手續費</div><div class="v" style="color:var(--warn)">' + PL.fmtTWD(s.fee) + '</div><div class="f">消費 ' + PL.fmtTWD(s.spending) + '</div></div>' +
      '<div class="tile"><div class="k">結餘</div><div class="v ' + (s.balance < 0 ? 'danger' : '') + '">' + PL.fmtTWD(s.balance) + '</div></div></div>' +
      ((s.refund || s.cardPayment || s.advance || s.exchange) ? '<div class="sec-f">' + [
        s.refund ? '退款 ' + PL.fmtTWD(s.refund) + '（已自支出扣除）' : '',
        s.advance ? '代墊 ' + PL.fmtTWD(s.advance) + '（不計入自己的支出）' : '',
        s.cardPayment ? '信用卡繳款 ' + PL.fmtTWD(s.cardPayment) + '（不計入支出）' : '',
        s.exchange ? '換匯 ' + PL.fmtTWD(s.exchange) + '（不計入支出）' : ''].filter(Boolean).join('　') + '</div>' : '') + '</div>' +
      '<div class="sec"><div class="sec-h"><span>各幣別原始金額</span></div><div class="group">' + currencyHTML(s.byCurrency) + '</div><div class="sec-f">各幣別分開統計、不直接相加；手續費一律以新台幣計。</div></div>' +
      '<div class="sec"><div class="sec-h"><span>月趨勢（含手續費的淨支出）</span></div><div class="seg" data-k="trendn">' +
      [[6, '近 6 個月'], [12, '近 12 個月']].map(([k, l]) => '<button data-v="' + k + '" class="' + ((r.trendN || 6) === k ? 'on' : '') + '">' + l + '</button>').join('') +
      '</div><div id="trend"></div></div>' +
      '<div class="sec"><div class="sec-h"><span>圖表</span></div><div class="seg" data-k="dim">' +
      [['category', '分類'], ['country', '國家'], ['method', '付款'], ['card', '卡片'], ['fee', '手續費']].map(([k, l]) => '<button data-v="' + k + '" class="' + (r.dim === k ? 'on' : '') + '">' + l + '</button>').join('') +
      '</div><div id="chart"></div></div>';
    $$('[data-k=mode] button', v).forEach(b => { b.onclick = () => { r.mode = b.dataset.v; refreshView(); }; });
    $$('[data-k=dim] button', v).forEach(b => { b.onclick = () => { r.dim = b.dataset.v; refreshView(); }; });
    const prev = $('[data-k=prev]', v), next = $('[data-k=next]', v);
    const step = n => { const d = PL.parseDay(r.anchor); r.anchor = PL.dayKey(r.mode === 'year' ? new Date(d.getFullYear() + n, d.getMonth(), 1) : new Date(d.getFullYear(), d.getMonth() + n, 1)); refreshView(); };
    if (prev) prev.onclick = () => step(-1);
    if (next) next.onclick = () => step(1);
    const rs = $('#r-start', v), re = $('#r-end', v);
    if (rs) rs.onchange = () => { if (rs.value) { r.start = rs.value; refreshView(); } };
    if (re) re.onchange = () => { if (re.value) { r.end = re.value; refreshView(); } };
    $('[data-k=filter]', v).onclick = () => openFilter('篩選報表', r.filter, false, nf => { r.filter = nf; });
    $('[data-k=csv]', v).onclick = () => {
      if (!items.length) { toast('此期間沒有交易可匯出'); return; }
      exportCSV(items, range.start + '_' + PL.addDays(range.end, -1));
    };
    drawChart($('#chart', v), items, r.dim);
    drawTrend(v, range);
  }
  function drawTrend(v, range) {
    const r = S.report, n = r.trendN || 6;
    $$('[data-k=trendn] button', v).forEach(b => { b.onclick = () => { r.trendN = +b.dataset.v; refreshView(); }; });
    // 趨勢以期間的最後一個月為結尾；套用篩選條件（日期以外）
    let endKey = PL.addDays(range.end, -1);
    if (endKey > today() && r.mode !== 'custom') endKey = today() > range.start ? today() : endKey;
    const items = S.entries.filter(e => matchFilter(e, r.filter));
    const months = PL.monthlyTotals(items, endKey, n);
    const host = $('#trend', v);
    const max = Math.max(...months.map(m => m.expense), 1);
    const W = 340, H = 170, top = 18, bottom = 24, left = 4, gap = n > 6 ? 6 : 12;
    const bw = (W - left * 2 - gap * (n - 1)) / n;
    const avg = PL.round(months.reduce((a, m) => a + m.expense, 0) / n, 0);
    const bars = months.map((m, i) => {
      const h = Math.max(m.expense / max * (H - top - bottom), m.expense > 0 ? 2 : 0);
      const x = left + i * (bw + gap), y = H - bottom - h;
      const last = i === n - 1;
      const showVal = n <= 6 || last || m.expense === max;
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" fill="var(--accent)" opacity="' + (last ? 1 : 0.45) + '"/>' +
        (showVal && m.expense > 0 ? '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle" font-size="9.5" fill="var(--muted)">' + esc(shortTWD(m.expense)) + '</text>' : '') +
        '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10.5" fill="' + (last ? 'var(--fg)' : 'var(--muted)') + '"' + (last ? ' font-weight="700"' : '') + '>' + m.month + '月</text>';
    }).join('');
    const avgY = H - bottom - avg / max * (H - top - bottom);
    const cur = months[n - 1], prev = months[n - 2];
    let cmp = '';
    if (prev && prev.expense > 0) {
      const d = Math.round((cur.expense - prev.expense) / prev.expense * 100);
      cmp = cur.month + '月比' + prev.month + '月' + (d === 0 ? '持平' : (d > 0 ? '多 ' : '少 ') + Math.abs(d) + '%') + '（' + PL.fmtTWD(cur.expense) + ' vs ' + PL.fmtTWD(prev.expense) + '）';
    } else if (prev) cmp = cur.month + '月支出 ' + PL.fmtTWD(cur.expense);
    host.innerHTML = '<div class="group chart"><svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="每月支出趨勢">' +
      '<line x1="0" x2="' + W + '" y1="' + (H - bottom) + '" y2="' + (H - bottom) + '" stroke="var(--line)"/>' +
      (avg > 0 ? '<line x1="0" x2="' + W + '" y1="' + avgY.toFixed(1) + '" y2="' + avgY.toFixed(1) + '" stroke="var(--warn)" stroke-dasharray="4 3" opacity=".8"/>' : '') +
      bars + '</svg>' +
      '<div class="row small" style="padding:6px 0 0;min-height:0;border:0"><span class="k">' + esc(cmp) + '</span></div>' +
      '<div class="row small muted" style="padding:2px 0 0;min-height:0;border:0"><span class="k"><span style="color:var(--warn)">- - -</span> 平均 ' + PL.fmtTWD(avg) + '／月・手續費合計 ' + PL.fmtTWD(PL.round(months.reduce((a, m) => a + m.fee, 0), 2)) + '</span></div></div>' +
      '<div class="sec-f">套用目前的篩選條件；不受上方期間影響，以期間的最後一個月為結尾。</div>';
  }
  function shortTWD(v) {
    if (v >= 100000) return PL.round(v / 10000, 1) + '萬';
    if (v >= 10000) return PL.round(v / 10000, 2) + '萬';
    return Math.round(v).toLocaleString('en-US');
  }

  function drawChart(host, items, dim) {
    let data;
    if (dim === 'category') data = PL.breakdown(items, e => ({ key: e.categoryId || 'none', label: catIcon(e) + ' ' + catName(e) }));
    else if (dim === 'country') data = PL.breakdown(items, e => ({ key: e.countryCode, label: regionLabel(e.countryCode) }));
    else if (dim === 'method') data = PL.breakdown(items, e => ({ key: e.method, label: METHOD_ICONS[e.method] + ' ' + METHODS[e.method] }));
    else if (dim === 'card') data = PL.breakdown(items.filter(e => e.cardId && cardById(e.cardId)), e => ({ key: e.cardId, label: cardById(e.cardId).name }));
    else data = PL.breakdown(items, e => ({ key: e.cardId || 'none', label: cardById(e.cardId) ? cardById(e.cardId).name : '未指定卡片' }), PL.netFee);
    if (!data.length) { host.innerHTML = '<div class="group"><div class="empty">此期間沒有可統計的' + (dim === 'fee' ? '手續費' : '支出') + '</div></div>'; return; }
    const total = data.reduce((a, g) => a + g.value, 0);
    const pct = v => Math.round(v / total * 100) + '%';
    const note = '<div class="sec-f">' + (dim === 'fee' ? '手續費淨額（退回的手續費已扣除）。' : '金額為淨支出，含刷卡手續費並扣除退款。') + '</div>';
    if (dim === 'category') {
      const R = 80, C = 2 * Math.PI * R;
      let offset = 0;
      const arcs = data.map((g, i) => {
        const len = g.value / total * C;
        const gap = data.length > 1 ? Math.min(2, len / 3) : 0;
        const s = '<circle r="' + R + '" cx="100" cy="100" fill="none" stroke="var(' + CHART_COLORS[i % CHART_COLORS.length] + ')" stroke-width="30" stroke-dasharray="' + Math.max(len - gap, 0.01).toFixed(2) + ' ' + C.toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 100 100)"/>';
        offset += len; return s;
      }).join('');
      host.innerHTML = '<div class="group chart"><svg class="donut" viewBox="0 0 200 200" role="img" aria-label="分類支出比例">' + arcs +
        '<text x="100" y="94" text-anchor="middle" font-size="12" fill="var(--muted)">淨支出</text><text x="100" y="114" text-anchor="middle" font-size="16" font-weight="700" fill="var(--fg)">' + esc(PL.fmtTWD(total)) + '</text></svg>' +
        '<div class="legend">' + data.map((g, i) => '<div class="row"><span class="dot" style="background:var(' + CHART_COLORS[i % CHART_COLORS.length] + ')"></span><span class="k">' + esc(g.label) + '</span><span class="v num">' + PL.fmtTWD(g.value) + '　' + pct(g.value) + '</span></div>').join('') + '</div></div>' + note;
    } else {
      const max = data[0].value;
      host.innerHTML = '<div class="group">' + data.map(g => '<div class="hbar ' + (dim === 'fee' ? 'fee' : '') + '"><div class="t"><span>' + esc(g.label) + '</span><span>' + PL.fmtTWD(g.value) + '　' + pct(g.value) + '</span></div><div class="track"><i style="width:' + (g.value / max * 100).toFixed(1) + '%"></i></div></div>').join('') + '</div>' + note;
    }
  }

  // ======================= 分頁：預算 =======================
  function renderBudget(v) {
    const period = PL.shiftPeriod(currentPeriod(), S.budgetOffset);
    const us = PL.usages(budgetDefs(), S.entries, period);
    const total = us.find(u => u.isTotal), cats = us.filter(u => !u.isTotal);
    const st = S.settings;
    v.innerHTML = '<div class="toprow"><h1 class="large">預算</h1><div class="tools"><button class="iconbtn" data-k="edit">編輯預算</button></div></div>' +
      '<div class="sec"><div class="group"><div class="row"><button class="iconbtn" data-k="prev" aria-label="上一期">‹</button><span class="k center" style="display:grid"><b>' + esc(period.title) + '</b><span class="muted small">' + fmtDate(period.start) + ' 起</span></span><button class="iconbtn" data-k="next" aria-label="下一期"' + (S.budgetOffset >= 0 ? ' disabled style="opacity:.35"' : '') + '>›</button></div></div></div>' +
      (!us.length ? '<div class="group"><div class="empty"><b>尚未設定預算</b>可設定每月總預算，以及各支出分類的月預算。<br><br><button class="btn primary" data-k="edit2">設定預算</button></div></div>' :
        (total ? '<div class="sec"><div class="sec-h"><span>總預算</span></div><div class="group">' + budgetHTML(total) + '</div></div>' : '') +
        (cats.length ? '<div class="sec"><div class="sec-h"><span>分類預算</span></div><div class="group">' + cats.map(budgetHTML).join('') + '</div></div>' : '')) +
      '<div class="sec-f">預算以新台幣計算，外幣支出依各筆保存的匯率換算；刷卡手續費計入已用金額，退款會扣回。</div>' +
      '<div class="sec-f">' + (st.budgetAlertsEnabled ? '達到 ' + st.warningPercent + '% 及 100% 時提醒；同一週期每個門檻只提醒一次。' : '預算提醒已關閉（可在設定中開啟）。') + '</div>';
    $('[data-k=edit]', v).onclick = openBudgetEdit;
    const e2 = $('[data-k=edit2]', v); if (e2) e2.onclick = openBudgetEdit;
    $('[data-k=prev]', v).onclick = () => { S.budgetOffset--; refreshView(); };
    $('[data-k=next]', v).onclick = () => { if (S.budgetOffset < 0) { S.budgetOffset++; refreshView(); } };
  }
  function openBudgetEdit() {
    const vals = {};
    const total = S.budgets.find(b => b.isTotal);
    vals.total = total && total.amount > 0 ? String(total.amount) : '';
    S.categories.filter(c => c.kind === 'expense').forEach(c => {
      const b = S.budgets.find(x => !x.isTotal && x.categoryId === c.id);
      vals[c.id] = b && b.amount > 0 ? String(b.amount) : '';
    });
    pushPage({
      title: '編輯預算', leftLabel: '取消',
      right: {
        label: '儲存', action: async () => {
          const setPlan = async (isTotal, categoryId, text) => {
            const amount = PL.parseNumber(text) || 0;
            const ex = S.budgets.find(b => isTotal ? b.isTotal : (!b.isTotal && b.categoryId === categoryId));
            if (amount <= 0) { if (ex) await remove('budgets', S.budgets, ex.id); return; }
            await upsert('budgets', S.budgets, Object.assign(ex || { id: uid(), isTotal: isTotal, categoryId: categoryId }, { amount: amount }));
          };
          await setPlan(true, null, vals.total);
          for (const c of S.categories.filter(c => c.kind === 'expense')) await setPlan(false, c.id, vals[c.id]);
          await budgetsChanged();
          popPage();
          toast('預算已儲存');
        }
      },
      render(body) {
        const sumCats = () => S.categories.filter(c => c.kind === 'expense').reduce((a, c) => a + (PL.parseNumber(vals[c.id]) || 0), 0);
        body.innerHTML = '<div class="sec"><div class="group"><label class="row"><span class="k">每月總預算</span><span class="muted">NT$</span><input inputmode="decimal" data-b="total" value="' + esc(groupDigits(vals.total)) + '" placeholder="0"></label></div><div class="sec-f">留空或 0 代表不設定。</div></div>' +
          '<div class="sec"><div class="sec-h"><span>分類月預算</span></div><div class="group">' +
          S.categories.filter(c => c.kind === 'expense').map(c => '<label class="row"><span class="k">' + esc(c.icon + ' ' + c.name) + '</span><span class="muted">NT$</span><input inputmode="decimal" data-b="' + c.id + '" value="' + esc(groupDigits(vals[c.id])) + '" placeholder="0"></label>').join('') +
          '</div><div class="sec-f" id="b-sum"></div></div>';
        const upd = () => {
          const s = sumCats(), t = PL.parseNumber(vals.total) || 0;
          $('#b-sum', body).innerHTML = t > 0 && s > t ? '<span style="color:var(--warn)">分類預算合計 ' + PL.fmtTWD(s) + ' 已超過總預算。</span>' : '分類預算合計 ' + PL.fmtTWD(s);
        };
        $$('[data-b]', body).forEach(i => bindMoney(i, raw => { vals[i.dataset.b] = raw; upd(); }));
        upd();
      }
    });
  }

  /** 以前輸入過的商家，依使用次數排序 */
  function merchantSuggestions() {
    const count = new Map();
    S.entries.forEach(e => { const m = (e.merchant || '').trim(); if (m) count.set(m, (count.get(m) || 0) + 1); });
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(x => x[0]);
  }
  /** 所有旅程名稱（最近使用的在前） */
  function tripNames() {
    const seen = [];
    S.entries.forEach(e => { if (e.trip && !seen.includes(e.trip)) seen.push(e.trip); });
    if (S.settings.activeTrip && !seen.includes(S.settings.activeTrip)) seen.unshift(S.settings.activeTrip);
    return seen;
  }

  // ======================= 新增／編輯交易 =======================
  function openForm(entry, preset) {
    preset = preset || {};
    const st = S.settings;
    const f = entry ? {
      id: entry.id, type: entry.type, amountText: String(entry.amount), currency: entry.currency, date: entry.date,
      categoryId: entry.categoryId, countryCode: entry.countryCode, method: entry.method, cardId: entry.cardId,
      merchant: entry.merchant, note: entry.note,
      quote: entry.currency !== 'TWD' && entry.rateSource !== 'manual' ? { rate: entry.rate, rateDate: entry.rateDate, source: entry.rateSource, detail: entry.rateDetail } : null,
      manual: entry.currency !== 'TWD' && entry.rateSource === 'manual', rateText: entry.rateSource === 'manual' ? String(entry.rate) : '',
      rateState: entry.currency !== 'TWD' && entry.rateSource !== 'manual' ? 'ok' : 'idle', rateMsg: '',
      loadedKey: entry.currency + '|' + entry.date + '|' + (entry.type === 'income' ? 'buy' : 'sell'),
      includesFee: entry.includesFee, feeManual: entry.isFeeManual, feeText: String(entry.feeTWD),
      receipt: entry.receipt, newBlob: null, countryTouched: true, trip: entry.trip || '', categoryTouched: true,
      paidText: entry.type === 'exchange' ? String(entry.amountTWD) : '', useWallet: entry.rateSource === 'wallet' ? true : (entry.type === 'expense' || entry.type === 'refund') && entry.method === 'cash' && entry.currency !== 'TWD' ? false : null,
      adv: !!entry.advAmount, advText: entry.advAmount ? String(entry.advAmount) : '', advWho: entry.advWho || '',
      more: !!(entry.note || entry.receipt || entry.advAmount)
    } : {
      id: null, type: preset.type || 'expense', amountText: '', currency: st.defaultCurrency, date: today(),
      categoryId: null, countryCode: st.defaultCountry, method: 'cash', cardId: null, merchant: '', note: '',
      quote: null, manual: false, rateText: '', rateState: 'idle', rateMsg: '', loadedKey: null,
      includesFee: false, feeManual: false, feeText: '', receipt: null, newBlob: null, countryTouched: false,
      trip: st.activeTrip || '', categoryTouched: false, paidText: '', useWallet: null, adv: false, advText: '', advWho: '', more: false
    };
    if (!entry) {
      if (preset.amount) f.amountText = String(preset.amount);
      if (preset.date) f.date = preset.date;
      if (preset.currency) f.currency = preset.currency;
      if (f.type === 'exchange' && f.currency === 'TWD') f.currency = st.favoriteCurrencies.find(c => c !== 'TWD') || 'USD';
      const kind = f.type === 'income' ? 'income' : 'expense';
      const c = S.categories.find(x => x.kind === kind); f.categoryId = f.type === 'cardPayment' ? null : (c ? c.id : null);
      if (preset.cardId) { f.cardId = preset.cardId; const cd = cardById(preset.cardId); if (cd && f.type !== 'cardPayment') f.method = cd.kind === 'debit' ? 'debitCard' : 'creditCard'; }
      else if (f.type === 'cardPayment') { const cc = S.cards.find(x => x.kind === 'credit'); f.cardId = cc ? cc.id : null; }
      // 再記一筆：沿用幣別、分類、國家、付款方式、卡片、商家與旅程，只需要輸入金額
      const src = preset.copyFrom;
      if (src) {
        Object.assign(f, { type: src.type, currency: src.currency, categoryId: src.categoryId, countryCode: src.countryCode,
          method: src.method, cardId: src.cardId, merchant: src.merchant || '', trip: src.trip || f.trip, countryTouched: true, categoryTouched: true });
      }
      f.includesFee = PL.defaultIncludesFee(f.type, f.method, effCurrency(), st);
    }
    let previewURL = null;
    function effCurrency() { return f.type === 'cardPayment' ? 'TWD' : f.currency; }
    const isForeign = () => effCurrency() !== 'TWD';
    const amount = () => PL.parseNumber(f.amountText);
    const isExchange = () => f.type === 'exchange';
    const wallet = () => PL.walletState(S.entries, effCurrency(), { until: f.date, excludeId: f.id });
    const walletEligible = () => (f.type === 'expense' || f.type === 'refund') && f.method === 'cash' && isForeign();
    /** 現金外幣支出：錢包有餘額時預設用平均成本 */
    const walletActive = () => walletEligible() && (f.useWallet === null ? wallet().balance > 0 : f.useWallet) && !!wallet().avgRate;
    const rate = () => {
      if (!isForeign()) return 1;
      if (isExchange()) { const a = PL.parseNumber(f.amountText), p = PL.parseNumber(f.paidText); return a > 0 && p > 0 ? PL.round(p / a, 6) : null; }
      if (walletActive()) return wallet().avgRate;
      return f.manual ? PL.parseNumber(f.rateText) : (f.quote ? f.quote.rate : null);
    };
    const amountTWD = () => { const a = amount(), r = rate(); return a !== null && r ? PL.convert(a, r) : null; };
    const card = () => cardById(f.cardId);
    const feeOK = () => PL.feeApplicable(f.type, f.method, effCurrency(), st);
    const feeRate = () => PL.effectiveRate(card() && card().customFeeRate !== null && card().customFeeRate !== undefined ? card().customFeeRate : null, st);
    const computedFee = () => { const t = amountTWD(); return t === null ? 0 : PL.fee(t, feeRate()); };
    const finalFee = () => !(feeOK() && f.includesFee) ? 0 : (f.feeManual ? (PL.parseNumber(f.feeText) || 0) : computedFee());
    const rateKey = () => effCurrency() + '|' + f.date + '|' + (f.type === 'income' ? 'buy' : 'sell');
    /** 「更多選項」收合時，摘要顯示已填的內容 */
    const moreSummary = () => [f.trip ? '🧳 ' + f.trip : '', f.note ? '備註' : '', (f.receipt || f.newBlob) ? '📎 收據' : '', f.adv ? '代墊' : ''].filter(Boolean).join('・');
    const advAmount = () => f.adv && f.type === 'expense' ? Math.min(PL.parseNumber(f.advText) || 0, amount() || 0) : 0;
    const canSave = () => { const a = amount(), r = rate(); return a !== null && a > 0 && r !== null && r > 0 && (f.type !== 'cardPayment' || !!f.cardId) && (!isExchange() || isForeign()); };
    const resetFee = () => { f.includesFee = PL.defaultIncludesFee(f.type, f.method, effCurrency(), st); f.feeManual = false; };

    async function maybeFetch(force) {
      if (!isForeign() || f.manual || isExchange() || walletActive()) return;
      const key = rateKey();
      if (!force && key === f.loadedKey && f.quote) return;
      f.quote = null; f.rateState = 'loading'; f.loadingKey = key;
      if (isTop()) rerender();
      try {
        const q = await lookupRate(effCurrency(), f.date);
        if (f.loadingKey !== key) return;
        f.quote = q; f.rateState = 'ok'; f.loadedKey = key;
      } catch (err) {
        if (f.loadingKey !== key) return;
        f.rateState = 'fail'; f.rateMsg = err.message; f.manual = true;
      }
      if (isTop()) rerender();
    }
    const page = {
      title: f.type === 'exchange' ? (entry ? '編輯換匯' : '記錄換匯') : (entry ? '編輯交易' : '新增交易'), leftLabel: '取消',
      right: { label: '儲存', action: () => save() }, footer: true,
      onClose: () => { if (previewURL) URL.revokeObjectURL(previewURL); },
      render: render
    };
    const isTop = () => stack[stack.length - 1] === page;
    function rerender() { rerenderTop(); }

    function formulaText() {
      const t = amountTWD(); if (t === null) return '';
      const lines = [];
      if (isForeign()) lines.push('① 換算：' + PL.fmtMoney(amount(), effCurrency()) + ' × ' + PL.fmtRate(rate()) + ' = ' + PL.fmtTWD(t));
      lines.push(f.feeManual ? '② 手續費：依帳單手動調整為 ' + PL.fmtTWD(finalFee()) + '（自動計算為 ' + PL.fmtTWD(computedFee()) + '）'
        : '② 手續費：' + PL.fmtTWD(t) + ' × ' + PL.fmtPercent(feeRate()) + ' = ' + PL.fmtTWD(computedFee()) + '（四捨五入至整數元）');
      return lines.join('\n');
    }
    function updateDerived(body) {
      const t = amountTWD();
      const conv = $('#f-conv', body); if (conv) conv.textContent = t === null ? '—' : PL.fmtTWD(t);
      const ob = $('#f-own', body);
      if (ob) {
        const a = amount() || 0, adv = advAmount();
        if (t === null || !a) ob.textContent = '';
        else {
          const sp = PL.advanceSplit(a, t, finalFee(), adv);
          ob.textContent = '代墊 ' + PL.fmtMoney(adv, effCurrency()) + '（≈ ' + PL.fmtTWD(sp.advTWD + sp.advFeeTWD) + '，含按比例的手續費）；自己負擔 ' +
            PL.fmtMoney(PL.round(a - adv, 6), effCurrency()) + '（≈ ' + PL.fmtTWD(PL.round(t + finalFee() - sp.advTWD - sp.advFeeTWD, 2)) + '）';
        }
      }
      const rateOut = $('#f-xrate', body);
      if (rateOut) rateOut.textContent = rate() ? '1 ' + effCurrency() + ' = ' + PL.fmtRate(rate()) + ' TWD' : '—';
      const fb = $('#f-feebreak', body);
      if (fb) fb.innerHTML = t === null ? '' :
        '<div class="row"><span class="k">消費金額</span><span class="v num">' + PL.fmtTWD(t) + '</span></div>' +
        '<div class="row"><span class="k">手續費</span><span class="v num">' + PL.fmtTWD(finalFee()) + '</span></div>' +
        '<div class="row"><b class="k">含手續費總額</b><b class="num">' + PL.fmtTWD(t + finalFee()) + '</b></div>' +
        '<div class="formula">' + esc(formulaText()) + '</div>';
      setRightEnabled(canSave());
    }

    function render(body) {
      const cur = effCurrency();
      const cats = S.categories.filter(c => c.kind === (f.type === 'income' ? 'income' : 'expense'));
      const cardKind = f.type === 'cardPayment' ? 'credit' : (f.method === 'debitCard' ? 'debit' : 'credit');
      const cards = S.cards.filter(c => c.kind === cardKind);
      const cardSelect = label => cards.length
        ? '<label class="row"><span class="k">' + label + '</span><select id="f-card">' + optionList([['', '未指定']].concat(cards.map(c => [c.id, cardLabel(c)])), f.cardId || '') + '</select></label>'
        : '<button class="row link" data-k="addcard"><span class="k">' + label + '</span><span class="v">尚未建立卡片，點此新增</span></button>';
      let rateHTML = '';
      if (isExchange()) {
        rateHTML = '<div class="sec"><div class="sec-h"><span>換匯成本</span></div><div class="group">' +
          '<label class="row"><span class="k">支付新台幣</span><span class="muted">NT$</span><input inputmode="decimal" id="f-paid" value="' + esc(groupDigits(f.paidText)) + '" placeholder="0"></label>' +
          '<div class="row"><span class="k">換匯匯率</span><span class="v num" id="f-xrate"></span></div></div>' +
          '<div class="sec-f">' + (isForeign() ? '換到的外幣現金會放進「外幣現金錢包」。之後用這個幣別的現金消費時，預設以錢包的平均成本換算新台幣。換匯本身不算支出。' : '<span style="color:var(--warn)">請選擇外幣。</span>') + '</div></div>';
      } else if (walletActive()) {
        const w = wallet(), a = amount() || 0;
        rateHTML = '<div class="sec"><div class="sec-h"><span>外幣現金錢包</span></div><div class="group">' +
          '<div class="row"><span class="k">平均成本</span><span class="v num">1 ' + esc(cur) + ' = ' + PL.fmtRate(w.avgRate) + ' TWD</span></div>' +
          '<div class="row"><span class="k">錢包餘額（' + fmtDate(f.date) + '）</span><span class="v num">' + esc(PL.fmtMoney(w.balance, cur)) + '</span></div>' +
          (f.type === 'expense' && a > w.balance ? '<div class="row" style="color:var(--warn)">⚠️ 金額超過錢包餘額，超出部分仍以平均成本計算</div>' : '') +
          switchHTML('f-wallet', true, '使用錢包平均成本') + '</div>' +
          '<div class="sec-f">用換匯時的成本計算這筆現金支出，比消費當天的匯率更接近實際花費。</div></div>';
      } else if (isForeign()) {
        rateHTML = '<div class="sec"><div class="sec-h"><span>交易日匯率</span></div><div class="group">';
        if (f.rateState === 'loading') rateHTML += '<div class="row muted">查詢 ' + fmtDate(f.date) + ' 匯率中…</div>';
        if (f.rateState === 'fail') rateHTML += '<div class="row" style="color:var(--warn)">⚠️ ' + esc(f.rateMsg) + '</div>';
        if (f.manual) {
          rateHTML += '<label class="row"><span class="k">1 ' + esc(cur) + ' =</span><input inputmode="decimal" id="f-rate" value="' + esc(f.rateText) + '" placeholder="匯率"><span class="muted">TWD</span></label>' +
            '<div class="row"><span class="chip">✋ 手動匯率</span><span class="k"></span><button class="btn" data-k="auto">改回自動查詢</button></div>';
        } else if (f.quote) {
          rateHTML += '<div class="row"><span class="k">匯率</span><span class="v num">1 ' + esc(cur) + ' = ' + PL.fmtRate(f.quote.rate) + ' TWD</span></div>' +
            '<div class="row"><span class="k">匯率日期</span><span class="v">' + fmtDate(f.quote.rateDate) + '</span></div>' +
            '<div class="row"><span class="k">資料來源</span><span class="v">' + esc(RATE_SOURCES[f.quote.source] || f.quote.source) + '</span></div>' +
            (f.quote.source === 'cached' ? '<div class="row small" style="color:var(--warn)">⚠️ 目前離線，暫用 ' + fmtDate(f.quote.rateDate) + ' 的匯率。有網路時可在首頁「補查匯率」改成交易日匯率。</div>'
              : (f.quote.detail ? '<div class="row small muted">' + esc(f.quote.detail) + '</div>' : '')) +
            '<div class="btnrow"><button class="btn" data-k="refetch">重新查詢</button><button class="btn" data-k="manual">改用手動匯率</button></div>';
        } else if (f.rateState !== 'loading') {
          rateHTML += '<div class="btnrow"><button class="btn" data-k="refetch">查詢匯率</button><button class="btn" data-k="manual">手動輸入</button></div>';
        }
        if (walletEligible() && wallet().avgRate) rateHTML += switchHTML('f-wallet', false, '改用外幣現金錢包平均成本');
        rateHTML += '</div><div class="sec-f">存檔後此筆交易會保存當時採用的匯率，之後匯率更新也不會改變舊紀錄。</div></div>';
      }
      const feeHTML = feeOK() ? '<div class="sec"><div class="sec-h"><span>刷卡手續費</span></div><div class="group">' +
        switchHTML('f-incfee', f.includesFee, f.type === 'refund' ? '退回手續費' : '計入刷卡手續費') +
        (f.includesFee ? '<div class="row"><span class="k">費率</span><span class="v">' + PL.fmtPercent(feeRate()) + (card() && card().customFeeRate !== null && card().customFeeRate !== undefined ? '（卡片費率）' : '（預設）') + '</span></div>' +
          switchHTML('f-feemanual', f.feeManual, '手動調整手續費') +
          (f.feeManual ? '<label class="row"><span class="k">實際手續費</span><span class="muted">NT$</span><input inputmode="decimal" id="f-feetext" value="' + esc(groupDigits(f.feeText)) + '"></label>' : '') +
          '<div id="f-feebreak"></div>' : '') + '</div></div>' : '';
      const advHTML = f.type === 'expense' ? '<div class="sec"><div class="sec-h"><span>代墊／分帳</span></div><div class="group">' +
        switchHTML('f-adv', f.adv, '幫別人代墊（不算自己的支出）') +
        (f.adv ? '<label class="row"><span class="k">對象</span><input type="text" id="f-advwho" list="dl-who" autocomplete="off" value="' + esc(f.advWho) + '" placeholder="例如：小明"></label>' +
          '<datalist id="dl-who">' + advanceNames().map(n => '<option value="' + esc(n) + '"></option>').join('') + '</datalist>' +
          '<label class="row"><span class="k">代墊金額（' + esc(cur) + '）</span><input inputmode="decimal" id="f-advamt" value="' + esc(groupDigits(f.advText)) + '" placeholder="0"></label>' +
          '<div class="btnrow"><button class="btn" data-k="advall">全部</button><button class="btn" data-k="advhalf">一半</button><button class="btn" data-k="advthird">三分之一</button></div>' +
          '<div class="row small muted" id="f-own"></div>' : '') +
        '</div><div class="sec-f">代墊的部分不計入自己的支出與預算，會列在「設定 → 代墊款」等待收回。信用卡帳務仍以實際刷卡全額計算。</div></div>' : '';
      const showReceipt = f.type !== 'cardPayment' && !isExchange();
      body.innerHTML =
        (isExchange() ? '' : '<div class="seg" data-k="type">' + FORM_TYPES.map(k => '<button data-v="' + k + '" class="' + (f.type === k ? 'on' : '') + '">' + TYPES[k].t + '</button>').join('') + '</div>') +
        '<div class="sec"><div class="sec-h"><span>' + (isExchange() ? '換到的外幣現金' : '金額與幣別') + '</span></div><div class="group"><div class="amount-row">' +
        (f.type === 'cardPayment' ? '<span class="fixed">TWD</span>' : '<select id="f-cur" aria-label="幣別">' + currencyOptions(f.currency) + '</select>') +
        '<input id="f-amount" inputmode="decimal" placeholder="0" value="' + esc(groupDigits(f.amountText)) + '" aria-label="金額" autocomplete="off"></div>' +
        (isForeign() && !isExchange() ? '<div class="row"><span class="k">換算新台幣</span><span class="v num" id="f-conv"></span></div>' : '') + '</div></div>' +
        rateHTML +
        '<div class="sec"><div class="group"><label class="row"><span class="k">日期</span><input type="date" id="f-date" value="' + f.date + '" max="2100-12-31"></label>' +
        (f.type === 'cardPayment' ? cardSelect('繳款卡片') : isExchange() ?
          '<label class="row"><span class="k">國家／地區</span><select id="f-country">' + regionOptions(f.countryCode) + '</select></label>' :
          '<label class="row"><span class="k">分類</span><select id="f-cat">' + optionList([['', '未分類']].concat(cats.map(c => [c.id, c.icon + ' ' + c.name])), f.categoryId || '') + '</select></label>' +
          '<label class="row"><span class="k">國家／地區</span><select id="f-country">' + regionOptions(f.countryCode) + '</select></label>' +
          '<label class="row"><span class="k">付款方式</span><select id="f-method">' + optionList(Object.keys(METHODS).map(k => [k, METHOD_ICONS[k] + ' ' + METHODS[k]]), f.method) + '</select></label>' +
          (f.method === 'creditCard' || f.method === 'debitCard' ? cardSelect('卡片') : '')) +
        '</div><div class="sec-f">' + (f.type === 'cardPayment' ? '繳卡費是把錢從銀行帳戶轉去繳信用卡帳單，屬於轉帳，不會計入支出，避免與原本的刷卡消費重複計算。' :
          f.type === 'refund' ? '退款會沖減所選分類的支出；若信用卡同時退回手續費，請開啟「退回手續費」。' : '') + '</div></div>' +
        feeHTML +
        (f.type === 'cardPayment' || isExchange()
          ? '<div class="sec"><div class="sec-h"><span>備註（選填）</span></div><div class="group"><div class="row stack"><textarea id="f-note" rows="2" placeholder="備註">' + esc(f.note) + '</textarea></div></div></div>'
          : '<div class="sec"><div class="group"><label class="row"><span class="k">商家</span><input type="text" id="f-merchant" list="dl-merchants" autocomplete="off" value="' + esc(f.merchant) + '" placeholder="選填"></label>' +
            '<datalist id="dl-merchants">' + merchantSuggestions().map(m => '<option value="' + esc(m) + '"></option>').join('') + '</datalist>' +
            '<button class="row more" data-k="more" aria-expanded="' + (f.more ? 'true' : 'false') + '"><span class="k">' + (f.more ? '收合選項' : '更多選項') + '</span><span class="v small">' + esc(moreSummary()) + '</span><span class="chev">' + (f.more ? '⌃' : '⌄') + '</span></button></div>' +
            '<div class="sec-f">' + (f.more ? '' : '旅程、備註、收據照片、代墊都在「更多選項」。') + '</div></div>' +
            (f.more ? '<div class="sec"><div class="sec-h"><span>旅程與備註</span></div><div class="group">' +
              '<label class="row"><span class="k">🧳 旅程</span><input type="text" id="f-trip" list="dl-trips" autocomplete="off" value="' + esc(f.trip) + '" placeholder="例如：2026 東京"></label>' +
              '<datalist id="dl-trips">' + tripNames().map(t => '<option value="' + esc(t) + '"></option>').join('') + '</datalist>' +
              '<div class="row stack"><span class="muted small">備註</span><textarea id="f-note" rows="2" placeholder="備註">' + esc(f.note) + '</textarea></div></div></div>' +
              advHTML +
              '<div class="sec"><div class="sec-h"><span>收據照片</span></div><div class="group"><div id="f-receipt"></div><div class="btnrow">' +
              '<label class="btn filebtn">📷 拍攝或選擇照片<input type="file" accept="image/*" id="f-file"></label>' +
              '<button class="btn danger" data-k="rmreceipt"' + (f.receipt || f.newBlob ? '' : ' hidden') + '>移除收據</button></div></div></div>' : '')) +
        (entry ? '<div class="sec"><div class="group"><button class="row center danger" data-k="delete">刪除這筆交易</button></div></div>' : '');

      // 綁定
      $$('[data-k=type] button', body).forEach(b => {
        b.onclick = () => {
          if (f.type === b.dataset.v) return;
          f.type = b.dataset.v;
          const kind = f.type === 'income' ? 'income' : 'expense';
          if (f.type !== 'cardPayment' && !(catById(f.categoryId) && catById(f.categoryId).kind === kind)) { const c = S.categories.find(x => x.kind === kind); f.categoryId = c ? c.id : null; }
          if (f.type === 'cardPayment' && !(card() && card().kind === 'credit')) { const c = S.cards.find(x => x.kind === 'credit'); f.cardId = c ? c.id : null; }
          resetFee(); rerender(); maybeFetch(false);
        };
      });
      const amt = $('#f-amount', body);
      bindMoney(amt, raw => { f.amountText = raw; updateDerived(body); });
      if (!entry && !f.amountText && !render.focused) { render.focused = true; setTimeout(() => amt.focus(), 50); }
      const curSel = $('#f-cur', body);
      if (curSel) curSel.onchange = () => {
        f.currency = curSel.value;
        if (!f.countryTouched && SUGGESTED_REGION[f.currency]) f.countryCode = SUGGESTED_REGION[f.currency];
        f.manual = false; f.rateText = ''; f.rateState = 'idle'; f.quote = null; f.useWallet = null; resetFee(); rerender(); maybeFetch(false);
      };
      bindMoney($('#f-paid', body), raw => { f.paidText = raw; updateDerived(body); });
      const wsw = $('#f-wallet', body); if (wsw) wsw.onchange = () => { f.useWallet = wsw.checked; rerender(); maybeFetch(false); };
      const advSw = $('#f-adv', body); if (advSw) advSw.onchange = () => { f.adv = advSw.checked; rerender(); };
      const advWho = $('#f-advwho', body); if (advWho) advWho.oninput = () => { f.advWho = advWho.value; };
      bindMoney($('#f-advamt', body), raw => { f.advText = raw; updateDerived(body); });
      const setAdv = ratio => { const a = amount(); if (a) { f.advText = String(PL.round(a * ratio, PL.currencyDigits(effCurrency()))); rerender(); } };
      [['advall', 1], ['advhalf', 1 / 2], ['advthird', 1 / 3]].forEach(([k, r]) => { const b = $('[data-k=' + k + ']', body); if (b) b.onclick = () => setAdv(r); });
      const rateIn = $('#f-rate', body); if (rateIn) rateIn.oninput = () => { f.rateText = rateIn.value; updateDerived(body); };
      const bt = k => $('[data-k=' + k + ']', body);
      if (bt('auto')) bt('auto').onclick = () => { f.manual = false; f.rateState = 'idle'; maybeFetch(true); rerender(); };
      if (bt('refetch')) bt('refetch').onclick = () => maybeFetch(true);
      if (bt('manual')) bt('manual').onclick = () => { f.rateText = f.quote ? String(f.quote.rate) : ''; f.manual = true; rerender(); };
      const dateIn = $('#f-date', body); dateIn.onchange = () => { if (dateIn.value) { f.date = dateIn.value; if (walletEligible()) rerender(); maybeFetch(false); } };
      const cat = $('#f-cat', body); if (cat) cat.onchange = () => { f.categoryId = cat.value || null; f.categoryTouched = true; };
      const ctry = $('#f-country', body); if (ctry) ctry.onchange = () => { f.countryCode = ctry.value; f.countryTouched = true; };
      const meth = $('#f-method', body);
      if (meth) meth.onchange = () => {
        f.method = meth.value;
        if (f.method === 'creditCard' || f.method === 'debitCard') {
          const kind = f.method === 'debitCard' ? 'debit' : 'credit';
          if (!(card() && card().kind === kind)) { const c = S.cards.find(x => x.kind === kind); f.cardId = c ? c.id : null; }
        } else f.cardId = null;
        f.useWallet = null; resetFee(); rerender(); maybeFetch(false);
      };
      const cs = $('#f-card', body); if (cs) cs.onchange = () => { f.cardId = cs.value || null; rerender(); };
      if (bt('addcard')) bt('addcard').onclick = () => openCardEdit(null);
      const inc = $('#f-incfee', body); if (inc) inc.onchange = () => { f.includesFee = inc.checked; rerender(); };
      const fm = $('#f-feemanual', body); if (fm) fm.onchange = () => { f.feeManual = fm.checked; if (f.feeManual) f.feeText = String(computedFee()); rerender(); };
      bindMoney($('#f-feetext', body), raw => { f.feeText = raw; updateDerived(body); });
      const mer = $('#f-merchant', body);
      if (mer) {
        mer.oninput = () => { f.merchant = mer.value; };
        // 選了以前用過的商家：若尚未手動選分類，帶入上次該商家的分類
        mer.onchange = () => {
          f.merchant = mer.value;
          if (f.categoryTouched) return;
          const kind = f.type === 'income' ? 'income' : 'expense';
          const prev = S.entries.find(e => e.merchant && e.merchant.trim() === f.merchant.trim() && catById(e.categoryId) && catById(e.categoryId).kind === kind);
          if (prev && prev.categoryId !== f.categoryId) { f.categoryId = prev.categoryId; rerender(); }
        };
      }
      const trip = $('#f-trip', body); if (trip) trip.oninput = () => { f.trip = trip.value; };
      const note = $('#f-note', body); if (note) note.oninput = () => { f.note = note.value; };
      const more = $('[data-k=more]', body); if (more) more.onclick = () => { f.more = !f.more; rerender(); };
      const file = $('#f-file', body);
      if (file) file.onchange = async () => {
        const fl = file.files && file.files[0]; if (!fl) return;
        try { f.newBlob = await compressImage(fl); rerender(); } catch (e) { toast('無法讀取這張照片'); }
      };
      if (bt('rmreceipt')) bt('rmreceipt').onclick = () => { f.newBlob = null; f.receipt = null; rerender(); };
      if (bt('delete')) bt('delete').onclick = async () => {
        // 可復原，所以不再跳確認視窗
        const showUndo = await deleteEntryWithUndo(entry); closeAllPages(); showUndo();
      };
      // 收據預覽
      const rh = $('#f-receipt', body);
      if (rh) {
        if (f.newBlob) { if (previewURL) URL.revokeObjectURL(previewURL); previewURL = URL.createObjectURL(f.newBlob); rh.innerHTML = '<img class="receipt-img" alt="收據預覽" src="' + previewURL + '">'; }
        else if (f.receipt) receiptURL(f.receipt).then(u => { if (u) rh.innerHTML = '<img class="receipt-img" alt="收據" src="' + u + '">'; });
      }
      updateDerived(body);
    }

    async function save() {
      if (!canSave()) return;
      const a = amount(), r = rate(), cur = effCurrency();
      const old = entry || {};
      const now = new Date().toISOString();
      const useW = walletActive();
      const e = {
        id: f.id || uid(), type: f.type, amount: a, currency: cur, date: f.date,
        categoryId: f.type === 'cardPayment' || isExchange() ? null : f.categoryId,
        countryCode: f.type === 'cardPayment' ? st.defaultCountry : f.countryCode,
        method: f.type === 'cardPayment' ? 'other' : isExchange() ? 'cash' : f.method,
        cardId: !isExchange() && (f.type === 'cardPayment' || f.method === 'creditCard' || f.method === 'debitCard') ? (f.cardId || null) : null,
        merchant: f.type === 'cardPayment' || isExchange() ? '' : f.merchant.trim(), note: f.note.trim(),
        trip: f.type === 'cardPayment' ? '' : (f.trip || '').trim(),
        rate: r, amountTWD: isExchange() ? PL.parseNumber(f.paidText) : PL.convert(a, r),
        rateSource: cur === 'TWD' ? 'base' : isExchange() ? 'exchange' : useW ? 'wallet' : (f.manual ? 'manual' : f.quote.source),
        rateDate: cur === 'TWD' || isExchange() || useW || f.manual ? f.date : f.quote.rateDate,
        rateDetail: cur === 'TWD' ? '' : isExchange() ? '換匯成本' : useW ? '外幣現金錢包平均成本（當時餘額 ' + PL.fmtMoney(wallet().balance, cur) + '）' : (f.manual ? '使用者手動輸入' : f.quote.detail),
        includesFee: feeOK() && f.includesFee, feeRate: 0, feeTWD: finalFee(), isFeeManual: false,
        receipt: old.receipt || null, createdAt: old.createdAt || now, updatedAt: now
      };
      e.feeRate = e.includesFee ? feeRate() : 0;
      e.isFeeManual = e.includesFee && f.feeManual;
      // 對帳狀態：金額、幣別或匯率改變時取消對帳
      if (old.reconciled && old.amount === e.amount && old.currency === e.currency && old.rate === e.rate) {
        e.reconciled = true; e.estimate = old.estimate; e.amountTWD = old.amountTWD; e.feeTWD = old.feeTWD; e.includesFee = old.includesFee; e.isFeeManual = true;
      }
      // 代墊
      const advA = advAmount();
      if (advA > 0) {
        Object.assign(e, { advAmount: advA, advWho: (f.advWho || '').trim(), advSettled: !!old.advSettled, advSettledDate: old.advSettledDate || null },
          PL.advanceSplit(e.amount, e.amountTWD, e.feeTWD, advA));
      }
      // 收據
      if (f.type === 'cardPayment' || (!f.newBlob && !f.receipt)) {
        if (e.receipt) { await DB.delete('receipts', e.receipt); e.receipt = null; }
      } else if (f.newBlob) {
        if (e.receipt) await DB.delete('receipts', e.receipt);
        e.receipt = uid() + '.jpg';
        await DB.put('receipts', { name: e.receipt, blob: f.newBlob });
      }
      await upsert('entries', S.entries, e);
      requestPersist();
      closeAllPages();
      toast(entry ? '已更新' : '已儲存');
      await evaluateBudgets();   // 預算提醒（若有）會蓋過「已儲存」提示
    }

    pushPage(page);
    maybeFetch(false);
  }

  /** 依信用卡帳單調整：輸入帳單上的新台幣金額與手續費，反推實際匯率 */
  function openReconcile(e) {
    const base = e.reconciled && e.estimate ? e.estimate : e;
    const f = { amt: String(e.amountTWD), fee: String(e.feeTWD) };
    const foreign = e.currency !== 'TWD';
    pushPage({
      title: '依帳單調整', leftLabel: '取消',
      right: {
        label: '儲存', action: async () => {
          const amt = PL.parseNumber(f.amt), fee = PL.parseNumber(f.fee) || 0;
          if (!(amt > 0)) { toast('請輸入帳單上的新台幣金額'); return; }
          if (!e.reconciled) e.estimate = { rate: e.rate, amountTWD: e.amountTWD, feeTWD: e.feeTWD, rateSource: e.rateSource, rateDetail: e.rateDetail, rateDate: e.rateDate, includesFee: e.includesFee, isFeeManual: e.isFeeManual };
          Object.assign(e, { amountTWD: PL.round(amt, 2), feeTWD: PL.round(fee, 2), includesFee: fee > 0, isFeeManual: true, reconciled: true, updatedAt: new Date().toISOString() });
          if (foreign) Object.assign(e, { rate: PL.round(amt / e.amount, 6), rateSource: 'statement', rateDetail: '依信用卡帳單（原估 ' + PL.fmtTWD(e.estimate.amountTWD) + '，匯率 ' + PL.fmtRate(e.estimate.rate) + '）' });
          if (e.advAmount) Object.assign(e, PL.advanceSplit(e.amount, e.amountTWD, e.feeTWD, e.advAmount));
          await upsert('entries', S.entries, e);
          await evaluateBudgets();
          popPage(); toast('已依帳單調整');
        }
      },
      render(body) {
        body.innerHTML = '<div class="sec"><div class="sec-h"><span>原本的估算</span></div><div class="group">' +
          '<div class="row"><span class="k">原始金額</span><span class="v num">' + esc(PL.fmtMoney(e.amount, e.currency)) + '</span></div>' +
          (foreign ? '<div class="row"><span class="k">估算匯率</span><span class="v num">' + PL.fmtRate(base.rate) + '</span></div>' : '') +
          '<div class="row"><span class="k">估算新台幣＋手續費</span><span class="v num">' + PL.fmtTWD(base.amountTWD) + ' ＋ ' + PL.fmtTWD(base.feeTWD) + '</span></div></div></div>' +
          '<div class="sec"><div class="sec-h"><span>信用卡帳單上的金額</span></div><div class="group">' +
          '<label class="row"><span class="k">消費金額（新台幣）</span><span class="muted">NT$</span><input inputmode="decimal" id="rc-amt" value="' + esc(groupDigits(f.amt)) + '"></label>' +
          '<label class="row"><span class="k">國外交易手續費</span><span class="muted">NT$</span><input inputmode="decimal" id="rc-fee" value="' + esc(groupDigits(f.fee)) + '"></label>' +
          '<div class="formula" id="rc-sum"></div></div>' +
          '<div class="sec-f">帳單上的國外交易通常分成「消費金額」與「國外交易服務費」兩行，分別填入即可。儲存後統計、預算與卡片帳務都會改用帳單金額；可隨時取消對帳恢復原估算。</div></div>';
        const upd = () => {
          const amt = PL.parseNumber(f.amt), fee = PL.parseNumber(f.fee) || 0;
          if (!(amt > 0)) { $('#rc-sum', body).textContent = ''; return; }
          const diff = PL.round(amt + fee - base.amountTWD - base.feeTWD, 2);
          $('#rc-sum', body).textContent = (foreign ? '實際匯率：' + PL.fmtTWD(amt) + ' ÷ ' + PL.fmtMoney(e.amount, e.currency) + ' = ' + PL.fmtRate(PL.round(amt / e.amount, 6)) + '\n' : '') +
            '實際總額：' + PL.fmtTWD(PL.round(amt + fee, 2)) + '（與估算差 ' + (diff >= 0 ? '+' : '') + PL.fmtTWD(diff) + '）';
        };
        bindMoney($('#rc-amt', body), raw => { f.amt = raw; upd(); });
        bindMoney($('#rc-fee', body), raw => { f.fee = raw; upd(); });
        upd();
      }
    });
  }

  /** 有使用過外幣現金（換匯或現金消費）的幣別 */
  function walletCurrencies() {
    return [...new Set(S.entries.filter(e => e.currency !== 'TWD' && PL.isWalletEvent(e, e.currency)).map(e => e.currency))].sort();
  }
  function openWallets() {
    pushPage({
      title: '外幣現金錢包',
      right: { label: '＋換匯', action: () => openForm(null, { type: 'exchange' }) },
      render(body) {
        const list = walletCurrencies().map(c => ({ c, w: PL.walletState(S.entries, c) }));
        body.innerHTML = '<div class="sec"><div class="group">' + (list.length ? list.map(x =>
          '<button class="row link" data-cur="' + x.c + '"><span class="k"><b>' + esc(PL.fmtMoney(x.w.balance, x.c)) + '</b><br><span class="muted small">' + esc(currencyName(x.c)) +
          (x.w.avgRate ? '・平均成本 ' + PL.fmtRate(x.w.avgRate) : '') + '</span></span><span class="v num">成本 ' + PL.fmtTWD(x.w.cost) + '</span></button>').join('')
          : '<div class="empty"><b>尚無外幣現金</b>出國前在銀行換外幣現金時，點右上角「＋換匯」記錄。</div>') + '</div>' +
          '<div class="sec-f">換匯會增加錢包餘額；用該幣別「現金」付款的支出會扣除餘額，並以平均成本（移動平均）換算新台幣。換匯不算支出，現金花掉時才算。</div></div>';
        $$('[data-cur]', body).forEach(b => { b.onclick = () => openWalletDetail(b.dataset.cur); });
      }
    });
  }
  function openWalletDetail(cur) {
    pushPage({
      title: cur + ' 現金',
      right: { label: '＋換匯', action: () => openForm(null, { type: 'exchange', currency: cur }) },
      render(body) {
        const w = PL.walletState(S.entries, cur);
        const events = S.entries.filter(e => PL.isWalletEvent(e, cur));
        body.innerHTML = '<div class="tiles two on-bg" style="margin-bottom:16px"><div class="tile"><div class="k">餘額</div><div class="v">' + esc(PL.fmtMoney(w.balance, cur)) + '</div></div>' +
          '<div class="tile"><div class="k">平均成本</div><div class="v">' + (w.avgRate ? PL.fmtRate(w.avgRate) : '—') + '</div><div class="f">成本合計 ' + PL.fmtTWD(w.cost) + '</div></div></div>' +
          '<div class="sec"><div class="sec-h"><span>換匯與現金收支</span></div><div class="group">' + events.map(entryRowHTML).join('') + '</div>' +
          '<div class="sec-f">餘額與手上現金不同時，可新增一筆換匯或現金支出調整。已存檔的支出會保留當時的平均成本，事後補記較早的換匯不會改變舊紀錄。</div></div>';
        bindEntryRows(body);
      }
    });
  }

  /** 代墊對象名稱（最近使用的在前） */
  function advanceNames() {
    const seen = [];
    S.entries.forEach(e => { if (e.advWho && !seen.includes(e.advWho)) seen.push(e.advWho); });
    return seen;
  }
  function openAdvances() {
    pushPage({
      title: '代墊款',
      render(body) {
        const open = S.entries.filter(e => e.type === 'expense' && e.advAmount && !e.advSettled);
        const done = S.entries.filter(e => e.type === 'expense' && e.advAmount && e.advSettled).slice(0, 20);
        const groups = new Map();
        open.forEach(e => { const k = e.advWho || '未填對象'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); });
        const total = open.reduce((a, e) => a + PL.advanceTWD(e), 0);
        let html = '<div class="hero-card"><div class="lbl">待收回合計</div><div class="big" style="margin-bottom:0">' + PL.fmtTWD(PL.round(total, 2)) + '</div></div>';
        if (!open.length) html += '<div class="group"><div class="empty"><b>沒有待收回的代墊款</b>新增支出時開啟「幫別人代墊」即可記錄。</div></div>';
        for (const [who, list] of groups) {
          const sum = PL.round(list.reduce((a, e) => a + PL.advanceTWD(e), 0), 2);
          const byCur = {};
          list.forEach(e => { byCur[e.currency] = (byCur[e.currency] || 0) + e.advAmount; });
          html += '<div class="sec"><div class="sec-h"><span>👤 ' + esc(who) + '・' + PL.fmtTWD(sum) + '</span><span>' + esc(Object.entries(byCur).map(([c, v]) => PL.fmtMoney(v, c)).join('、')) + '</span></div><div class="group">' +
            list.map(entryRowHTML).join('') + '<button class="row center accent" data-settle="' + esc(who) + '">✅ ' + esc(who) + ' 已全部還款</button></div></div>';
        }
        if (done.length) html += '<div class="sec"><div class="sec-h"><span>最近已收回</span></div><div class="group">' + done.map(entryRowHTML).join('') + '</div></div>';
        body.innerHTML = html + '<div class="sec-f">收回的錢不算收入；代墊部分本來就沒有計入自己的支出。若對方不還，可編輯該筆交易關閉「代墊」，金額就會改算成自己的支出。</div>';
        bindEntryRows(body);
        $$('[data-settle]', body).forEach(b => {
          b.onclick = async () => {
            const who = b.dataset.settle;
            for (const e of open.filter(x => (x.advWho || '未填對象') === who)) { e.advSettled = true; e.advSettledDate = today(); await DB.put('entries', e); }
            rerenderTop(); toast(who + ' 的代墊款已標記收回');
          };
        });
      }
    });
  }

  /** 旅程預算使用量 */
  function tripUsage(name) {
    const budget = (S.settings.tripBudgets || {})[name] || 0;
    const items = S.entries.filter(e => e.trip === name);
    const spent = Math.max(PL.summarize(items).expense, 0);
    const ratio = budget > 0 ? spent / budget : 0;
    return { key: 'trip:' + name, name: name, icon: '🧳', budget, spent, remaining: PL.round(budget - spent, 2), ratio, percent: Math.floor(ratio * 100 + 1e-9), isTotal: false };
  }
  async function checkTripBudgets() {
    if (!S.settings.budgetAlertsEnabled) return;
    const sent = lsGet('pl.tripAlerts', {});
    const thresholds = PL.alertThresholds(S.settings.warningPercent);
    for (const [name, budget] of Object.entries(S.settings.tripBudgets || {})) {
      if (!(budget > 0)) continue;
      const u = tripUsage(name);
      const pending = thresholds.filter(t => PL.isReached(u, t) && !sent[name + '|' + budget + '|' + t]);
      if (!pending.length) continue;
      pending.forEach(t => { sent[name + '|' + budget + '|' + t] = today(); });
      const top = pending[pending.length - 1];
      const txt = PL.notificationText(Object.assign({}, u, { name: '旅程「' + name + '」' }), top);
      await notify(txt.title, txt.body, 'trip-' + name + '-' + top);
    }
    lsSet('pl.tripAlerts', sent);
  }
  function openTripDetail(name) {
    pushPage({
      title: '🧳 ' + name,
      render(body) {
        const st = S.settings;
        const u = tripUsage(name);
        const items = S.entries.filter(e => e.trip === name);
        const s = PL.summarize(items);
        const dates = items.map(e => e.date).sort();
        body.innerHTML = (u.budget > 0 ? '<div class="sec"><div class="group">' + budgetHTML(u) + '</div></div>' : '') +
          '<div class="sec"><div class="sec-h"><span>旅程預算</span></div><div class="group">' +
          '<label class="row"><span class="k">總預算</span><span class="muted">NT$</span><input inputmode="decimal" id="tb-amt" value="' + (u.budget > 0 ? groupDigits(u.budget) : '') + '" placeholder="不設定"></label></div>' +
          '<div class="sec-f">整趟旅程的總預算（新台幣，含手續費、扣除退款與代墊）。達到 ' + st.warningPercent + '% 與 100% 時提醒。</div></div>' +
          '<div class="sec"><div class="sec-h"><span>統計</span></div><div class="tiles two on-bg">' +
          '<div class="tile"><div class="k">支出（含手續費）</div><div class="v">' + PL.fmtTWD(s.expense) + '</div></div>' +
          '<div class="tile"><div class="k">手續費</div><div class="v">' + PL.fmtTWD(s.fee) + '</div></div></div>' +
          '<div class="sec-f">' + (dates.length ? fmtDate(dates[0]) + ' – ' + fmtDate(dates[dates.length - 1]) + '・' + items.length + ' 筆' : '尚無交易') + '</div></div>' +
          '<div class="sec"><div class="group">' +
          (items.length ? '<button class="row accent" data-k="report">📊 在報表中查看</button>' : '') +
          (st.activeTrip === name ? '<button class="row accent" data-k="end">結束旅程（之後的交易不再自動標記）</button>' : '<button class="row accent" data-k="start">設為進行中的旅程</button>') + '</div></div>';
        bindMoney($('#tb-amt', body), () => {});
        $('#tb-amt', body).onchange = async ev => {
          const v = PL.parseNumber(ev.target.value) || 0;
          if (v === ((st.tripBudgets || {})[name] || 0)) return;   // 未變更（例如重新繪製時再次觸發）
          st.tripBudgets = Object.assign({}, st.tripBudgets || {});
          if (v > 0) st.tripBudgets[name] = v; else delete st.tripBudgets[name];
          await saveSettings(); rerenderTop(); toast(v > 0 ? '旅程預算已設定' : '已取消旅程預算');
          await evaluateBudgets();   // 已達門檻時，提醒會蓋過上面的提示
        };
        const rp = $('[data-k=report]', body);
        if (rp) rp.onclick = () => {
          const r = S.report;
          r.filter = emptyFilter(); r.filter.trips = [name];
          r.mode = 'custom'; r.start = dates[0]; r.end = dates[dates.length - 1];
          closeAllPages(); switchTab('reports');
        };
        const sb = $('[data-k=start]', body); if (sb) sb.onclick = async () => { st.activeTrip = name; await saveSettings(); rerenderTop(); toast('新交易會標記為「' + name + '」'); };
        const eb = $('[data-k=end]', body); if (eb) eb.onclick = async () => { st.activeTrip = ''; await saveSettings(); rerenderTop(); toast('旅程已結束'); };
      }
    });
  }

  /** 依固定收支規則自動產生到期的交易（開啟 App 時執行） */
  let generating = false;
  async function generateRecurring() {
    if (generating || !S.settings) return 0;
    generating = true;
    let made = 0;
    try {
      for (const rule of S.settings.recurring || []) {
        for (const occ of PL.recurringDue(rule, today())) {
          let rate = 1, q = null;
          if (rule.currency !== 'TWD') {
            try { q = await lookupRate(rule.currency, occ.date); rate = q.rate; } catch (e) { break; }   // 查不到匯率：下次開啟再補
          }
          const card = cardById(rule.cardId);
          const pol = S.settings;
          const amountTWD = PL.convert(rule.amount, rate);
          const feeOn = PL.defaultIncludesFee(rule.type, rule.method, rule.currency, pol);
          const feeRate = feeOn ? PL.effectiveRate(card && card.customFeeRate !== null && card.customFeeRate !== undefined ? card.customFeeRate : null, pol) : 0;
          const now = new Date().toISOString();
          const e = {
            id: uid(), type: rule.type, amount: rule.amount, currency: rule.currency, date: occ.date,
            categoryId: catById(rule.categoryId) ? rule.categoryId : null, countryCode: rule.countryCode || pol.defaultCountry,
            method: rule.method, cardId: card ? card.id : null, merchant: rule.name || '', note: rule.note || '', trip: '',
            rate: rate, amountTWD: amountTWD,
            rateSource: rule.currency === 'TWD' ? 'base' : q.source, rateDate: rule.currency === 'TWD' ? occ.date : q.rateDate, rateDetail: q ? q.detail : '',
            includesFee: feeOn, feeRate: feeRate, feeTWD: feeOn ? PL.fee(amountTWD, feeRate) : 0, isFeeManual: false,
            receipt: null, recurringId: rule.id, createdAt: now, updatedAt: now
          };
          await upsert('entries', S.entries, e);
          rule.lastGenerated = occ.month;
          made++;
        }
      }
      if (made) { await saveSettings(); requestPersist(); }
    } finally { generating = false; }
    return made;
  }
  async function runRecurring() {
    const n = await generateRecurring();
    if (n) { if (stack.length) rerenderTop(); refreshView(); toast('已自動記錄 ' + n + ' 筆固定收支'); }
    return n;
  }

  function openRecurring() {
    pushPage({
      title: '固定收支',
      right: { label: '＋新增', action: () => openRecurringEdit(null) },
      render(body) {
        const rules = S.settings.recurring || [];
        body.innerHTML = '<div class="sec"><div class="group">' + (rules.length ? rules.map(r =>
          '<button class="row link" data-rule="' + esc(r.id) + '"><span class="k"><b>' + esc(r.name || catName({ type: r.type, categoryId: r.categoryId })) + '</b>' +
          (r.active === false ? ' <span class="chip">已暫停</span>' : '') + '<br><span class="muted small">每月 ' + (r.day >= 31 ? '月底' : r.day + ' 日') +
          (r.active === false ? '' : '・下次 ' + fmtDate(PL.recurringNext(r, today()))) + '</span></span>' +
          '<span class="v num ' + (r.type === 'income' ? 'pos' : '') + '">' + (r.type === 'income' ? '+' : '-') + esc(PL.fmtMoney(r.amount, r.currency)) + '</span></button>').join('')
          : '<div class="empty"><b>尚無固定收支</b>例如房租、訂閱服務、薪資。設定後每個月會自動記一筆。</div>') + '</div>' +
          '<div class="sec-f">到了每月的入帳日，打開 App 時會自動新增這筆交易（若有好幾個月沒開，會一次補齊，最多 24 個月）。外幣項目會查詢當天匯率；查不到時下次開啟再補。也可以在交易明細按「設為每月固定收支」。</div></div>';
        $$('[data-rule]', body).forEach(b => { b.onclick = () => openRecurringEdit((S.settings.recurring || []).find(r => r.id === b.dataset.rule)); });
      }
    });
  }
  /** 新增／編輯固定收支；fromEntry 為從既有交易建立 */
  function openRecurringEdit(rule, fromEntry) {
    const st = S.settings;
    const src = rule || fromEntry || {};
    const f = {
      type: src.type === 'income' ? 'income' : 'expense', name: rule ? rule.name : (src.merchant || ''), amountText: src.amount ? String(src.amount) : '',
      currency: src.currency || st.defaultCurrency, categoryId: src.categoryId || null, method: src.method || 'cash', cardId: src.cardId || null,
      countryCode: src.countryCode || st.defaultCountry, note: rule ? rule.note || '' : '',
      day: rule ? rule.day : (fromEntry ? Number(fromEntry.date.slice(8)) : Number(today().slice(8))),
      startMonth: rule ? rule.startMonth : (fromEntry ? fromEntry.date.slice(0, 7) : today().slice(0, 7)),
      active: rule ? rule.active !== false : true
    };
    if (!f.categoryId) { const c = S.categories.find(x => x.kind === f.type); f.categoryId = c ? c.id : null; }
    pushPage({
      title: rule ? '編輯固定收支' : '新增固定收支', leftLabel: '取消',
      right: {
        label: '儲存', action: async () => {
          const amount = PL.parseNumber(f.amountText);
          if (!(amount > 0)) { toast('請輸入金額'); return; }
          const usesCard = f.method === 'creditCard' || f.method === 'debitCard';
          const data = { type: f.type, name: f.name.trim(), amount: amount, currency: f.currency, categoryId: f.categoryId, method: f.method,
            cardId: usesCard ? f.cardId : null, countryCode: f.countryCode, note: f.note.trim(), day: f.day, startMonth: f.startMonth, active: f.active };
          st.recurring = (st.recurring || []).slice();
          if (rule) {
            Object.assign(rule, data);
            if (rule.lastGenerated && rule.lastGenerated < PL.addMonths(f.startMonth + '-01', -1).slice(0, 7)) rule.lastGenerated = null;
            st.recurring = st.recurring.map(r => r.id === rule.id ? rule : r);
          } else {
            // 從交易建立：該月已有這筆，從下個月開始自動記
            st.recurring.push(Object.assign({ id: uid(), lastGenerated: fromEntry ? fromEntry.date.slice(0, 7) : null }, data));
          }
          await saveSettings();
          popPage();
          const n = await runRecurring();
          if (!n) toast(rule ? '已更新固定收支' : '已新增固定收支');
        }
      },
      render(body) {
        const cats = S.categories.filter(c => c.kind === f.type);
        const usesCard = f.method === 'creditCard' || f.method === 'debitCard';
        const cards = S.cards.filter(c => c.kind === (f.method === 'debitCard' ? 'debit' : 'credit'));
        body.innerHTML = '<div class="seg" data-k="rtype"><button data-v="expense" class="' + (f.type === 'expense' ? 'on' : '') + '">支出</button><button data-v="income" class="' + (f.type === 'income' ? 'on' : '') + '">收入</button></div>' +
          '<div class="sec"><div class="group"><label class="row"><span class="k">名稱</span><input type="text" id="r-name" value="' + esc(f.name) + '" placeholder="例如：房租、Netflix、薪資"></label>' +
          '<div class="amount-row"><select id="r-cur" aria-label="幣別">' + currencyOptions(f.currency) + '</select>' +
          '<input id="r-amount" inputmode="decimal" placeholder="0" value="' + esc(groupDigits(f.amountText)) + '" aria-label="金額"></div></div></div>' +
          '<div class="sec"><div class="group">' +
          '<label class="row"><span class="k">每月入帳日</span><select id="r-day">' + optionList(Array.from({ length: 31 }, (_, i) => [String(i + 1), i === 30 ? '月底（31 日）' : (i + 1) + ' 日']), String(f.day)) + '</select></label>' +
          '<label class="row"><span class="k">開始月份</span><input type="month" id="r-start" value="' + esc(f.startMonth) + '"></label>' +
          '<label class="row"><span class="k">分類</span><select id="r-cat">' + optionList([['', '未分類']].concat(cats.map(c => [c.id, c.icon + ' ' + c.name])), f.categoryId || '') + '</select></label>' +
          '<label class="row"><span class="k">付款方式</span><select id="r-method">' + optionList(Object.keys(METHODS).map(k => [k, METHOD_ICONS[k] + ' ' + METHODS[k]]), f.method) + '</select></label>' +
          (usesCard ? '<label class="row"><span class="k">卡片</span><select id="r-card">' + optionList([['', '未指定']].concat(cards.map(c => [c.id, cardLabel(c)])), f.cardId || '') + '</select></label>' : '') +
          '<div class="row stack"><span class="muted small">備註</span><textarea id="r-note" rows="2">' + esc(f.note) + '</textarea></div>' +
          switchHTML('r-active', f.active, '啟用（關閉即暫停自動記帳）') + '</div>' +
          '<div class="sec-f">到了入帳日打開 App 就會自動記一筆。' + (rule ? '' : '若開始月份的入帳日已經過了，儲存後會立刻補記。') + '刷卡項目會照設定計算手續費。</div></div>' +
          (rule ? '<div class="sec"><div class="group"><button class="row center danger" data-k="del">刪除固定收支</button></div><div class="sec-f">刪除後不再自動記帳；已經記下的交易會保留。</div></div>' : '');
        $$('[data-k=rtype] button', body).forEach(b => { b.onclick = () => { f.type = b.dataset.v; const c = S.categories.find(x => x.kind === f.type); f.categoryId = c ? c.id : null; rerenderTop(); }; });
        $('#r-name', body).oninput = ev => { f.name = ev.target.value; };
        $('#r-cur', body).onchange = ev => { f.currency = ev.target.value; };
        bindMoney($('#r-amount', body), raw => { f.amountText = raw; });
        $('#r-day', body).onchange = ev => { f.day = +ev.target.value; };
        $('#r-start', body).onchange = ev => { if (/^\d{4}-\d{2}$/.test(ev.target.value)) f.startMonth = ev.target.value; };
        $('#r-cat', body).onchange = ev => { f.categoryId = ev.target.value || null; };
        $('#r-method', body).onchange = ev => {
          f.method = ev.target.value;
          if (f.method === 'creditCard' || f.method === 'debitCard') { const c = S.cards.find(x => x.kind === (f.method === 'debitCard' ? 'debit' : 'credit')); f.cardId = c ? c.id : null; }
          rerenderTop();
        };
        const rc = $('#r-card', body); if (rc) rc.onchange = ev => { f.cardId = ev.target.value || null; };
        $('#r-note', body).oninput = ev => { f.note = ev.target.value; };
        $('#r-active', body).onchange = ev => { f.active = ev.target.checked; };
        const del = $('[data-k=del]', body);
        if (del) del.onclick = async () => {
          if (!confirm('刪除固定收支「' + (rule.name || '未命名') + '」？已記下的交易會保留。')) return;
          st.recurring = (st.recurring || []).filter(r => r.id !== rule.id);
          await saveSettings(); popPage(); toast('已刪除固定收支');
        };
      }
    });
  }

  // ======================= 交易明細 =======================
  function openDetail(id) {
    pushPage({
      title: '交易明細',
      right: { label: '編輯', action: () => { const e = S.entries.find(x => x.id === id); if (e) openForm(e); } },
      render(body, p) {
        const e = S.entries.find(x => x.id === id);
        if (!e) { popPage(); return; }
        p.title = entryTitle(e);
        const foreign = e.currency !== 'TWD';
        const c = cardById(e.cardId);
        body.innerHTML =
          '<div class="hero-card" style="text-align:center"><div class="lbl">' + esc(TYPES[e.type].t) + '</div><div class="big" style="margin-bottom:2px">' + esc(PL.fmtMoney(e.amount, e.currency)) + '</div>' +
          (foreign ? '<div class="muted">' + (e.type === 'exchange' ? '支付 ' : '≈ ') + PL.fmtTWD(e.amountTWD) + '</div>' : '') + '</div>' +
          '<div class="sec"><div class="sec-h"><span>基本資料</span></div><div class="group">' +
          '<div class="row"><span class="k">日期</span><span class="v">' + fmtDate(e.date) + '</span></div>' +
          (e.type !== 'cardPayment' ? '<div class="row"><span class="k">分類</span><span class="v">' + esc(catIcon(e) + ' ' + catName(e)) + '</span></div>' +
            '<div class="row"><span class="k">國家／地區</span><span class="v">' + esc(regionLabel(e.countryCode)) + '</span></div>' +
            '<div class="row"><span class="k">付款方式</span><span class="v">' + esc(METHODS[e.method]) + '</span></div>' : '') +
          (c ? '<div class="row"><span class="k">卡片</span><span class="v">' + esc(cardLabel(c)) + '</span></div>' : '') +
          (e.merchant ? '<div class="row"><span class="k">商家</span><span class="v">' + esc(e.merchant) + '</span></div>' : '') +
          (e.trip ? '<div class="row"><span class="k">旅程</span><span class="v">🧳 ' + esc(e.trip) + '</span></div>' : '') +
          (e.note ? '<div class="row stack"><span class="muted small">備註</span><span style="white-space:pre-wrap">' + esc(e.note) + '</span></div>' : '') + '</div></div>' +
          (foreign ? '<div class="sec"><div class="sec-h"><span>匯率換算</span></div><div class="group">' +
            '<div class="row"><span class="k">原始金額</span><span class="v num">' + esc(PL.fmtMoney(e.amount, e.currency)) + '</span></div>' +
            '<div class="row"><span class="k">匯率</span><span class="v num">1 ' + esc(e.currency) + ' = ' + PL.fmtRate(e.rate) + ' TWD</span></div>' +
            '<div class="row"><span class="k">換算新台幣</span><span class="v num">' + PL.fmtTWD(e.amountTWD) + '</span></div>' +
            '<div class="row"><span class="k">匯率日期</span><span class="v">' + fmtDate(e.rateDate) + '</span></div>' +
            '<div class="row"><span class="k">資料來源</span><span class="v">' + (e.rateSource === 'manual' ? '✋ ' : '') + esc(RATE_SOURCES[e.rateSource] || e.rateSource) + '</span></div>' +
            (e.rateDetail ? '<div class="row small muted">' + esc(e.rateDetail) + '</div>' : '') +
            '</div><div class="sec-f">此匯率於記帳時保存，不會因日後匯率更新而改變。</div></div>' : '') +
          ((e.includesFee || e.feeTWD) ? '<div class="sec"><div class="sec-h"><span>' + (e.type === 'refund' ? '退回手續費' : '刷卡手續費') + '</span></div><div class="group">' +
            '<div class="row"><span class="k">刷卡消費金額</span><span class="v num">' + PL.fmtTWD(e.amountTWD) + '</span></div>' +
            '<div class="row"><span class="k">手續費</span><span class="v num">' + PL.fmtTWD(e.feeTWD) + '</span></div>' +
            '<div class="row"><b class="k">含手續費總額</b><b class="num">' + PL.fmtTWD(e.amountTWD + e.feeTWD) + '</b></div>' +
            '<div class="formula">' + esc((foreign ? '換算：' + PL.fmtMoney(e.amount, e.currency) + ' × ' + PL.fmtRate(e.rate) + ' = ' + PL.fmtTWD(e.amountTWD) + '\n' : '') +
              (e.isFeeManual ? '手續費：依實際帳單手動調整為 ' + PL.fmtTWD(e.feeTWD) : '手續費：' + PL.fmtTWD(e.amountTWD) + ' × ' + PL.fmtPercent(e.feeRate) + ' = ' + PL.fmtTWD(e.feeTWD) + '（四捨五入至整數元）')) + '</div></div></div>' : '') +
          (e.receipt ? '<div class="sec"><div class="sec-h"><span>收據</span></div><div class="group" id="d-receipt"><div class="row muted">載入中…</div></div></div>' : '') +
          (e.advAmount ? '<div class="sec"><div class="sec-h"><span>代墊</span><span>' + (e.advSettled ? '✅ 已收回' : '待收回') + '</span></div><div class="group">' +
            '<div class="row"><span class="k">對象</span><span class="v">' + esc(e.advWho || '未填') + '</span></div>' +
            '<div class="row"><span class="k">代墊金額</span><span class="v num">' + esc(PL.fmtMoney(e.advAmount, e.currency)) + '（≈ ' + PL.fmtTWD(PL.advanceTWD(e)) + '）</span></div>' +
            '<div class="row"><span class="k">自己負擔</span><span class="v num">' + PL.fmtTWD(PL.netExpense(e)) + '</span></div>' +
            switchHTML('d-settled', !!e.advSettled, '已收回') + '</div></div>' : '') +
          ((e.method === 'creditCard' || e.method === 'debitCard') && (e.type === 'expense' || e.type === 'refund') ?
            '<div class="sec"><div class="sec-h"><span>帳單對帳</span><span>' + (e.reconciled ? '✅ 已對帳' : '') + '</span></div><div class="group">' +
            (e.reconciled && e.estimate ? '<div class="row small muted">原估算：' + (foreign ? '1 ' + esc(e.currency) + ' = ' + PL.fmtRate(e.estimate.rate) + '，' : '') + PL.fmtTWD(e.estimate.amountTWD) + ' ＋ 手續費 ' + PL.fmtTWD(e.estimate.feeTWD) +
              '；差額 ' + (e.amountTWD + e.feeTWD - e.estimate.amountTWD - e.estimate.feeTWD >= 0 ? '+' : '') + PL.fmtTWD(PL.round(e.amountTWD + e.feeTWD - e.estimate.amountTWD - e.estimate.feeTWD, 2)) + '</div>' : '') +
            '<button class="row accent" data-k="reconcile">🧾 ' + (e.reconciled ? '修改帳單金額' : '依信用卡帳單調整實際金額') + '</button>' +
            (e.reconciled ? '<button class="row danger" data-k="unreconcile">取消對帳，恢復原估算</button>' : '') + '</div></div>' : '') +
          '<div class="sec"><div class="group"><button class="row center accent" data-k="again">＋ 再記一筆（沿用幣別、分類、卡片、國家）</button>' +
          ((e.type === 'expense' || e.type === 'income') ? (e.recurringId && (S.settings.recurring || []).some(r => r.id === e.recurringId)
            ? '<button class="row center accent" data-k="rule">🔁 由固定收支自動記錄・查看設定</button>'
            : '<button class="row center accent" data-k="mkrule">🔁 設為每月固定收支</button>') : '') + '</div></div>' +
          '<div class="sec"><div class="group"><button class="row center danger" data-k="del">刪除這筆交易</button></div></div>';
        $('#pages .pbar h1').textContent = p.title;
        const mk = $('[data-k=mkrule]', body); if (mk) mk.onclick = () => openRecurringEdit(null, e);
        const rl = $('[data-k=rule]', body); if (rl) rl.onclick = () => openRecurringEdit((S.settings.recurring || []).find(r => r.id === e.recurringId));
        $('[data-k=again]', body).onclick = () => openForm(null, e.type === 'exchange' ? { type: 'exchange', currency: e.currency } : { copyFrom: e });
        const ds = $('#d-settled', body);
        if (ds) ds.onchange = async () => { e.advSettled = ds.checked; e.advSettledDate = ds.checked ? today() : null; await DB.put('entries', e); rerenderTop(); toast(ds.checked ? '已標記為收回' : '已改為待收回'); };
        const rc = $('[data-k=reconcile]', body); if (rc) rc.onclick = () => openReconcile(e);
        const urc = $('[data-k=unreconcile]', body);
        if (urc) urc.onclick = async () => {
          if (!e.estimate) return;
          Object.assign(e, e.estimate); e.reconciled = false; delete e.estimate;
          if (e.advAmount) Object.assign(e, PL.advanceSplit(e.amount, e.amountTWD, e.feeTWD, e.advAmount));
          await upsert('entries', S.entries, e); await evaluateBudgets(); rerenderTop(); toast('已恢復原估算');
        };
        $('[data-k=del]', body).onclick = async () => {
          const showUndo = await deleteEntryWithUndo(e); popPage(); showUndo();
        };
        if (e.receipt) receiptURL(e.receipt).then(u => {
          const h = $('#d-receipt', body); if (!h) return;
          h.innerHTML = u ? '<a href="' + u + '" target="_blank" rel="noopener"><img class="receipt-img" alt="收據" src="' + u + '"></a><div class="row small muted center">點圖片可放大檢視</div>' : '<div class="row muted">找不到收據照片</div>';
        });
      }
    });
  }

  // ======================= 分頁：設定 =======================
  function renderSettings(v) {
    const st = S.settings, lock = lockConfig();
    const link = (k, icon, label, value) => '<button class="row link" data-k="' + k + '"><span class="sicon" style="background:' + SETTING_COLORS[k] + '">' + svgIcon(k) + '</span><span class="k">' + esc(label) + '</span>' + (value ? '<span class="v">' + esc(value) + '</span>' : '') + '</button>';
    v.innerHTML = '<h1 class="large">設定</h1>' +
      '<div class="sec"><div class="sec-h"><span>記帳</span></div><div class="group">' +
      link('currency', '💱', '幣別與預設國家', st.defaultCurrency) +
      link('categories', '🗂️', '分類管理') +
      link('recurring', '🔁', '固定收支', (S.settings.recurring || []).filter(r => r.active !== false).length ? (S.settings.recurring || []).filter(r => r.active !== false).length + ' 項' : '') +
      link('cards', '💳', '卡片管理與繳款', S.cards.length ? S.cards.length + ' 張' : '') +
      link('fee', '％', '刷卡手續費', PL.fmtPercent(st.defaultFeeRate)) +
      link('rates', 'ℹ️', '匯率來源說明') + '</div></div>' +
      '<div class="sec"><div class="sec-h"><span>預算</span></div><div class="group">' + link('budget', '🔔', '預算週期與提醒', '每月 ' + st.budgetStartDay + ' 日起') + '</div></div>' +
      '<div class="sec"><div class="sec-h"><span>旅行與外幣</span></div><div class="group">' + link('trips', '🧳', '旅程與旅程預算', st.activeTrip ? '進行中：' + st.activeTrip : '') +
      link('wallets', '💴', '外幣現金錢包', walletCurrencies().length ? walletCurrencies().length + ' 種幣別' : '') +
      link('advances', '🤝', '代墊款', (() => { const t = S.entries.filter(e => e.advAmount && !e.advSettled).reduce((a, e) => a + PL.advanceTWD(e), 0); return t ? '待收 ' + PL.fmtTWD(PL.round(t, 2)) : ''; })()) + '</div></div>' +
      '<div class="sec"><div class="sec-h"><span>安全與資料</span></div><div class="group">' +
      link('lock', '🔒', 'App 鎖定', lock.mode === 'off' ? '未啟用' : (lock.mode === 'passcode' ? '密碼' : 'Face ID')) +
      link('backup', '💾', '備份與還原') +
      link('install', '📲', '安裝與離線使用', isStandalone() ? '已安裝' : '') + '</div>' +
      '<div class="sec-f">所有記帳資料只存在這台裝置的瀏覽器中，不使用雲端同步。網頁版 1.7</div></div>';
    const map = { currency: openCurrencySettings, categories: openCategorySettings, cards: openCardSettings, fee: openFeeSettings, rates: openRateInfo, budget: openBudgetSettings, recurring: openRecurring, trips: openTrips, wallets: openWallets, advances: openAdvances, lock: openLockSettings, backup: openBackup, install: openInstallHelp };
    $$('[data-k]', v).forEach(b => { b.onclick = () => map[b.dataset.k](); });
  }

  function openCurrencySettings() {
    pushPage({
      title: '幣別',
      render(body) {
        const st = S.settings;
        body.innerHTML = '<div class="sec"><div class="sec-h"><span>預設值</span></div><div class="group">' +
          '<label class="row"><span class="k">預設幣別</span><select id="c-def">' + optionList(st.favoriteCurrencies.map(c => [c, c + ' ' + currencyName(c)]), st.defaultCurrency) + '</select></label>' +
          '<label class="row"><span class="k">預設國家／地區</span><select id="c-ctry">' + regionOptions(st.defaultCountry) + '</select></label></div></div>' +
          '<div class="sec"><div class="sec-h"><span>常用幣別</span></div><div class="group">' +
          st.favoriteCurrencies.map((c, i) => '<div class="row"><span class="k"><b>' + esc(c) + '</b> <span class="muted small">' + esc(currencyName(c)) + '</span></span>' +
            '<button class="iconbtn" data-up="' + i + '" aria-label="上移"' + (i === 0 ? ' disabled style="opacity:.3"' : '') + '>↑</button>' +
            (c === 'TWD' ? '' : '<button class="iconbtn danger" data-rm="' + i + '" aria-label="移除">－</button>') + '</div>').join('') +
          '<label class="row"><span class="k">新增常用幣別</span><select id="c-add"><option value="">選擇…</option>' + optionList(ALL_CURRENCIES.filter(c => !st.favoriteCurrencies.includes(c)).map(c => [c, c + ' ' + currencyName(c)]), '') + '</select></label>' +
          '</div><div class="sec-f">常用幣別會出現在新增交易的幣別選單最上方。</div></div>';
        const save = async () => { await saveSettings(); rerenderTop(); };
        $('#c-def', body).onchange = ev => { st.defaultCurrency = ev.target.value; save(); };
        $('#c-ctry', body).onchange = ev => { st.defaultCountry = ev.target.value; save(); };
        $('#c-add', body).onchange = ev => { if (ev.target.value) { st.favoriteCurrencies.push(ev.target.value); save(); } };
        $$('[data-rm]', body).forEach(b => { b.onclick = () => { const c = st.favoriteCurrencies.splice(+b.dataset.rm, 1)[0]; if (c === st.defaultCurrency) st.defaultCurrency = 'TWD'; save(); }; });
        $$('[data-up]', body).forEach(b => { b.onclick = () => { const i = +b.dataset.up; if (i > 0) { const a = st.favoriteCurrencies; [a[i - 1], a[i]] = [a[i], a[i - 1]]; save(); } }; });
      }
    });
  }

  function openCategorySettings() {
    let kind = 'expense';
    pushPage({
      title: '分類管理',
      right: { label: '＋新增', action: () => openCategoryEdit(null, kind) },
      render(body) {
        const list = S.categories.filter(c => c.kind === kind);
        body.innerHTML = '<div class="seg" data-k="kind"><button data-v="expense" class="' + (kind === 'expense' ? 'on' : '') + '">支出分類</button><button data-v="income" class="' + (kind === 'income' ? 'on' : '') + '">收入分類</button></div>' +
          '<div class="sec"><div class="group">' + list.map((c, i) => '<div class="row"><button class="k" style="border:0;background:none;text-align:left;padding:0" data-edit="' + c.id + '">' + esc(c.icon + ' ' + c.name) +
            ' <span class="muted small">' + S.entries.filter(e => e.categoryId === c.id).length + ' 筆</span></button>' +
            '<button class="iconbtn" data-up="' + i + '" aria-label="上移"' + (i === 0 ? ' disabled style="opacity:.3"' : '') + '>↑</button></div>').join('') +
          '</div><div class="sec-f">點分類可編輯或刪除。刪除分類後，相關交易會變成「未分類」，該分類的預算也會一併刪除。</div></div>';
        $$('[data-k=kind] button', body).forEach(b => { b.onclick = () => { kind = b.dataset.v; rerenderTop(); }; });
        $$('[data-edit]', body).forEach(b => { b.onclick = () => openCategoryEdit(catById(b.dataset.edit), kind); });
        $$('[data-up]', body).forEach(b => {
          b.onclick = async () => {
            const i = +b.dataset.up; if (i === 0) return;
            [list[i - 1], list[i]] = [list[i], list[i - 1]];
            list.forEach((c, j) => { c.sortOrder = j; });
            await DB.putMany('categories', list); sortData(); rerenderTop();
          };
        });
      }
    });
  }
  function openCategoryEdit(cat, kind) {
    const f = { name: cat ? cat.name : '', icon: cat ? cat.icon : '🏷️' };
    pushPage({
      title: cat ? '編輯分類' : '新增分類', leftLabel: '取消',
      right: {
        label: '儲存', action: async () => {
          const name = f.name.trim(); if (!name) { toast('請輸入分類名稱'); return; }
          const order = cat ? cat.sortOrder : Math.max(-1, ...S.categories.filter(c => c.kind === kind).map(c => c.sortOrder)) + 1;
          await upsert('categories', S.categories, Object.assign(cat || { id: uid(), kind: kind, sortOrder: order }, { name: name, icon: f.icon }));
          popPage();
        }
      },
      render(body) {
        body.innerHTML = '<div class="sec"><div class="sec-h"><span>名稱</span></div><div class="group"><label class="row"><input type="text" id="cat-name" style="text-align:left" value="' + esc(f.name) + '" placeholder="例如：咖啡"></label></div></div>' +
          '<div class="sec"><div class="sec-h"><span>圖示</span></div><div class="group"><div class="iconpick">' + ICONS.map(i => '<button data-i="' + i + '" class="' + (i === f.icon ? 'on' : '') + '">' + i + '</button>').join('') + '</div></div></div>' +
          (cat ? '<div class="sec"><div class="group"><button class="row center danger" data-k="del">刪除分類</button></div></div>' : '');
        const n = $('#cat-name', body); n.oninput = () => { f.name = n.value; };
        $$('[data-i]', body).forEach(b => { b.onclick = () => { f.icon = b.dataset.i; $$('[data-i]', body).forEach(x => x.classList.toggle('on', x === b)); }; });
        const del = $('[data-k=del]', body);
        if (del) del.onclick = async () => {
          if (!confirm('刪除分類「' + cat.name + '」？相關交易會變成「未分類」，該分類的預算也會刪除。')) return;
          for (const e of S.entries.filter(e => e.categoryId === cat.id)) { e.categoryId = null; await DB.put('entries', e); }
          for (const b of S.budgets.filter(b => b.categoryId === cat.id)) await remove('budgets', S.budgets, b.id);
          await remove('categories', S.categories, cat.id);
          await budgetsChanged();
          popPage();
        };
      }
    });
  }

  function openCardSettings() {
    pushPage({
      title: '卡片管理',
      right: { label: '＋新增', action: () => openCardEdit(null) },
      render(body) {
        body.innerHTML = (S.cards.length ? '' : '<div class="group"><div class="empty">尚未建立卡片。建立後，刷卡時可選擇卡片，並可為各卡設定不同手續費率。</div></div>') +
          '<div class="sec"><div class="group">' + S.cards.map(c => '<button class="row link" data-card="' + c.id + '"><span class="k"><b>' + esc(cardLabel(c)) + '</b> <span class="muted small">' + (c.kind === 'credit' ? '信用卡' : '金融卡') + '</span><br>' +
            '<span class="muted small">手續費 ' + PL.fmtPercent(c.customFeeRate !== null && c.customFeeRate !== undefined ? c.customFeeRate : S.settings.defaultFeeRate) + (c.customFeeRate !== null && c.customFeeRate !== undefined ? '' : '（預設）') +
            (c.closingDay ? '・結帳 ' + c.closingDay + ' 日' + (c.dueDay ? '・繳款 ' + c.dueDay + ' 日' : '') : '') + '</span>' +
            cardStatusChip(c) + '</span></button>').join('') + '</div></div>';
        $$('[data-card]', body).forEach(b => { b.onclick = () => openCardDetail(b.dataset.card); });
      }
    });
  }
  function openCardDetail(id) {
    pushPage({
      title: '卡片',
      right: { label: '編輯', action: () => openCardEdit(cardById(id)) },
      render(body, p) {
        const c = cardById(id); if (!c) { popPage(); return; }
        $('#pages .pbar h1').textContent = c.name;
        const items = S.entries.filter(e => e.cardId === id);
        const b = PL.cardBalance(items);
        const payments = items.filter(e => e.type === 'cardPayment');
        const stm = c.kind === 'credit' && c.closingDay ? PL.cardStatement(items, c.closingDay, c.dueDay || 0, today()) : null;
        const L = stm && stm.last;
        const statusText = L ? ({ none: '本期無帳款', paid: '✅ 已繳清', unpaid: '未繳', dueSoon: '⏰ 即將到期', overdue: '⚠️ 已逾期' })[L.status] : '';
        const dueText = L && L.due ? fmtDate(L.due) + (L.status === 'paid' || L.status === 'none' ? '' : L.daysLeft > 0 ? '（還有 ' + L.daysLeft + ' 天）' : L.daysLeft === 0 ? '（今天）' : '（逾期 ' + (-L.daysLeft) + ' 天）') : '未設定';
        body.innerHTML =
          (c.kind === 'credit' ? (stm ? '<div class="sec"><div class="sec-h"><span>上期帳單 ' + fmtDate(L.start).slice(5) + ' – ' + fmtDate(L.close).slice(5) + '</span><span>' + statusText + '</span></div><div class="group">' +
            '<div class="row"><span class="k">帳單金額（含手續費）</span><span class="v num">' + PL.fmtTWD(L.amount) + '</span></div>' +
            '<div class="row"><span class="k">結帳後已繳</span><span class="v num">' + PL.fmtTWD(L.paid) + '</span></div>' +
            '<div class="row"><b class="k">本期應繳</b><b class="num ' + (L.status === 'overdue' ? 'danger' : '') + '">' + PL.fmtTWD(L.remaining) + '</b></div>' +
            (() => {
              const pend = items.filter(x => (x.type === 'expense' || x.type === 'refund') && x.currency !== 'TWD' && !x.reconciled && x.date >= L.start && x.date <= L.close);
              return pend.length ? '<button class="row link" data-k="pendrec"><span class="k">🧾 外幣交易待對帳</span><span class="v">' + pend.length + ' 筆</span></button>' : '';
            })() +
            '<div class="row"><span class="k">繳款截止</span><span class="v ' + (L.status === 'overdue' ? 'danger' : L.status === 'dueSoon' ? 'accent' : '') + '">' + dueText + '</span></div>' +
            '</div></div>' +
            '<div class="sec"><div class="sec-h"><span>本期累計 ' + fmtDate(stm.current.start).slice(5) + ' – ' + fmtDate(stm.current.close).slice(5) + '（尚未結帳）</span></div><div class="group">' +
            '<div class="row"><span class="k">目前刷卡（含手續費）</span><span class="v num">' + PL.fmtTWD(stm.current.amount) + '</span></div></div>' +
            '<div class="sec-f">帳單金額依 App 內紀錄估算，實際以銀行帳單為準。結帳日之後的繳卡費會算在上期帳單。</div></div>'
            : '<div class="sec"><div class="group"><button class="row link" data-k="setcycle"><span class="k">📅 設定結帳日與繳款日</span><span class="v">依帳單週期對帳</span></button></div></div>') : '') +
          '<div class="sec"><div class="sec-h"><span>帳務概況（全部）</span></div><div class="group">' +
          '<div class="row"><span class="k">累計刷卡（含手續費）</span><span class="v num">' + PL.fmtTWD(b.charges) + '</span></div>' +
          '<div class="row"><span class="k">退款</span><span class="v num">' + PL.fmtTWD(b.refunds) + '</span></div>' +
          '<div class="row"><span class="k">已繳款</span><span class="v num">' + PL.fmtTWD(b.payments) + '</span></div>' +
          '<div class="row"><b class="k">估計未繳金額</b><b class="num">' + PL.fmtTWD(b.outstanding) + '</b></div>' +
          (c.kind === 'credit' ? '<button class="row accent" data-k="pay">✅ 記錄繳卡費' + (L && L.remaining > 0 ? '（帶入應繳 ' + PL.fmtTWD(L.remaining) + '）' : '') + '</button>' : '') +
          '</div><div class="sec-f">刷卡當下已記為支出；繳卡費只是轉帳，不再計入支出，避免重複計算。估計未繳 = 刷卡 − 退款 − 已繳款，僅供參考。</div></div>' +
          (payments.length ? '<div class="sec"><div class="sec-h"><span>繳款紀錄</span></div><div class="group">' + payments.map(entryRowHTML).join('') + '</div></div>' : '');
        const pay = $('[data-k=pay]', body);
        if (pay) pay.onclick = () => openForm(null, { type: 'cardPayment', cardId: id, amount: L && L.remaining > 0 ? L.remaining : null });
        const sc = $('[data-k=setcycle]', body); if (sc) sc.onclick = () => openCardEdit(c);
        const pr = $('[data-k=pendrec]', body);
        if (pr) pr.onclick = () => pushPage({
          title: '待對帳',
          render(b2) {
            const pend = S.entries.filter(x => x.cardId === id && (x.type === 'expense' || x.type === 'refund') && x.currency !== 'TWD' && !x.reconciled && x.date >= L.start && x.date <= L.close);
            b2.innerHTML = '<div class="sec"><div class="group">' + (pend.length ? pend.map(entryRowHTML).join('') : '<div class="empty"><b>全部對帳完成</b></div>') + '</div>' +
              '<div class="sec-f">點交易 →「依信用卡帳單調整實際金額」，輸入帳單上的新台幣金額與手續費。</div></div>';
            bindEntryRows(b2);
          }
        });
        bindEntryRows(body);
      }
    });
  }
  function openCardEdit(card) {
    const f = { name: card ? card.name : '', lastFour: card ? card.lastFour : '', kind: card ? card.kind : 'credit',
      closingDay: card && card.closingDay ? card.closingDay : 0, dueDay: card && card.dueDay ? card.dueDay : 0,
      custom: !!card && card.customFeeRate !== null && card.customFeeRate !== undefined,
      feeText: card && card.customFeeRate !== null && card.customFeeRate !== undefined ? String(PL.round(card.customFeeRate * 100, 4)) : '' };
    pushPage({
      title: card ? '編輯卡片' : '新增卡片', leftLabel: '取消',
      right: {
        label: '儲存', action: async () => {
          const name = f.name.trim(); if (!name) { toast('請輸入卡片別名'); return; }
          const pct = PL.parseNumber(f.feeText);
          const obj = Object.assign(card || { id: uid(), sortOrder: S.cards.length, createdAt: new Date().toISOString() },
            { name: name, lastFour: f.lastFour, kind: f.kind, customFeeRate: f.custom && pct !== null ? PL.round(pct / 100, 6) : null,
              closingDay: f.kind === 'credit' ? f.closingDay : 0, dueDay: f.kind === 'credit' && f.closingDay ? f.dueDay : 0 });
          await upsert('cards', S.cards, obj);
          popPage();
        }
      },
      render(body) {
        body.innerHTML = '<div class="sec"><div class="sec-h"><span>卡片</span></div><div class="group">' +
          '<label class="row"><span class="k">別名</span><input type="text" id="cd-name" value="' + esc(f.name) + '" placeholder="例如：國泰 CUBE"></label>' +
          '<label class="row"><span class="k">末四碼（選填）</span><input inputmode="numeric" id="cd-last" maxlength="4" value="' + esc(f.lastFour) + '"></label>' +
          '<label class="row"><span class="k">種類</span><select id="cd-kind">' + optionList([['credit', '信用卡'], ['debit', '金融卡']], f.kind) + '</select></label></div></div>' +
          (f.kind === 'credit' ? '<div class="sec"><div class="sec-h"><span>帳單週期</span></div><div class="group">' +
            '<label class="row"><span class="k">結帳日</span><select id="cd-close">' + optionList([['0', '未設定']].concat(Array.from({ length: 31 }, (_, i) => [String(i + 1), i === 30 ? '每月月底（31 日）' : '每月 ' + (i + 1) + ' 日'])), String(f.closingDay)) + '</select></label>' +
            (f.closingDay ? '<label class="row"><span class="k">繳款截止日</span><select id="cd-due">' + optionList([['0', '未設定']].concat(Array.from({ length: 31 }, (_, i) => [String(i + 1), '每月 ' + (i + 1) + ' 日'])), String(f.dueDay)) + '</select></label>' : '') +
            '</div><div class="sec-f">依信用卡帳單填寫。設定後會依帳單週期計算「本期應繳」，並在繳款截止前 3 天與逾期時提醒。繳款日小於或等於結帳日時，視為次月繳款。</div></div>' : '') +
          '<div class="sec"><div class="sec-h"><span>刷卡手續費</span></div><div class="group">' + switchHTML('cd-custom', f.custom, '使用個別手續費率') +
          (f.custom ? '<label class="row"><span class="k">費率</span><input inputmode="decimal" id="cd-fee" value="' + esc(f.feeText) + '" placeholder="1.5"><span>%</span></label>' : '') +
          '</div><div class="sec-f">未開啟時使用預設費率 ' + PL.fmtPercent(S.settings.defaultFeeRate) + '。</div></div>' +
          (card ? '<div class="sec"><div class="group"><button class="row center danger" data-k="del">刪除卡片</button></div></div>' : '');
        $('#cd-name', body).oninput = ev => { f.name = ev.target.value; };
        $('#cd-last', body).oninput = ev => { ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, 4); f.lastFour = ev.target.value; };
        $('#cd-kind', body).onchange = ev => { f.kind = ev.target.value; rerenderTop(); };
        const cl = $('#cd-close', body); if (cl) cl.onchange = () => { f.closingDay = +cl.value; rerenderTop(); };
        const du = $('#cd-due', body); if (du) du.onchange = () => { f.dueDay = +du.value; };
        $('#cd-custom', body).onchange = ev => { f.custom = ev.target.checked; rerenderTop(); };
        const fee = $('#cd-fee', body); if (fee) fee.oninput = () => { f.feeText = fee.value; };
        const del = $('[data-k=del]', body);
        if (del) del.onclick = async () => {
          if (!confirm('刪除卡片「' + card.name + '」？相關交易會保留，但不再標示卡片。')) return;
          for (const e of S.entries.filter(e => e.cardId === card.id)) { e.cardId = null; await DB.put('entries', e); }
          await remove('cards', S.cards, card.id);
          popPages(2);
        };
      }
    });
  }

  function openFeeSettings() {
    pushPage({
      title: '刷卡手續費',
      render(body) {
        const st = S.settings;
        body.innerHTML = '<div class="sec"><div class="group"><label class="row"><span class="k">預設費率</span><input inputmode="decimal" id="fee-rate" value="' + PL.round(st.defaultFeeRate * 100, 4) + '"><span>%</span></label></div>' +
          '<div class="sec-f">可在「卡片管理」為個別卡片設定不同費率；個別費率優先。修改費率只影響之後新增或重新編輯的交易，已保存的交易不會改變。</div></div>' +
          '<div class="sec"><div class="sec-h"><span>適用範圍</span></div><div class="group">' + switchHTML('fee-debit', st.feeOnDebitCard, '金融卡也計算手續費') + switchHTML('fee-foreign', st.feeOnlyForeign, '僅外幣交易計算') + '</div></div>' +
          '<div class="sec"><div class="sec-h"><span>計算方式</span></div><div class="group"><div class="formula">① 外幣先換算新台幣：原幣金額 × 交易日匯率（小數 2 位）\n② 手續費 = 新台幣金額 × 費率，四捨五入至整數元\n③ 含手續費總額 = 新台幣金額 ＋ 手續費\n\n範例：USD 100 × 31.5 = NT$3,150\n      NT$3,150 × 3% = NT$95（94.5 四捨五入）\n      合計 NT$3,245</div></div>' +
          '<div class="sec-f">現金、電子支付不計手續費。實際帳單金額不同時，可在交易中開啟「手動調整手續費」。</div></div>';
        $('#fee-rate', body).oninput = ev => { const p = PL.parseNumber(ev.target.value); if (p !== null && p >= 0 && p <= 100) { st.defaultFeeRate = PL.round(p / 100, 6); saveSettings(); } };
        $('#fee-debit', body).onchange = ev => { st.feeOnDebitCard = ev.target.checked; saveSettings(); };
        $('#fee-foreign', body).onchange = ev => { st.feeOnlyForeign = ev.target.checked; saveSettings(); };
      }
    });
  }

  function openRateInfo() {
    pushPage({
      title: '匯率來源',
      render(body) {
        const item = (t, d) => '<div class="row stack"><b>' + t + '</b><span class="muted small">' + d + '</span></div>';
        body.innerHTML = '<div class="sec"><div class="sec-h"><span>查詢順序</span></div><div class="group">' +
          item('1. Currency API', 'fawazahmed0/exchange-api（jsDelivr CDN，另有 pages.dev 備援），免金鑰，涵蓋 150 種以上幣別，每日更新一次市場中間價，歷史資料自 2024 年 3 月起。') +
          item('2. 手動輸入', '查不到、早於 2024 年 3 月或手機離線時，請手動輸入匯率；交易會標示「手動匯率」。') + '</div></div>' +
          '<div class="sec"><div class="sec-h"><span>與 iOS 原生版的差異</span></div><div class="group">' +
          item('臺灣銀行牌告匯率', '臺銀網站不允許其他網頁直接讀取（CORS 限制），所以網頁版無法查詢臺銀牌告，改用 Currency API 的市場中間價；iOS 原生版仍優先使用臺銀「即期賣出／買入」。') + '</div></div>' +
          '<div class="sec"><div class="sec-h"><span>規則</span></div><div class="group">' +
          item('當天匯率', '當天或前一天的資料若尚未發布，會改用最新一筆，並顯示實際匯率日期。') +
          item('保存方式', '交易存檔時即保存匯率、匯率日期與來源，之後不會再變動。查過的匯率會暫存在手機上，同一天同一幣別不重複下載。') +
          item('限制', '來源為公開資料、非官方 API，格式可能變更；匯率僅供記帳參考，實際刷卡匯率以發卡銀行帳單為準。') + '</div></div>';
      }
    });
  }

  function openBudgetSettings() {
    pushPage({
      title: '預算週期與提醒',
      render(body) {
        const st = S.settings;
        const perm = 'Notification' in window ? Notification.permission : 'unsupported';
        body.innerHTML = '<div class="sec"><div class="sec-h"><span>預算週期</span></div><div class="group"><label class="row"><span class="k">每月起始日</span><select id="bs-day">' +
          optionList(Array.from({ length: 28 }, (_, i) => [String(i + 1), '每月 ' + (i + 1) + ' 日']), String(st.budgetStartDay)) + '</select></label></div>' +
          '<div class="sec-f">例如設定為 5 日，週期為每月 5 日至次月 4 日。起始日最多為 28 日。</div></div>' +
          '<div class="sec"><div class="sec-h"><span>提醒</span></div><div class="group">' + switchHTML('bs-on', st.budgetAlertsEnabled, '預算提醒') +
          '<label class="row"><span class="k">接近預算提醒</span><select id="bs-warn">' + optionList([50, 55, 60, 65, 70, 75, 80, 85, 90, 95].map(n => [String(n), n + '%']), String(st.warningPercent)) + '</select></label>' +
          '<div class="row"><span class="k">超支提醒</span><span class="v">100%（固定）</span></div>' +
          '<div class="row"><span class="k">系統通知</span><span class="v">' + ({ granted: '已允許', denied: '已封鎖', default: '尚未允許', unsupported: '不支援' })[perm] + '</span></div>' +
          (perm === 'default' ? '<div class="btnrow"><button class="btn primary" data-k="perm">允許通知</button></div>' : '') +
          '</div><div class="sec-f">總預算與各分類預算達到門檻時提醒，內容包含預算名稱、目前支出、預算金額與使用比例；同一週期、同一預算的每個門檻只提醒一次，新週期自動重設。' +
          'iPhone 需先把網頁「加入主畫面」並從主畫面開啟（iOS 16.4 以上），才能允許系統通知；未允許時改在 App 畫面上顯示提醒。網頁版只會在開啟 App 時檢查預算。</div></div>';
        $('#bs-day', body).onchange = async ev => { st.budgetStartDay = PL.clampDay(+ev.target.value); await saveSettings(); await budgetsChanged(); };
        $('#bs-on', body).onchange = async ev => { st.budgetAlertsEnabled = ev.target.checked; await saveSettings(); await evaluateBudgets(); };
        $('#bs-warn', body).onchange = async ev => { st.warningPercent = +ev.target.value; await saveSettings(); await budgetsChanged(); };
        const pb = $('[data-k=perm]', body);
        if (pb) pb.onclick = async () => { try { await Notification.requestPermission(); } catch (e) { /* 忽略 */ } rerenderTop(); };
      }
    });
  }

  function openTrips() {
    pushPage({
      title: '旅程標籤',
      render(body) {
        const st = S.settings;
        const trips = tripNames().map(name => {
          const items = S.entries.filter(e => e.trip === name);
          const s = PL.summarize(items);
          const dates = items.map(e => e.date).sort();
          return { name, n: items.length, s, from: dates[0], to: dates[dates.length - 1] };
        });
        const used = trips.filter(t => t.n || (st.tripBudgets || {})[t.name]);
        body.innerHTML = '<div class="sec"><div class="sec-h"><span>進行中的旅程</span></div><div class="group">' +
          '<label class="row"><span class="k">新交易自動標記</span><input type="text" id="t-active" list="dl-trips2" autocomplete="off" value="' + esc(st.activeTrip || '') + '" placeholder="例如：2026 東京"></label>' +
          '<datalist id="dl-trips2">' + tripNames().map(t => '<option value="' + esc(t) + '"></option>').join('') + '</datalist>' +
          (st.activeTrip ? '<button class="row center accent" data-k="end">結束旅程（之後的交易不再自動標記）</button>' : '') +
          '</div><div class="sec-f">出發前輸入旅程名稱，之後新增的交易都會自動標上這個旅程；每筆交易也可以在表單中個別修改。</div></div>' +
          '<div class="sec"><div class="sec-h"><span>所有旅程</span></div><div class="group">' +
          (used.length ? used.map(t => '<button class="row link" data-trip="' + esc(t.name) + '"><span class="k"><b>🧳 ' + esc(t.name) + '</b><br><span class="muted small">' +
            (t.n ? fmtDate(t.from) + ' – ' + fmtDate(t.to) + '・' + t.n + ' 筆' : '尚無交易') +
            ((st.tripBudgets || {})[t.name] ? '・預算 ' + PL.fmtTWD(st.tripBudgets[t.name]) + '（' + tripUsage(t.name).percent + '%）' : '') + '</span></span><span class="v num">支出 ' + PL.fmtTWD(t.s.expense) + '<br><span class="small">手續費 ' + PL.fmtTWD(t.s.fee) + '</span></span></button>').join('')
            : '<div class="row muted">尚無旅程。設定進行中的旅程後新增交易，或在交易表單填入旅程。</div>') +
          '</div><div class="sec-f">點旅程可設定旅程總預算，或在報表中查看該旅程的分類、國家、手續費等統計。</div></div>';
        const act = $('#t-active', body);
        act.onchange = async () => { st.activeTrip = act.value.trim(); await saveSettings(); rerenderTop(); toast(st.activeTrip ? '新交易會標記為「' + st.activeTrip + '」' : '已取消自動標記'); };
        const end = $('[data-k=end]', body);
        if (end) end.onclick = async () => { st.activeTrip = ''; await saveSettings(); rerenderTop(); toast('旅程已結束'); };
        $$('[data-trip]', body).forEach(b => { b.onclick = () => openTripDetail(b.dataset.trip); });
      }
    });
  }

  function openInstallHelp() {
    pushPage({
      title: '安裝與離線使用',
      render(body) {
        body.innerHTML = '<div class="sec"><div class="group help"><div class="row stack">' +
          (isStandalone() ? '<p>✅ 已從主畫面開啟，可以離線使用。</p>' : '') +
          '<b>iPhone（Safari）</b><ol><li>用 Safari 開啟這個網址</li><li>點下方「分享」按鈕</li><li>選「加入主畫面」→「新增」</li><li>之後從主畫面圖示開啟</li></ol>' +
          '<b>Android（Chrome）</b><ol><li>點右上角選單</li><li>選「安裝應用程式」或「加到主畫面」</li></ol></div></div></div>' +
          '<div class="sec"><div class="sec-h"><span>離線使用</span></div><div class="group help"><div class="row stack"><p>第一次開啟後，App 本身會存到手機上，沒有網路也能記帳、查紀錄、看報表與預算。</p><p>只有「查詢匯率」需要網路；離線時請手動輸入匯率，之後可在交易中按「改回自動查詢」。</p></div></div></div>' +
          '<div class="sec"><div class="sec-h"><span>資料保存</span></div><div class="group help"><div class="row stack"><p>記帳資料與收據照片存在這台裝置瀏覽器的本機資料庫（IndexedDB），不會上傳。</p>' +
          '<p>⚠️ 請從主畫面圖示使用：在一般 Safari 分頁中，若網站長時間未開啟，iOS 可能自動清除網站資料。加入主畫面後的 App 不受此限制。</p>' +
          '<p>⚠️ 主畫面 App 與 Safari 分頁的資料是分開的；刪除主畫面 App、清除 Safari 網站資料或換手機，資料都不會自動保留，請定期到「備份與還原」匯出備份檔。</p></div></div></div>';
      }
    });
  }

  // ======================= 備份與還原 =======================
  const isoFromDay = k => { const d = PL.parseDay(k); d.setHours(12, 0, 0, 0); return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); };
  const isoNoMs = s => { try { return new Date(s || Date.now()).toISOString().replace(/\.\d{3}Z$/, 'Z'); } catch (e) { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); } };
  const dayFromISO = s => { const d = new Date(s); return isNaN(d) ? today() : PL.dayKey(d); };
  const numStr = n => String(n === null || n === undefined ? 0 : n);
  const blobToBase64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
  const base64ToBlob = (b64, type) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: type || 'image/jpeg' }); };

  /** 與 iOS 原生版相同的備份格式（formatVersion 1），兩邊可互相還原 */
  async function buildBackup() {
    const st = S.settings;
    const receipts = [];
    for (const name of [...new Set(S.entries.map(e => e.receipt).filter(Boolean))]) {
      const r = await DB.get('receipts', name);
      if (r && r.blob) receipts.push({ fileName: name, data: await blobToBase64(r.blob) });
    }
    return {
      formatVersion: 1, app: 'PocketLedger', exportedAt: isoNoMs(), appVersion: 'web-1.7',
      settings: { defaultFeeRate: numStr(st.defaultFeeRate), feeOnDebitCard: st.feeOnDebitCard, feeOnlyForeign: st.feeOnlyForeign, favoriteCurrencies: st.favoriteCurrencies, defaultCurrency: st.defaultCurrency, defaultCountry: st.defaultCountry, budgetStartDay: st.budgetStartDay, budgetAlertsEnabled: st.budgetAlertsEnabled, warningPercent: st.warningPercent, activeTrip: st.activeTrip || '', tripBudgets: st.tripBudgets || {}, recurring: st.recurring || [] },
      categories: S.categories.map(c => ({ id: c.id, name: c.name, icon: ICON_REVERSE[c.icon] || c.icon, kind: c.kind, sortOrder: c.sortOrder })),
      cards: S.cards.map(c => Object.assign({ id: c.id, name: c.name, lastFour: c.lastFour || '', kind: c.kind, sortOrder: c.sortOrder, createdAt: isoNoMs(c.createdAt) }, c.customFeeRate !== null && c.customFeeRate !== undefined ? { customFeeRate: numStr(c.customFeeRate) } : {},
        c.closingDay ? { closingDay: c.closingDay, dueDay: c.dueDay || 0 } : {})),
      budgets: S.budgets.map(b => Object.assign({ isTotal: b.isTotal, amount: numStr(b.amount) }, b.categoryId ? { categoryID: b.categoryId } : {})),
      alertRecords: S.alerts.map(a => ({ periodKey: a.periodKey, budgetKey: a.budgetKey, threshold: a.threshold, sentAt: isoNoMs(a.sentAt) })),
      entries: S.entries.slice().reverse().map(e => Object.assign({
        id: e.id, type: e.type, amount: numStr(e.amount), currency: e.currency, date: isoFromDay(e.date),
        countryCode: e.countryCode, paymentMethod: e.method, merchant: e.merchant || '', note: e.note || '',
        exchangeRate: numStr(e.rate), rateDate: isoFromDay(e.rateDate || e.date), rateSource: e.rateSource, rateDetail: e.rateDetail || '',
        amountTWD: numStr(e.amountTWD), includesFee: !!e.includesFee, feeRate: numStr(e.feeRate), feeTWD: numStr(e.feeTWD), isFeeManual: !!e.isFeeManual,
        createdAt: isoNoMs(e.createdAt), updatedAt: isoNoMs(e.updatedAt)
      }, e.trip ? { trip: e.trip } : {},
        e.advAmount ? { advAmount: numStr(e.advAmount), advWho: e.advWho || '', advTWD: numStr(e.advTWD), advFeeTWD: numStr(e.advFeeTWD), advSettled: !!e.advSettled, advSettledDate: e.advSettledDate || null } : {},
        e.reconciled ? { reconciled: true, estimate: e.estimate || null } : {},
        e.recurringId ? { recurringId: e.recurringId } : {}, e.categoryId ? { categoryID: e.categoryId } : {}, e.cardId ? { cardID: e.cardId } : {}, e.receipt ? { receiptFileName: e.receipt } : {})),
      receipts: receipts
    };
  }
  function validateBackup(b) {
    if (!b || b.app !== 'PocketLedger' || !Array.isArray(b.entries)) throw new Error('不是有效的記帳備份檔。');
    if (b.formatVersion > 1) throw new Error('備份檔版本（' + b.formatVersion + '）較新，請先更新 App。');
    return b;
  }
  async function restoreBackup(b) {
    const num = s => { const n = Number(s); return Number.isFinite(n) ? n : 0; };
    const st = Object.assign(defaultSettings(), {
      defaultFeeRate: num(b.settings.defaultFeeRate), feeOnDebitCard: !!b.settings.feeOnDebitCard, feeOnlyForeign: !!b.settings.feeOnlyForeign,
      favoriteCurrencies: b.settings.favoriteCurrencies || DEFAULT_FAVORITES.slice(), defaultCurrency: b.settings.defaultCurrency || 'TWD',
      defaultCountry: b.settings.defaultCountry || 'TW', budgetStartDay: PL.clampDay(b.settings.budgetStartDay),
      budgetAlertsEnabled: b.settings.budgetAlertsEnabled !== false, warningPercent: b.settings.warningPercent || 80,
      activeTrip: b.settings.activeTrip || '', tripBudgets: b.settings.tripBudgets || {}, recurring: b.settings.recurring || []
    });
    const cats = (b.categories || []).map(c => ({ id: c.id, name: c.name, icon: ICON_MAP[c.icon] || (/^[a-z0-9.]+$/.test(c.icon) ? '🏷️' : c.icon), kind: c.kind === 'income' ? 'income' : 'expense', sortOrder: c.sortOrder || 0 }));
    const catIds = new Set(cats.map(c => c.id));
    const cards = (b.cards || []).map(c => ({ id: c.id, name: c.name, lastFour: c.lastFour || '', kind: c.kind === 'debit' ? 'debit' : 'credit', customFeeRate: c.customFeeRate !== undefined && c.customFeeRate !== null ? num(c.customFeeRate) : null, sortOrder: c.sortOrder || 0, createdAt: c.createdAt, closingDay: c.closingDay || 0, dueDay: c.dueDay || 0 }));
    const cardIds = new Set(cards.map(c => c.id));
    const budgets = (b.budgets || []).filter(x => x.isTotal || catIds.has(x.categoryID)).map(x => ({ id: uid(), isTotal: !!x.isTotal, categoryId: x.isTotal ? null : x.categoryID, amount: num(x.amount) }));
    const alerts = (b.alertRecords || []).map(a => ({ id: a.periodKey + '|' + a.budgetKey + '|' + a.threshold, periodKey: a.periodKey, budgetKey: a.budgetKey, threshold: a.threshold, sentAt: a.sentAt }));
    const entries = b.entries.map(d => ({
      id: d.id, type: d.type, amount: num(d.amount), currency: d.currency, date: dayFromISO(d.date),
      categoryId: catIds.has(d.categoryID) ? d.categoryID : null, countryCode: d.countryCode || 'TW', method: d.paymentMethod || 'other',
      cardId: cardIds.has(d.cardID) ? d.cardID : null, merchant: d.merchant || '', note: d.note || '',
      rate: num(d.exchangeRate) || 1, rateDate: d.rateDate ? dayFromISO(d.rateDate) : dayFromISO(d.date), rateSource: d.rateSource || 'manual', rateDetail: d.rateDetail || '',
      amountTWD: num(d.amountTWD), includesFee: !!d.includesFee, feeRate: num(d.feeRate), feeTWD: num(d.feeTWD), isFeeManual: !!d.isFeeManual,
      receipt: d.receiptFileName ? String(d.receiptFileName).split('/').pop() : null, createdAt: d.createdAt, updatedAt: d.updatedAt,
      trip: d.trip || '',
      advAmount: d.advAmount ? num(d.advAmount) : 0, advWho: d.advWho || '', advTWD: d.advTWD ? num(d.advTWD) : 0, advFeeTWD: d.advFeeTWD ? num(d.advFeeTWD) : 0,
      advSettled: !!d.advSettled, advSettledDate: d.advSettledDate || null, reconciled: !!d.reconciled, estimate: d.estimate || null, recurringId: d.recurringId || null
    }));
    const receipts = (b.receipts || []).map(r => ({ name: String(r.fileName).split('/').pop(), blob: base64ToBlob(r.data) }));
    await DB.clearAll();
    await DB.put('settings', st);
    await DB.putMany('categories', cats);
    await DB.putMany('cards', cards);
    await DB.putMany('budgets', budgets);
    await DB.putMany('alerts', alerts);
    await DB.putMany('receipts', receipts);
    await DB.putMany('entries', entries);
    await loadAll();
  }
  function markBackedUp() { lsSet('pl.lastBackup', today()); lsSet('pl.backupCount', S.entries.length); lsSet('pl.snoozeBackup', null); }
  /** 透過分享選單（iPhone：儲存到檔案、AirDrop）或下載存檔；回傳 'shared' | 'downloaded' | null */
  async function saveFile(name, text, mime) {
    const file = new File([text], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return null; }
    }
    // 下載備援：部分瀏覽器不支援中文檔名，改用英數檔名
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name.replace('記帳備份', 'PocketLedger-backup').replace('記帳明細', 'PocketLedger-transactions').replace('全部', 'all').replace(/[^\x20-\x7e]/g, '');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return 'downloaded';
  }
  async function exportBackup() {
    try {
      const json = JSON.stringify(await buildBackup(), null, 2);
      const r = await saveFile('記帳備份_' + today() + '.json', json, 'application/json');
      if (!r) return false;
      markBackedUp();
      toast(r === 'shared' ? '已匯出備份檔' : '備份檔已下載');
      return true;
    } catch (e) { toast('匯出失敗：' + e.message); return false; }
  }
  /** 匯出交易明細 CSV（Excel／Numbers 可開啟） */
  async function exportCSV(entries, label) {
    const rows = [['日期', '類型', '分類', '商家', '備註', '國家／地區', '付款方式', '卡片', '旅程', '幣別', '原幣金額',
      '匯率', '匯率日期', '匯率來源', '新台幣金額', '手續費', '含手續費總額', '對支出的影響', '代墊對象', '代墊金額（原幣）', '代墊新台幣', '代墊已收回', '已對帳']];
    entries.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
      rows.push([e.date, TYPES[e.type].t, e.type === 'cardPayment' ? '' : catName(e), e.merchant || '', e.note || '',
        regionName(e.countryCode), METHODS[e.method], cardById(e.cardId) ? cardById(e.cardId).name : '', e.trip || '',
        e.currency, e.amount, e.rate, e.rateDate || '', RATE_SOURCES[e.rateSource] || e.rateSource,
        e.amountTWD, e.feeTWD, PL.round(e.amountTWD + e.feeTWD, 2), PL.round(PL.netExpense(e), 2),
        e.advAmount ? e.advWho || '' : '', e.advAmount || '', e.advAmount ? PL.round(PL.advanceTWD(e), 2) : '', e.advAmount ? (e.advSettled ? '是' : '否') : '', e.reconciled ? '是' : '']);
    });
    try {
      const r = await saveFile('記帳明細_' + label + '.csv', PL.toCSV(rows), 'text/csv');
      if (r) toast('已匯出 ' + entries.length + ' 筆交易');
    } catch (e) { toast('匯出失敗：' + e.message); }
  }
  /** 備份提醒：有資料且（從未備份、超過 14 天，或新增 30 筆以上）時提醒；可延後 3 天 */
  const BACKUP_DAYS = 14, BACKUP_ENTRIES = 30;
  function backupReminder() {
    if (!S.entries.length) return null;
    const snooze = lsGet('pl.snoozeBackup', null);
    if (snooze && snooze > today()) return null;
    const last = lsGet('pl.lastBackup', null);
    const added = S.entries.length - lsGet('pl.backupCount', 0);
    if (!last) return '尚未備份過記帳資料。網頁版資料只存在這台裝置，建議現在匯出備份檔。';
    const days = Math.round((PL.parseDay(today()) - PL.parseDay(last)) / 86400000);
    if (days >= BACKUP_DAYS) return '已經 ' + days + ' 天沒有備份了（上次 ' + fmtDate(last) + '）。';
    if (added >= BACKUP_ENTRIES) return '上次備份後已新增 ' + added + ' 筆交易。';
    return null;
  }
  function openBackup() {
    pushPage({
      title: '備份與還原',
      render(body) {
        const nReceipts = S.entries.filter(e => e.receipt).length;
        const item = (t, d) => '<div class="row stack"><b>' + t + '</b><span class="muted small">' + d + '</span></div>';
        body.innerHTML = '<div class="sec"><div class="sec-h"><span>目前資料</span></div><div class="group">' +
          '<div class="row"><span class="k">交易筆數</span><span class="v">' + S.entries.length + '</span></div>' +
          '<div class="row"><span class="k">收據照片</span><span class="v">' + nReceipts + ' 張</span></div>' +
          '<div class="row"><span class="k">上次備份</span><span class="v">' + (lsGet('pl.lastBackup', null) ? fmtDate(lsGet('pl.lastBackup', null)) : '尚未備份') + '</span></div></div></div>' +
          '<div class="sec"><div class="group"><button class="row accent" data-k="export">⬆️ 匯出備份檔</button>' +
          '<button class="row accent" data-k="csv">📄 匯出全部交易（CSV，可用 Excel 開啟）</button>' +
          '<label class="row accent filebtn" style="position:relative">⬇️ 從備份檔還原<input type="file" accept=".json,application/json" id="bk-file"></label></div>' +
          '<div class="sec-f">還原會以備份內容「完整取代」目前所有資料（交易、分類、卡片、預算、設定與收據照片）。</div></div>' +
          '<div class="sec"><div class="sec-h"><span>說明</span></div><div class="group">' +
          item('CSV 明細', 'CSV 只用來在 Excel／Numbers 分析，不含收據照片，也不能用來還原；還原請使用備份檔（JSON）。') +
          item('檔案格式', '單一 JSON 檔（例如「記帳備份_2026-11-18.json」），包含記帳紀錄、分類、卡片、預算、提醒狀態、設定，以及內嵌的收據照片。格式與 iOS 原生版相同，可以互相還原。') +
          item('儲存位置', '匯出時會開啟分享選單：選「儲存到檔案」可存到「我的 iPhone」、iCloud 雲碟等，也可以用 AirDrop 傳到電腦。App 本身不會上傳任何資料。') +
          item('加密', '備份檔未加密，內容可被任何人讀取（包括收據照片）。請存放在你信任的位置，不要公開分享。') +
          item('App 鎖定', '密碼與 Face ID 設定不包含在備份檔；在新裝置還原後請重新設定。') +
          item('更換手機或刪除 App', '網頁版資料只存在目前這個瀏覽器／主畫面 App 中，換手機、刪除主畫面 App 或清除 Safari 網站資料都會遺失，請先匯出備份檔，再到新裝置還原。') + '</div></div>';
        $('[data-k=export]', body).onclick = async () => { await exportBackup(); rerenderTop(); };
        $('[data-k=csv]', body).onclick = () => exportCSV(S.entries, '全部_' + today());
        const fi = $('#bk-file', body);
        fi.onchange = async () => {
          const file = fi.files && fi.files[0]; if (!file) return;
          try {
            const b = validateBackup(JSON.parse(await file.text()));
            const when = b.exportedAt ? fmtDate(dayFromISO(b.exportedAt)) : '未知';
            if (!confirm('確定要還原？\n備份時間：' + when + '\n交易 ' + b.entries.length + ' 筆、收據 ' + (b.receipts || []).length + ' 張。\n目前裝置上的資料將被完全取代。')) { fi.value = ''; return; }
            await restoreBackup(b);
            closeAllPages();
            toast('還原完成：共 ' + b.entries.length + ' 筆交易');
          } catch (e) { toast(e instanceof SyntaxError ? '不是有效的記帳備份檔。' : e.message); fi.value = ''; }
        };
      }
    });
  }

  // ======================= App 鎖定 =======================
  function lockConfig() { return lsGet('pl.lock', { mode: 'off' }); }
  function setLockConfig(c) { lsSet('pl.lock', c); }
  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const randHex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('');
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
  async function verifyPasscode(code) { const c = lockConfig(); return !!c.hash && (await sha256(c.salt + code)) === c.hash; }
  async function biometricAvailable() {
    try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; }
  }
  /** 以 WebAuthn 平台驗證器（Face ID／Touch ID）建立本機憑證，只用來確認是本人 */
  async function registerBiometric() {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: '多幣記帳', id: location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: '多幣記帳', displayName: '多幣記帳 App 鎖定' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60000
      }
    });
    return b64url(cred.rawId);
  }
  async function verifyBiometric() {
    const c = lockConfig(); if (!c.credId) return false;
    try {
      const r = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: fromB64url(c.credId) }], userVerification: 'required', timeout: 60000 } });
      return !!r;
    } catch (e) { return false; }
  }
  function showLock() {
    const c = lockConfig();
    if (c.mode === 'off') return;
    const host = $('#lock');
    passcodePad(host, '輸入 App 密碼', async code => {
      if (await verifyPasscode(code)) { host.hidden = true; host.replaceChildren(); return true; }
      return false;
    }, c.mode === 'faceid' ? { label: '使用 Face ID 解鎖', run: async () => { if (await verifyBiometric()) { host.hidden = true; host.replaceChildren(); } } } : null, '🔒', '多幣記帳已鎖定');
    host.hidden = false;
  }
  /** 6 位數密碼鍵盤；onDone 回傳 true 表示通過 */
  function passcodePad(host, title, onDone, bio, logo, heading, errText) {
    let code = '';
    host.innerHTML = '<div class="lockbox">' + (logo ? '<div class="logo">' + logo + '</div>' : '') + (heading ? '<b style="font-size:19px">' + esc(heading) + '</b>' : '') +
      '<div>' + esc(title) + '</div><div class="dots">' + '<i></i>'.repeat(6) + '</div><div class="lockerr"></div>' +
      '<div class="pad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k ? '<button data-p="' + k + '" class="' + (k === '⌫' ? 'ghost' : '') + '" aria-label="' + (k === '⌫' ? '刪除' : k) + '">' + k + '</button>' : '<span></span>').join('') + '</div>' +
      (bio ? '<button class="btn" data-k="bio">' + esc(bio.label) + '</button>' : '') + '</div>';
    const dots = $$('.dots i', host), err = $('.lockerr', host);
    const draw = () => dots.forEach((d, i) => d.classList.toggle('f', i < code.length));
    $$('[data-p]', host).forEach(b => {
      b.onclick = async () => {
        const k = b.dataset.p;
        if (k === '⌫') { code = code.slice(0, -1); draw(); return; }
        if (code.length >= 6) return;
        err.textContent = ''; code += k; draw();
        if (code.length === 6) {
          const ok = await onDone(code);
          if (!ok) { err.textContent = errText || '密碼錯誤，請再試一次'; if (navigator.vibrate) navigator.vibrate(80); }
          code = ''; draw();
        }
      };
    });
    if (bio) { $('[data-k=bio]', host).onclick = bio.run; }
  }
  function openLockSettings() {
    pushPage({
      title: 'App 鎖定',
      async render(body) {
        const c = lockConfig();
        const bioOK = await biometricAvailable();
        const opt = (m, label, disabled) => '<button class="row" data-m="' + m + '"' + (disabled ? ' disabled style="opacity:.45"' : '') + '><span class="k">' + label + '</span>' + (c.mode === m ? '<span class="accent">✓</span>' : '') + '</button>';
        body.innerHTML = '<div class="sec"><div class="sec-h"><span>鎖定方式</span></div><div class="group">' +
          opt('off', '不鎖定') + opt('passcode', 'App 密碼（6 位數）') + opt('faceid', 'Face ID／Touch ID（以 App 密碼備援）', !bioOK) + '</div>' +
          '<div class="sec-f">' + (bioOK ? '啟用 Face ID 時需同時設定 6 位數 App 密碼，作為辨識失敗時的備援。App 切到背景後會自動上鎖。Face ID 透過瀏覽器的通行金鑰（passkey）功能驗證，系統可能會把它存到 iCloud 鑰匙圈；這把金鑰只用來確認是本人，不含任何記帳資料。' :
            '此裝置或瀏覽器目前無法使用 Face ID（未支援或未設定），請改用 App 密碼。') + '</div></div>' +
          (c.mode !== 'off' ? '<div class="sec"><div class="group"><button class="row accent" data-k="change">變更 App 密碼</button></div><div class="sec-f">密碼只存在這台裝置，不包含在備份檔。忘記密碼又無法使用 Face ID 時，只能清除網站資料（記帳資料會一併刪除），請定期備份。</div></div>' : '');
        $$('[data-m]', body).forEach(b => { b.onclick = () => selectMode(b.dataset.m); });
        const ch = $('[data-k=change]', body);
        if (ch) ch.onclick = () => verifyThen(() => setupPasscode(code => { const cc = lockConfig(); cc.salt = randHex(16); sha256(cc.salt + code).then(h => { cc.hash = h; setLockConfig(cc); toast('已變更 App 密碼'); }); }));
      }
    });
    function selectMode(m) {
      const c = lockConfig();
      if (m === c.mode) return;
      if (m === 'off') return verifyThen(() => { setLockConfig({ mode: 'off' }); rerenderTop(); toast('已關閉 App 鎖定'); });
      const enable = async code => {
        const cc = code ? { mode: m, salt: randHex(16) } : Object.assign(lockConfig(), { mode: m });
        if (code) cc.hash = await sha256(cc.salt + code);
        if (m === 'faceid') {
          try { cc.credId = await registerBiometric(); } catch (e) { toast('無法啟用 Face ID：' + (e.message || '已取消')); setLockConfig(Object.assign(cc, { mode: 'passcode' })); rerenderTop(); return; }
        }
        setLockConfig(cc); rerenderTop(); toast('已啟用 App 鎖定');
      };
      if (c.mode === 'off' || !c.hash) setupPasscode(enable);
      else verifyThen(() => enable(null));
    }
  }
  function verifyThen(fn) {
    const c = lockConfig();
    pushPage({
      title: '驗證身分', leftLabel: '取消',
      render(body) {
        passcodePad(body, '輸入目前的 App 密碼', async code => {
          if (await verifyPasscode(code)) { popPage(); fn(); return true; }
          return false;
        }, c.mode === 'faceid' ? { label: '使用 Face ID 驗證', run: async () => { if (await verifyBiometric()) { popPage(); fn(); } } } : null);
      }
    });
  }
  function setupPasscode(onDone) {
    let first = null;
    pushPage({
      title: '設定 App 密碼', leftLabel: '取消',
      render(body) {
        passcodePad(body, first ? '再次輸入以確認' : '設定 6 位數 App 密碼', async code => {
          if (!first) { first = code; rerenderTop(); return true; }
          if (code !== first) { first = null; setTimeout(rerenderTop, 900); return false; }
          popPage(); await onDone(code); return true;
        }, null, null, null, '兩次輸入不一致，請重新設定');
      }
    });
  }

  // ======================= 分頁切換 =======================
  const RENDERERS = { home: renderHome, list: renderList, reports: renderReports, budget: renderBudget, settings: renderSettings };
  function refreshView() {
    revokeURLs();
    const v = $('#view');
    const y = window.scrollY;
    RENDERERS[S.tab](v);
    window.scrollTo(0, y);
  }
  function switchTab(tab) {
    S.tab = tab;
    $$('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    lsSet('pl.tab', tab);
    RENDERERS[tab]($('#view'));
    window.scrollTo(0, 0);
  }

  // ======================= 啟動 =======================
  async function start() {
    showLock();
    try { await loadAll(); } catch (e) {
      $('#view').innerHTML = '<div class="empty"><b>無法開啟本機資料庫</b>請確認瀏覽器允許網站資料儲存（Safari 私密瀏覽模式無法使用）。</div>';
      return;
    }
    $$('.tabbar button').forEach(b => { b.onclick = () => switchTab(b.dataset.tab); });
    const saved = lsGet('pl.tab', 'home');
    switchTab(RENDERERS[saved] ? saved : 'home');
    await runRecurring();
    evaluateBudgets();
    setTimeout(prefetchRates, 2000);
    window.addEventListener('online', () => { prefetchRates(); if (!stack.length) refreshView(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { if (lockConfig().mode !== 'off' && $('#lock').hidden) showLock(); }
      else { runRecurring().then(evaluateBudgets).then(() => { if (!stack.length) refreshView(); }); prefetchRates(); }
    });
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 離線快取不可用時仍可線上使用 */ });
    }
  }
  start();
  // 測試用
  globalThis.__PL_APP__ = { S, buildBackup, restoreBackup, evaluateBudgets, runRecurring, lastRates };
})();
