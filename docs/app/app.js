/* 多幣記帳 網頁版（PWA）主程式 */
(function () {
  'use strict';
  const PL = globalThis.PL, DB = globalThis.DB;

  // ======================= 常數 =======================
  const TYPES = {
    expense: { t: '支出', sign: '-' }, income: { t: '收入', sign: '+' },
    refund: { t: '退款', sign: '+' }, cardPayment: { t: '繳卡費', sign: '' }
  };
  const METHODS = { cash: '現金', creditCard: '信用卡', debitCard: '金融卡', ePayment: '電子支付', other: '其他' };
  const METHOD_ICONS = { cash: '💵', creditCard: '💳', debitCard: '🏧', ePayment: '📱', other: '🔹' };
  const RATE_SOURCES = { base: '新台幣（免換算）', bankOfTaiwan: '臺灣銀行牌告匯率', currencyAPI: 'Currency API（市場中間價）', manual: '手動輸入匯率' };
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

  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 忽略 */ } };

  // ======================= 狀態 =======================
  const S = {
    entries: [], categories: [], cards: [], budgets: [], alerts: [], settings: null,
    tab: 'home',
    list: { search: '', filter: emptyFilter() },
    report: { mode: 'month', anchor: today(), start: PL.addMonths(today(), -1), end: today(), dim: 'category', filter: emptyFilter() },
    budgetOffset: 0
  };
  function emptyFilter() { return { types: [], currencies: [], countries: [], categories: [], methods: [], cards: [], useDates: false, from: PL.addMonths(today(), -1), to: today() }; }
  function filterCount(f) {
    return ['types', 'currencies', 'countries', 'categories', 'methods', 'cards'].filter(k => f[k].length).length + (f.useDates ? 1 : 0);
  }
  function matchFilter(e, f) {
    if (f.types.length && !f.types.includes(e.type)) return false;
    if (f.currencies.length && !f.currencies.includes(e.currency)) return false;
    if (f.countries.length && !f.countries.includes(e.countryCode)) return false;
    if (f.categories.length && !f.categories.includes(e.categoryId)) return false;
    if (f.methods.length && !f.methods.includes(e.method)) return false;
    if (f.cards.length && !f.cards.includes(e.cardId)) return false;
    if (f.useDates && (e.date < f.from || e.date > f.to)) return false;
    return true;
  }

  const defaultSettings = () => ({
    key: 'main', defaultFeeRate: 0.03, feeOnDebitCard: false, feeOnlyForeign: false,
    favoriteCurrencies: DEFAULT_FAVORITES.slice(), defaultCurrency: 'TWD', defaultCountry: 'TW',
    budgetStartDay: 1, budgetAlertsEnabled: true, warningPercent: 80
  });
  const catById = id => S.categories.find(c => c.id === id);
  const cardById = id => S.cards.find(c => c.id === id);
  const catName = e => e.type === 'cardPayment' ? '信用卡繳款' : (catById(e.categoryId) ? catById(e.categoryId).name : '未分類');
  const catIcon = e => e.type === 'cardPayment' ? '💳' : (catById(e.categoryId) ? catById(e.categoryId).icon : '❔');
  const cardLabel = c => c.lastFour ? c.name + '（' + c.lastFour + '）' : c.name;
  const entryTitle = e => e.type === 'cardPayment' ? '信用卡繳款' + (cardById(e.cardId) ? '・' + cardById(e.cardId).name : '') : (e.merchant || catName(e));

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
  async function lookupRate(code, dateKey) {
    const target = dateKey > today() ? today() : dateKey;
    const ck = code + '|' + target;
    if (rateCache[ck]) return rateCache[ck];
    if (target < '2024-03-02') throw new Error('資料來源只有 2024 年 3 月之後的匯率，請手動輸入匯率。');
    if (navigator.onLine === false) throw new Error('目前無法連線，請手動輸入匯率。');
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
          return q;
        }
      }
    }
    throw new Error(networkFail === attempts ? '目前無法連線，請手動輸入匯率。' : '查無該日匯率，請手動輸入匯率。');
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
  function pushPage(p) { stack.push(p); renderPages(); $('#pages').scrollTop = 0; }
  function popPage() { const p = stack.pop(); if (p && p.onClose) p.onClose(); renderPages(); refreshView(); }
  function closeAllPages() { while (stack.length) { const p = stack.pop(); if (p.onClose) p.onClose(); } renderPages(); refreshView(); }
  function renderPages() {
    const host = $('#pages');
    if (!stack.length) { host.hidden = true; host.replaceChildren(); document.body.style.overflow = ''; return; }
    const p = stack[stack.length - 1];
    const el = document.createElement('div');
    el.className = 'page';
    el.innerHTML = '<header class="pbar"><button class="l" data-k="back">' + esc(p.leftLabel || (stack.length > 1 ? '‹ 返回' : '關閉')) + '</button>' +
      '<h1>' + esc(p.title) + '</h1>' +
      (p.right ? '<button class="r" data-k="right">' + esc(p.right.label) + '</button>' : '<span></span>') + '</header><div class="pbody"></div>';
    $('[data-k=back]', el).onclick = () => popPage();
    if (p.right) $('[data-k=right]', el).onclick = () => p.right.action();
    host.replaceChildren(el);
    host.hidden = false;
    document.body.style.overflow = 'hidden';
    p.render($('.pbody', el), p, el);
  }
  function rerenderTop() { if (stack.length) renderPages(); }
  function setRightEnabled(enabled) { const b = $('#pages [data-k=right]'); if (b) b.disabled = !enabled; }

  // ======================= 共用片段 =======================
  function entryRowHTML(e) {
    const t = TYPES[e.type];
    const foreign = e.currency !== 'TWD';
    let sub = [];
    if (e.type !== 'cardPayment') { sub.push(flag(e.countryCode)); sub.push(cardById(e.cardId) ? cardById(e.cardId).name : METHODS[e.method]); }
    if (e.type === 'refund') sub.push('退款');
    if (foreign && e.rateSource === 'manual') sub.push('手動匯率');
    let second = foreign ? '≈ ' + PL.fmtTWD(e.amountTWD) : '';
    if (e.feeTWD) second += (second ? ' ' : '') + '＋費 ' + PL.fmtTWD(e.feeTWD);
    const cls = e.type === 'income' || e.type === 'refund' ? 'pos' : (e.type === 'cardPayment' ? 'muted' : '');
    return '<button class="erow" data-entry="' + esc(e.id) + '">' +
      '<span class="eicon">' + esc(catIcon(e)) + '</span>' +
      '<span class="emain"><div class="etitle">' + esc(entryTitle(e)) + (e.receipt ? ' 📎' : '') + '</div><div class="esub">' + esc(sub.join(' · ')) + '</div></span>' +
      '<span class="eamt"><div class="a ' + cls + '">' + esc(t.sign + PL.fmtMoney(e.amount, e.currency)) + '</div>' +
      (second ? '<div class="b">' + esc(second) + '</div>' : '') + '</span></button>';
  }
  function bindEntryRows(el) { $$('[data-entry]', el).forEach(b => { b.onclick = () => openDetail(b.dataset.entry); }); }
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
    v.innerHTML =
      '<h1 class="large">收支總覽</h1>' +
      (showInstall ? '<div class="banner"><span>📲</span><span>在 Safari 點「分享」→「加入主畫面」，就能像 App 一樣開啟並離線使用。</span><button data-k="hideInstall" aria-label="關閉">×</button></div>' : '') +
      '<div class="hero-card"><div class="lbl">本期 ' + esc(period.title) + '・支出（含手續費）</div><div class="big">' + PL.fmtTWD(s.expense) + '</div>' +
      '<div class="tiles"><div class="tile"><div class="k">收入</div><div class="v pos">' + PL.fmtTWD(s.income) + '</div></div>' +
      '<div class="tile"><div class="k">手續費</div><div class="v" style="color:var(--warn)">' + PL.fmtTWD(s.fee) + '</div></div>' +
      '<div class="tile"><div class="k">結餘</div><div class="v ' + (s.balance < 0 ? 'danger' : '') + '">' + PL.fmtTWD(s.balance) + '</div></div></div></div>' +
      '<div class="sec"><div class="group">' + (total ? '<button class="row" style="display:block;padding:0" data-k="toBudget">' + budgetHTML(total) + '</button>' :
        '<button class="row link" data-k="toBudget"><span class="k">🎯 設定每月預算，掌握支出進度</span></button>') + '</div></div>' +
      '<div class="sec"><div class="sec-h"><span>各幣別原始金額</span></div><div class="group">' + currencyHTML(s.byCurrency) + '</div>' +
      '<div class="sec-f">不同幣別不直接相加，合計請看上方新台幣金額。</div></div>' +
      '<div class="sec"><div class="sec-h"><span>最近交易</span><button class="iconbtn" style="height:auto;min-width:0;padding:0;background:none" data-k="toList">查看全部</button></div>' +
      '<div class="group">' + (S.entries.length ? S.entries.slice(0, 6).map(entryRowHTML).join('') : '<div class="empty"><b>尚無交易</b>點右下角 ＋ 開始記帳</div>') + '</div></div>' +
      '<button class="fab" data-k="add" aria-label="新增交易">＋</button>';
    bindEntryRows(v);
    $$('[data-k=toBudget]', v).forEach(b => { b.onclick = () => switchTab('budget'); });
    $('[data-k=toList]', v).onclick = () => switchTab('list');
    $('[data-k=add]', v).onclick = () => openForm(null);
    const hi = $('[data-k=hideInstall]', v);
    if (hi) hi.onclick = () => { lsSet('pl.hideInstall', true); refreshView(); };
  }

  // ======================= 分頁：紀錄 =======================
  function renderList(v) {
    const f = S.list.filter, q = S.list.search.trim().toLowerCase();
    v.innerHTML = '<div class="toprow"><h1 class="large">交易紀錄</h1><div class="tools">' +
      '<button class="iconbtn ' + (filterCount(f) ? 'active' : '') + '" data-k="filter">篩選' + (filterCount(f) ? ' ' + filterCount(f) : '') + '</button>' +
      '<button class="iconbtn" data-k="add" aria-label="新增交易">＋</button></div></div>' +
      '<input class="search" type="search" id="list-search" placeholder="搜尋商家、備註、分類、卡片" value="' + esc(S.list.search) + '">' +
      '<div id="list-body"></div>';
    $('[data-k=filter]', v).onclick = () => openFilter('篩選紀錄', S.list.filter, true, nf => { S.list.filter = nf; });
    $('[data-k=add]', v).onclick = () => openForm(null);
    $('#list-search', v).oninput = ev => { S.list.search = ev.target.value; drawBody(); };
    function drawBody() {
      const qq = S.list.search.trim().toLowerCase();
      const items = S.entries.filter(e => matchFilter(e, f) && (!qq ||
        [e.merchant, e.note, catName(e), cardById(e.cardId) ? cardById(e.cardId).name : ''].some(x => (x || '').toLowerCase().includes(qq))));
      const body = $('#list-body', v);
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
    v.innerHTML = '<div class="toprow"><h1 class="large">統計報表</h1><div class="tools"><button class="iconbtn ' + (fc ? 'active' : '') + '" data-k="filter">篩選' + (fc ? ' ' + fc : '') + '</button></div></div>' +
      '<div class="seg" data-k="mode">' + [['month', '月'], ['year', '年'], ['custom', '自訂']].map(([k, l]) => '<button data-v="' + k + '" class="' + (r.mode === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div>' +
      (r.mode === 'custom'
        ? '<div class="sec"><div class="group"><label class="row"><span class="k">開始</span><input type="date" id="r-start" value="' + r.start + '"></label><label class="row"><span class="k">結束</span><input type="date" id="r-end" value="' + r.end + '"></label></div></div>'
        : '<div class="sec"><div class="group"><div class="row"><button class="iconbtn" data-k="prev" aria-label="上一期">‹</button><span class="k center" style="display:flex;font-weight:700">' + esc(range.title) + '</span><button class="iconbtn" data-k="next" aria-label="下一期">›</button></div></div></div>') +
      '<div class="sec"><div class="sec-h"><span>新台幣合計</span></div><div class="tiles two on-bg">' +
      '<div class="tile"><div class="k">收入</div><div class="v pos">' + PL.fmtTWD(s.income) + '</div></div>' +
      '<div class="tile"><div class="k">支出（含手續費）</div><div class="v">' + PL.fmtTWD(s.expense) + '</div></div>' +
      '<div class="tile"><div class="k">刷卡手續費</div><div class="v" style="color:var(--warn)">' + PL.fmtTWD(s.fee) + '</div><div class="f">消費 ' + PL.fmtTWD(s.spending) + '</div></div>' +
      '<div class="tile"><div class="k">結餘</div><div class="v ' + (s.balance < 0 ? 'danger' : '') + '">' + PL.fmtTWD(s.balance) + '</div></div></div>' +
      ((s.refund || s.cardPayment) ? '<div class="sec-f">' + (s.refund ? '退款 ' + PL.fmtTWD(s.refund) + '（已自支出扣除）　' : '') + (s.cardPayment ? '信用卡繳款 ' + PL.fmtTWD(s.cardPayment) + '（不計入支出）' : '') + '</div>' : '') + '</div>' +
      '<div class="sec"><div class="sec-h"><span>各幣別原始金額</span></div><div class="group">' + currencyHTML(s.byCurrency) + '</div><div class="sec-f">各幣別分開統計、不直接相加；手續費一律以新台幣計。</div></div>' +
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
    drawChart($('#chart', v), items, r.dim);
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
        body.innerHTML = '<div class="sec"><div class="group"><label class="row"><span class="k">每月總預算</span><span class="muted">NT$</span><input inputmode="decimal" data-b="total" value="' + esc(vals.total) + '" placeholder="0"></label></div><div class="sec-f">留空或 0 代表不設定。</div></div>' +
          '<div class="sec"><div class="sec-h"><span>分類月預算</span></div><div class="group">' +
          S.categories.filter(c => c.kind === 'expense').map(c => '<label class="row"><span class="k">' + esc(c.icon + ' ' + c.name) + '</span><span class="muted">NT$</span><input inputmode="decimal" data-b="' + c.id + '" value="' + esc(vals[c.id]) + '" placeholder="0"></label>').join('') +
          '</div><div class="sec-f" id="b-sum"></div></div>';
        const upd = () => {
          const s = sumCats(), t = PL.parseNumber(vals.total) || 0;
          $('#b-sum', body).innerHTML = t > 0 && s > t ? '<span style="color:var(--warn)">分類預算合計 ' + PL.fmtTWD(s) + ' 已超過總預算。</span>' : '分類預算合計 ' + PL.fmtTWD(s);
        };
        $$('[data-b]', body).forEach(i => { i.oninput = () => { vals[i.dataset.b] = i.value; upd(); }; });
        upd();
      }
    });
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
      receipt: entry.receipt, newBlob: null, countryTouched: true
    } : {
      id: null, type: preset.type || 'expense', amountText: '', currency: st.defaultCurrency, date: today(),
      categoryId: null, countryCode: st.defaultCountry, method: 'cash', cardId: null, merchant: '', note: '',
      quote: null, manual: false, rateText: '', rateState: 'idle', rateMsg: '', loadedKey: null,
      includesFee: false, feeManual: false, feeText: '', receipt: null, newBlob: null, countryTouched: false
    };
    if (!entry) {
      const kind = f.type === 'income' ? 'income' : 'expense';
      const c = S.categories.find(x => x.kind === kind); f.categoryId = f.type === 'cardPayment' ? null : (c ? c.id : null);
      if (preset.cardId) { f.cardId = preset.cardId; const cd = cardById(preset.cardId); if (cd && f.type !== 'cardPayment') f.method = cd.kind === 'debit' ? 'debitCard' : 'creditCard'; }
      else if (f.type === 'cardPayment') { const cc = S.cards.find(x => x.kind === 'credit'); f.cardId = cc ? cc.id : null; }
      f.includesFee = PL.defaultIncludesFee(f.type, f.method, effCurrency(), st);
    }
    let previewURL = null;
    function effCurrency() { return f.type === 'cardPayment' ? 'TWD' : f.currency; }
    const isForeign = () => effCurrency() !== 'TWD';
    const amount = () => PL.parseNumber(f.amountText);
    const rate = () => !isForeign() ? 1 : (f.manual ? PL.parseNumber(f.rateText) : (f.quote ? f.quote.rate : null));
    const amountTWD = () => { const a = amount(), r = rate(); return a !== null && r ? PL.convert(a, r) : null; };
    const card = () => cardById(f.cardId);
    const feeOK = () => PL.feeApplicable(f.type, f.method, effCurrency(), st);
    const feeRate = () => PL.effectiveRate(card() && card().customFeeRate !== null && card().customFeeRate !== undefined ? card().customFeeRate : null, st);
    const computedFee = () => { const t = amountTWD(); return t === null ? 0 : PL.fee(t, feeRate()); };
    const finalFee = () => !(feeOK() && f.includesFee) ? 0 : (f.feeManual ? (PL.parseNumber(f.feeText) || 0) : computedFee());
    const rateKey = () => effCurrency() + '|' + f.date + '|' + (f.type === 'income' ? 'buy' : 'sell');
    const canSave = () => { const a = amount(), r = rate(); return a !== null && a > 0 && r !== null && r > 0 && (f.type !== 'cardPayment' || !!f.cardId); };
    const resetFee = () => { f.includesFee = PL.defaultIncludesFee(f.type, f.method, effCurrency(), st); f.feeManual = false; };

    async function maybeFetch(force) {
      if (!isForeign() || f.manual) return;
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
      title: entry ? '編輯交易' : '新增交易', leftLabel: '取消',
      right: { label: '儲存', action: () => save() },
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
      if (isForeign()) {
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
            (f.quote.detail ? '<div class="row small muted">' + esc(f.quote.detail) + '</div>' : '') +
            '<div class="btnrow"><button class="btn" data-k="refetch">重新查詢</button><button class="btn" data-k="manual">改用手動匯率</button></div>';
        } else if (f.rateState !== 'loading') {
          rateHTML += '<div class="btnrow"><button class="btn" data-k="refetch">查詢匯率</button><button class="btn" data-k="manual">手動輸入</button></div>';
        }
        rateHTML += '</div><div class="sec-f">存檔後此筆交易會保存當時採用的匯率，之後匯率更新也不會改變舊紀錄。</div></div>';
      }
      const feeHTML = feeOK() ? '<div class="sec"><div class="sec-h"><span>刷卡手續費</span></div><div class="group">' +
        switchHTML('f-incfee', f.includesFee, f.type === 'refund' ? '退回手續費' : '計入刷卡手續費') +
        (f.includesFee ? '<div class="row"><span class="k">費率</span><span class="v">' + PL.fmtPercent(feeRate()) + (card() && card().customFeeRate !== null && card().customFeeRate !== undefined ? '（卡片費率）' : '（預設）') + '</span></div>' +
          switchHTML('f-feemanual', f.feeManual, '手動調整手續費') +
          (f.feeManual ? '<label class="row"><span class="k">實際手續費</span><span class="muted">NT$</span><input inputmode="decimal" id="f-feetext" value="' + esc(f.feeText) + '"></label>' : '') +
          '<div id="f-feebreak"></div>' : '') + '</div></div>' : '';
      const showReceipt = f.type !== 'cardPayment';
      body.innerHTML =
        '<div class="seg" data-k="type">' + Object.keys(TYPES).map(k => '<button data-v="' + k + '" class="' + (f.type === k ? 'on' : '') + '">' + TYPES[k].t + '</button>').join('') + '</div>' +
        '<div class="sec"><div class="sec-h"><span>金額與幣別</span></div><div class="group"><div class="amount-row">' +
        (f.type === 'cardPayment' ? '<span class="fixed">TWD</span>' : '<select id="f-cur" aria-label="幣別">' + currencyOptions(f.currency) + '</select>') +
        '<input id="f-amount" inputmode="decimal" placeholder="0" value="' + esc(f.amountText) + '" aria-label="金額" autocomplete="off"></div>' +
        (isForeign() ? '<div class="row"><span class="k">換算新台幣</span><span class="v num" id="f-conv"></span></div>' : '') + '</div></div>' +
        rateHTML +
        '<div class="sec"><div class="group"><label class="row"><span class="k">日期</span><input type="date" id="f-date" value="' + f.date + '" max="2100-12-31"></label>' +
        (f.type === 'cardPayment' ? cardSelect('繳款卡片') :
          '<label class="row"><span class="k">分類</span><select id="f-cat">' + optionList([['', '未分類']].concat(cats.map(c => [c.id, c.icon + ' ' + c.name])), f.categoryId || '') + '</select></label>' +
          '<label class="row"><span class="k">國家／地區</span><select id="f-country">' + regionOptions(f.countryCode) + '</select></label>' +
          '<label class="row"><span class="k">付款方式</span><select id="f-method">' + optionList(Object.keys(METHODS).map(k => [k, METHOD_ICONS[k] + ' ' + METHODS[k]]), f.method) + '</select></label>' +
          (f.method === 'creditCard' || f.method === 'debitCard' ? cardSelect('卡片') : '')) +
        '</div><div class="sec-f">' + (f.type === 'cardPayment' ? '繳卡費是把錢從銀行帳戶轉去繳信用卡帳單，屬於轉帳，不會計入支出，避免與原本的刷卡消費重複計算。' :
          f.type === 'refund' ? '退款會沖減所選分類的支出；若信用卡同時退回手續費，請開啟「退回手續費」。' : '') + '</div></div>' +
        feeHTML +
        '<div class="sec"><div class="sec-h"><span>商家與備註（選填）</span></div><div class="group">' +
        (f.type !== 'cardPayment' ? '<label class="row"><span class="k">商家</span><input type="text" id="f-merchant" value="' + esc(f.merchant) + '" placeholder="商家名稱"></label>' : '') +
        '<div class="row stack"><span class="muted small">備註</span><textarea id="f-note" rows="2" placeholder="備註">' + esc(f.note) + '</textarea></div></div></div>' +
        (showReceipt ? '<div class="sec"><div class="sec-h"><span>收據照片（選填）</span></div><div class="group"><div id="f-receipt"></div><div class="btnrow">' +
          '<label class="btn filebtn">📷 拍攝或選擇照片<input type="file" accept="image/*" id="f-file"></label>' +
          '<button class="btn danger" data-k="rmreceipt"' + (f.receipt || f.newBlob ? '' : ' hidden') + '>移除收據</button></div></div></div>' : '') +
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
      amt.oninput = () => { f.amountText = amt.value; updateDerived(body); };
      if (!entry && !f.amountText && !render.focused) { render.focused = true; setTimeout(() => amt.focus(), 50); }
      const curSel = $('#f-cur', body);
      if (curSel) curSel.onchange = () => {
        f.currency = curSel.value;
        if (!f.countryTouched && SUGGESTED_REGION[f.currency]) f.countryCode = SUGGESTED_REGION[f.currency];
        f.manual = false; f.rateText = ''; f.rateState = 'idle'; f.quote = null; resetFee(); rerender(); maybeFetch(false);
      };
      const rateIn = $('#f-rate', body); if (rateIn) rateIn.oninput = () => { f.rateText = rateIn.value; updateDerived(body); };
      const bt = k => $('[data-k=' + k + ']', body);
      if (bt('auto')) bt('auto').onclick = () => { f.manual = false; f.rateState = 'idle'; maybeFetch(true); rerender(); };
      if (bt('refetch')) bt('refetch').onclick = () => maybeFetch(true);
      if (bt('manual')) bt('manual').onclick = () => { f.rateText = f.quote ? String(f.quote.rate) : ''; f.manual = true; rerender(); };
      const dateIn = $('#f-date', body); dateIn.onchange = () => { if (dateIn.value) { f.date = dateIn.value; maybeFetch(false); } };
      const cat = $('#f-cat', body); if (cat) cat.onchange = () => { f.categoryId = cat.value || null; };
      const ctry = $('#f-country', body); if (ctry) ctry.onchange = () => { f.countryCode = ctry.value; f.countryTouched = true; };
      const meth = $('#f-method', body);
      if (meth) meth.onchange = () => {
        f.method = meth.value;
        if (f.method === 'creditCard' || f.method === 'debitCard') {
          const kind = f.method === 'debitCard' ? 'debit' : 'credit';
          if (!(card() && card().kind === kind)) { const c = S.cards.find(x => x.kind === kind); f.cardId = c ? c.id : null; }
        } else f.cardId = null;
        resetFee(); rerender();
      };
      const cs = $('#f-card', body); if (cs) cs.onchange = () => { f.cardId = cs.value || null; rerender(); };
      if (bt('addcard')) bt('addcard').onclick = () => openCardEdit(null);
      const inc = $('#f-incfee', body); if (inc) inc.onchange = () => { f.includesFee = inc.checked; rerender(); };
      const fm = $('#f-feemanual', body); if (fm) fm.onchange = () => { f.feeManual = fm.checked; if (f.feeManual) f.feeText = String(computedFee()); rerender(); };
      const ft = $('#f-feetext', body); if (ft) ft.oninput = () => { f.feeText = ft.value; updateDerived(body); };
      const mer = $('#f-merchant', body); if (mer) mer.oninput = () => { f.merchant = mer.value; };
      const note = $('#f-note', body); note.oninput = () => { f.note = note.value; };
      const file = $('#f-file', body);
      if (file) file.onchange = async () => {
        const fl = file.files && file.files[0]; if (!fl) return;
        try { f.newBlob = await compressImage(fl); rerender(); } catch (e) { toast('無法讀取這張照片'); }
      };
      if (bt('rmreceipt')) bt('rmreceipt').onclick = () => { f.newBlob = null; f.receipt = null; rerender(); };
      if (bt('delete')) bt('delete').onclick = async () => {
        if (!confirm('確定要刪除這筆交易？')) return;
        await deleteEntry(entry); closeAllPages(); toast('已刪除');
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
      const e = {
        id: f.id || uid(), type: f.type, amount: a, currency: cur, date: f.date,
        categoryId: f.type === 'cardPayment' ? null : f.categoryId,
        countryCode: f.type === 'cardPayment' ? st.defaultCountry : f.countryCode,
        method: f.type === 'cardPayment' ? 'other' : f.method,
        cardId: (f.type === 'cardPayment' || f.method === 'creditCard' || f.method === 'debitCard') ? (f.cardId || null) : null,
        merchant: f.type === 'cardPayment' ? '' : f.merchant.trim(), note: f.note.trim(),
        rate: r, amountTWD: PL.convert(a, r),
        rateSource: cur === 'TWD' ? 'base' : (f.manual ? 'manual' : f.quote.source),
        rateDate: cur === 'TWD' ? f.date : (f.manual ? f.date : f.quote.rateDate),
        rateDetail: cur === 'TWD' ? '' : (f.manual ? '使用者手動輸入' : f.quote.detail),
        includesFee: feeOK() && f.includesFee, feeRate: 0, feeTWD: finalFee(), isFeeManual: false,
        receipt: old.receipt || null, createdAt: old.createdAt || now, updatedAt: now
      };
      e.feeRate = e.includesFee ? feeRate() : 0;
      e.isFeeManual = e.includesFee && f.feeManual;
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
          (foreign ? '<div class="muted">≈ ' + PL.fmtTWD(e.amountTWD) + '</div>' : '') + '</div>' +
          '<div class="sec"><div class="sec-h"><span>基本資料</span></div><div class="group">' +
          '<div class="row"><span class="k">日期</span><span class="v">' + fmtDate(e.date) + '</span></div>' +
          (e.type !== 'cardPayment' ? '<div class="row"><span class="k">分類</span><span class="v">' + esc(catIcon(e) + ' ' + catName(e)) + '</span></div>' +
            '<div class="row"><span class="k">國家／地區</span><span class="v">' + esc(regionLabel(e.countryCode)) + '</span></div>' +
            '<div class="row"><span class="k">付款方式</span><span class="v">' + esc(METHODS[e.method]) + '</span></div>' : '') +
          (c ? '<div class="row"><span class="k">卡片</span><span class="v">' + esc(cardLabel(c)) + '</span></div>' : '') +
          (e.merchant ? '<div class="row"><span class="k">商家</span><span class="v">' + esc(e.merchant) + '</span></div>' : '') +
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
          '<div class="sec"><div class="group"><button class="row center danger" data-k="del">刪除這筆交易</button></div></div>';
        $('#pages .pbar h1').textContent = p.title;
        $('[data-k=del]', body).onclick = async () => {
          if (!confirm('確定要刪除這筆交易？')) return;
          await deleteEntry(e); popPage(); toast('已刪除');
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
    const link = (k, icon, label, value) => '<button class="row link" data-k="' + k + '"><span class="k">' + icon + ' ' + esc(label) + '</span>' + (value ? '<span class="v">' + esc(value) + '</span>' : '') + '</button>';
    v.innerHTML = '<h1 class="large">設定</h1>' +
      '<div class="sec"><div class="sec-h"><span>記帳</span></div><div class="group">' +
      link('currency', '💱', '幣別與預設國家', st.defaultCurrency) +
      link('categories', '🗂️', '分類管理') +
      link('cards', '💳', '卡片管理與繳款', S.cards.length ? S.cards.length + ' 張' : '') +
      link('fee', '％', '刷卡手續費', PL.fmtPercent(st.defaultFeeRate)) +
      link('rates', 'ℹ️', '匯率來源說明') + '</div></div>' +
      '<div class="sec"><div class="sec-h"><span>預算</span></div><div class="group">' + link('budget', '🔔', '預算週期與提醒', '每月 ' + st.budgetStartDay + ' 日起') + '</div></div>' +
      '<div class="sec"><div class="sec-h"><span>安全與資料</span></div><div class="group">' +
      link('lock', '🔒', 'App 鎖定', lock.mode === 'off' ? '未啟用' : (lock.mode === 'passcode' ? '密碼' : 'Face ID')) +
      link('backup', '💾', '備份與還原') +
      link('install', '📲', '安裝與離線使用', isStandalone() ? '已安裝' : '') + '</div>' +
      '<div class="sec-f">所有記帳資料只存在這台裝置的瀏覽器中，不使用雲端同步。網頁版 1.0</div></div>';
    const map = { currency: openCurrencySettings, categories: openCategorySettings, cards: openCardSettings, fee: openFeeSettings, rates: openRateInfo, budget: openBudgetSettings, lock: openLockSettings, backup: openBackup, install: openInstallHelp };
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
            '<span class="muted small">手續費 ' + PL.fmtPercent(c.customFeeRate !== null && c.customFeeRate !== undefined ? c.customFeeRate : S.settings.defaultFeeRate) + (c.customFeeRate !== null && c.customFeeRate !== undefined ? '' : '（預設）') + '</span></span></button>').join('') + '</div></div>';
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
        body.innerHTML = '<div class="sec"><div class="sec-h"><span>帳務概況</span></div><div class="group">' +
          '<div class="row"><span class="k">累計刷卡（含手續費）</span><span class="v num">' + PL.fmtTWD(b.charges) + '</span></div>' +
          '<div class="row"><span class="k">退款</span><span class="v num">' + PL.fmtTWD(b.refunds) + '</span></div>' +
          '<div class="row"><span class="k">已繳款</span><span class="v num">' + PL.fmtTWD(b.payments) + '</span></div>' +
          '<div class="row"><b class="k">估計未繳金額</b><b class="num">' + PL.fmtTWD(b.outstanding) + '</b></div>' +
          (c.kind === 'credit' ? '<button class="row accent" data-k="pay">✅ 記錄繳卡費</button>' : '') +
          '</div><div class="sec-f">刷卡當下已記為支出；繳卡費只是轉帳，不再計入支出，避免重複計算。估計未繳 = 刷卡 − 退款 − 已繳款，僅供參考。</div></div>' +
          (payments.length ? '<div class="sec"><div class="sec-h"><span>繳款紀錄</span></div><div class="group">' + payments.map(entryRowHTML).join('') + '</div></div>' : '');
        const pay = $('[data-k=pay]', body); if (pay) pay.onclick = () => openForm(null, { type: 'cardPayment', cardId: id });
        bindEntryRows(body);
      }
    });
  }
  function openCardEdit(card) {
    const f = { name: card ? card.name : '', lastFour: card ? card.lastFour : '', kind: card ? card.kind : 'credit',
      custom: !!card && card.customFeeRate !== null && card.customFeeRate !== undefined,
      feeText: card && card.customFeeRate !== null && card.customFeeRate !== undefined ? String(PL.round(card.customFeeRate * 100, 4)) : '' };
    pushPage({
      title: card ? '編輯卡片' : '新增卡片', leftLabel: '取消',
      right: {
        label: '儲存', action: async () => {
          const name = f.name.trim(); if (!name) { toast('請輸入卡片別名'); return; }
          const pct = PL.parseNumber(f.feeText);
          const obj = Object.assign(card || { id: uid(), sortOrder: S.cards.length, createdAt: new Date().toISOString() },
            { name: name, lastFour: f.lastFour, kind: f.kind, customFeeRate: f.custom && pct !== null ? PL.round(pct / 100, 6) : null });
          await upsert('cards', S.cards, obj);
          popPage();
        }
      },
      render(body) {
        body.innerHTML = '<div class="sec"><div class="sec-h"><span>卡片</span></div><div class="group">' +
          '<label class="row"><span class="k">別名</span><input type="text" id="cd-name" value="' + esc(f.name) + '" placeholder="例如：國泰 CUBE"></label>' +
          '<label class="row"><span class="k">末四碼（選填）</span><input inputmode="numeric" id="cd-last" maxlength="4" value="' + esc(f.lastFour) + '"></label>' +
          '<label class="row"><span class="k">種類</span><select id="cd-kind">' + optionList([['credit', '信用卡'], ['debit', '金融卡']], f.kind) + '</select></label></div></div>' +
          '<div class="sec"><div class="sec-h"><span>刷卡手續費</span></div><div class="group">' + switchHTML('cd-custom', f.custom, '使用個別手續費率') +
          (f.custom ? '<label class="row"><span class="k">費率</span><input inputmode="decimal" id="cd-fee" value="' + esc(f.feeText) + '" placeholder="1.5"><span>%</span></label>' : '') +
          '</div><div class="sec-f">未開啟時使用預設費率 ' + PL.fmtPercent(S.settings.defaultFeeRate) + '。</div></div>' +
          (card ? '<div class="sec"><div class="group"><button class="row center danger" data-k="del">刪除卡片</button></div></div>' : '');
        $('#cd-name', body).oninput = ev => { f.name = ev.target.value; };
        $('#cd-last', body).oninput = ev => { ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, 4); f.lastFour = ev.target.value; };
        $('#cd-kind', body).onchange = ev => { f.kind = ev.target.value; };
        $('#cd-custom', body).onchange = ev => { f.custom = ev.target.checked; rerenderTop(); };
        const fee = $('#cd-fee', body); if (fee) fee.oninput = () => { f.feeText = fee.value; };
        const del = $('[data-k=del]', body);
        if (del) del.onclick = async () => {
          if (!confirm('刪除卡片「' + card.name + '」？相關交易會保留，但不再標示卡片。')) return;
          for (const e of S.entries.filter(e => e.cardId === card.id)) { e.cardId = null; await DB.put('entries', e); }
          await remove('cards', S.cards, card.id);
          stack.pop(); popPage();
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
      formatVersion: 1, app: 'PocketLedger', exportedAt: isoNoMs(), appVersion: 'web-1.0',
      settings: { defaultFeeRate: numStr(st.defaultFeeRate), feeOnDebitCard: st.feeOnDebitCard, feeOnlyForeign: st.feeOnlyForeign, favoriteCurrencies: st.favoriteCurrencies, defaultCurrency: st.defaultCurrency, defaultCountry: st.defaultCountry, budgetStartDay: st.budgetStartDay, budgetAlertsEnabled: st.budgetAlertsEnabled, warningPercent: st.warningPercent },
      categories: S.categories.map(c => ({ id: c.id, name: c.name, icon: ICON_REVERSE[c.icon] || c.icon, kind: c.kind, sortOrder: c.sortOrder })),
      cards: S.cards.map(c => Object.assign({ id: c.id, name: c.name, lastFour: c.lastFour || '', kind: c.kind, sortOrder: c.sortOrder, createdAt: isoNoMs(c.createdAt) }, c.customFeeRate !== null && c.customFeeRate !== undefined ? { customFeeRate: numStr(c.customFeeRate) } : {})),
      budgets: S.budgets.map(b => Object.assign({ isTotal: b.isTotal, amount: numStr(b.amount) }, b.categoryId ? { categoryID: b.categoryId } : {})),
      alertRecords: S.alerts.map(a => ({ periodKey: a.periodKey, budgetKey: a.budgetKey, threshold: a.threshold, sentAt: isoNoMs(a.sentAt) })),
      entries: S.entries.slice().reverse().map(e => Object.assign({
        id: e.id, type: e.type, amount: numStr(e.amount), currency: e.currency, date: isoFromDay(e.date),
        countryCode: e.countryCode, paymentMethod: e.method, merchant: e.merchant || '', note: e.note || '',
        exchangeRate: numStr(e.rate), rateDate: isoFromDay(e.rateDate || e.date), rateSource: e.rateSource, rateDetail: e.rateDetail || '',
        amountTWD: numStr(e.amountTWD), includesFee: !!e.includesFee, feeRate: numStr(e.feeRate), feeTWD: numStr(e.feeTWD), isFeeManual: !!e.isFeeManual,
        createdAt: isoNoMs(e.createdAt), updatedAt: isoNoMs(e.updatedAt)
      }, e.categoryId ? { categoryID: e.categoryId } : {}, e.cardId ? { cardID: e.cardId } : {}, e.receipt ? { receiptFileName: e.receipt } : {})),
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
      budgetAlertsEnabled: b.settings.budgetAlertsEnabled !== false, warningPercent: b.settings.warningPercent || 80
    });
    const cats = (b.categories || []).map(c => ({ id: c.id, name: c.name, icon: ICON_MAP[c.icon] || (/^[a-z0-9.]+$/.test(c.icon) ? '🏷️' : c.icon), kind: c.kind === 'income' ? 'income' : 'expense', sortOrder: c.sortOrder || 0 }));
    const catIds = new Set(cats.map(c => c.id));
    const cards = (b.cards || []).map(c => ({ id: c.id, name: c.name, lastFour: c.lastFour || '', kind: c.kind === 'debit' ? 'debit' : 'credit', customFeeRate: c.customFeeRate !== undefined && c.customFeeRate !== null ? num(c.customFeeRate) : null, sortOrder: c.sortOrder || 0, createdAt: c.createdAt }));
    const cardIds = new Set(cards.map(c => c.id));
    const budgets = (b.budgets || []).filter(x => x.isTotal || catIds.has(x.categoryID)).map(x => ({ id: uid(), isTotal: !!x.isTotal, categoryId: x.isTotal ? null : x.categoryID, amount: num(x.amount) }));
    const alerts = (b.alertRecords || []).map(a => ({ id: a.periodKey + '|' + a.budgetKey + '|' + a.threshold, periodKey: a.periodKey, budgetKey: a.budgetKey, threshold: a.threshold, sentAt: a.sentAt }));
    const entries = b.entries.map(d => ({
      id: d.id, type: d.type, amount: num(d.amount), currency: d.currency, date: dayFromISO(d.date),
      categoryId: catIds.has(d.categoryID) ? d.categoryID : null, countryCode: d.countryCode || 'TW', method: d.paymentMethod || 'other',
      cardId: cardIds.has(d.cardID) ? d.cardID : null, merchant: d.merchant || '', note: d.note || '',
      rate: num(d.exchangeRate) || 1, rateDate: d.rateDate ? dayFromISO(d.rateDate) : dayFromISO(d.date), rateSource: d.rateSource || 'manual', rateDetail: d.rateDetail || '',
      amountTWD: num(d.amountTWD), includesFee: !!d.includesFee, feeRate: num(d.feeRate), feeTWD: num(d.feeTWD), isFeeManual: !!d.isFeeManual,
      receipt: d.receiptFileName ? String(d.receiptFileName).split('/').pop() : null, createdAt: d.createdAt, updatedAt: d.updatedAt
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
  function openBackup() {
    pushPage({
      title: '備份與還原',
      render(body) {
        const nReceipts = S.entries.filter(e => e.receipt).length;
        const item = (t, d) => '<div class="row stack"><b>' + t + '</b><span class="muted small">' + d + '</span></div>';
        body.innerHTML = '<div class="sec"><div class="sec-h"><span>目前資料</span></div><div class="group">' +
          '<div class="row"><span class="k">交易筆數</span><span class="v">' + S.entries.length + '</span></div>' +
          '<div class="row"><span class="k">收據照片</span><span class="v">' + nReceipts + ' 張</span></div></div></div>' +
          '<div class="sec"><div class="group"><button class="row accent" data-k="export">⬆️ 匯出備份檔</button>' +
          '<label class="row accent filebtn" style="position:relative">⬇️ 從備份檔還原<input type="file" accept=".json,application/json" id="bk-file"></label></div>' +
          '<div class="sec-f">還原會以備份內容「完整取代」目前所有資料（交易、分類、卡片、預算、設定與收據照片）。</div></div>' +
          '<div class="sec"><div class="sec-h"><span>說明</span></div><div class="group">' +
          item('檔案格式', '單一 JSON 檔（例如「記帳備份_2026-11-18.json」），包含記帳紀錄、分類、卡片、預算、提醒狀態、設定，以及內嵌的收據照片。格式與 iOS 原生版相同，可以互相還原。') +
          item('儲存位置', '匯出時會開啟分享選單：選「儲存到檔案」可存到「我的 iPhone」、iCloud 雲碟等，也可以用 AirDrop 傳到電腦。App 本身不會上傳任何資料。') +
          item('加密', '備份檔未加密，內容可被任何人讀取（包括收據照片）。請存放在你信任的位置，不要公開分享。') +
          item('App 鎖定', '密碼與 Face ID 設定不包含在備份檔；在新裝置還原後請重新設定。') +
          item('更換手機或刪除 App', '網頁版資料只存在目前這個瀏覽器／主畫面 App 中，換手機、刪除主畫面 App 或清除 Safari 網站資料都會遺失，請先匯出備份檔，再到新裝置還原。') + '</div></div>';
        $('[data-k=export]', body).onclick = async () => {
          try {
            const json = JSON.stringify(await buildBackup(), null, 2);
            const name = '記帳備份_' + today() + '.json';
            const file = new File([json], name, { type: 'application/json' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              try { await navigator.share({ files: [file], title: name }); lsSet('pl.lastBackup', today()); return; }
              catch (e) { if (e && e.name === 'AbortError') return; }
            }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(file); a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);
            lsSet('pl.lastBackup', today());
            toast('備份檔已下載');
          } catch (e) { toast('匯出失敗：' + e.message); }
        };
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
    evaluateBudgets();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { if (lockConfig().mode !== 'off' && $('#lock').hidden) showLock(); }
      else { evaluateBudgets().then(() => { if (!stack.length) refreshView(); }); }
    });
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => { /* 離線快取不可用時仍可線上使用 */ });
    }
  }
  start();
  // 測試用
  globalThis.__PL_APP__ = { S, buildBackup, restoreBackup, evaluateBudgets };
})();
