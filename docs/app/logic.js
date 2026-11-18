/* 多幣記帳 — 純計算邏輯（與 iOS 原生版 App/Core 相同規則），可在瀏覽器與 Node 測試中使用 */
(function (root) {
  'use strict';

  // ---------- 數字 ----------
  /** 四捨五入（half up，與 iOS NSDecimalNumber .plain 相同） */
  function round(value, digits) {
    const f = Math.pow(10, digits);
    const sign = value < 0 ? -1 : 1;
    return sign * Math.round(Math.abs(value) * f + 1e-9) / f;
  }
  function parseNumber(text) {
    if (text === null || text === undefined) return null;
    const s = String(text).replace(/,/g, '').trim();
    if (!s || !/^-?\d*\.?\d+$|^-?\d+\.?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // ---------- 手續費與換算 ----------
  const DEFAULT_FEE_RATE = 0.03;

  /** 外幣換算新台幣：原幣 × 匯率，小數 2 位 */
  function convert(amount, rate) { return round(amount * rate, 2); }
  /** 手續費：新台幣 × 費率，四捨五入至整數元 */
  function fee(amountTWD, rate) { return round(amountTWD * rate, 0); }

  function feeApplicable(type, method, currency, policy) {
    if (type !== 'expense' && type !== 'refund') return false;
    let ok = false;
    if (method === 'creditCard') ok = true;
    else if (method === 'debitCard') ok = !!policy.feeOnDebitCard;
    if (!ok) return false;
    return !policy.feeOnlyForeign || currency !== 'TWD';
  }
  function defaultIncludesFee(type, method, currency, policy) {
    return type === 'expense' && feeApplicable(type, method, currency, policy);
  }
  function effectiveRate(cardRate, policy) {
    return (cardRate === null || cardRate === undefined) ? policy.defaultFeeRate : cardRate;
  }

  // ---------- 日期（以 YYYY-MM-DD 本地日期字串保存） ----------
  function pad(n) { return String(n).padStart(2, '0'); }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
  function todayKey() { return dayKey(new Date()); }
  function addDays(key, n) { const d = parseDay(key); d.setDate(d.getDate() + n); return dayKey(d); }
  function addMonths(key, n) { const d = parseDay(key); return dayKey(new Date(d.getFullYear(), d.getMonth() + n, d.getDate())); }

  // ---------- 預算週期 ----------
  function clampDay(d) { return Math.min(Math.max(Math.round(d) || 1, 1), 28); }

  /** 每月 startDay 起算的週期；start 含、end 不含（皆為 YYYY-MM-DD） */
  function budgetPeriod(dateKey, startDay) {
    const day = clampDay(startDay);
    const d = parseDay(dateKey);
    let start = new Date(d.getFullYear(), d.getMonth(), day);
    if (d.getDate() < day) start = new Date(d.getFullYear(), d.getMonth() - 1, day);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, day);
    const startKey = dayKey(start), endKey = dayKey(end);
    const last = new Date(end); last.setDate(last.getDate() - 1);
    const title = day === 1
      ? start.getFullYear() + '年' + (start.getMonth() + 1) + '月'
      : (start.getMonth() + 1) + '/' + start.getDate() + ' – ' + (last.getMonth() + 1) + '/' + last.getDate();
    return { start: startKey, end: endKey, key: startKey, startDay: day, title: title };
  }
  function shiftPeriod(period, months) {
    return budgetPeriod(addMonths(period.start, months), period.startDay);
  }
  function inRange(dateKey, start, end) { return dateKey >= start && dateKey < end; }

  // ---------- 統計 ----------
  /** 對支出的淨影響（含手續費）：支出為正、退款為負 */
  function netExpense(e) {
    if (e.type === 'expense') return e.amountTWD + e.feeTWD;
    if (e.type === 'refund') return -(e.amountTWD + e.feeTWD);
    return 0;
  }
  function netFee(e) {
    if (e.type === 'expense') return e.feeTWD;
    if (e.type === 'refund') return -e.feeTWD;
    return 0;
  }

  function summarize(entries) {
    const s = { income: 0, expense: 0, spending: 0, fee: 0, refund: 0, cardPayment: 0, count: 0, byCurrency: [] };
    const cur = {};
    for (const e of entries) {
      s.count++;
      if (e.type === 'cardPayment') { s.cardPayment += e.amountTWD; continue; }
      const c = cur[e.currency] || (cur[e.currency] = { currency: e.currency, income: 0, expense: 0, refund: 0 });
      if (e.type === 'income') { s.income += e.amountTWD; c.income += e.amount; }
      if (e.type === 'expense') c.expense += e.amount;
      if (e.type === 'refund') { s.refund += e.amountTWD + e.feeTWD; c.refund += e.amount; }
      s.expense += netExpense(e);
      s.fee += netFee(e);
    }
    s.income = round(s.income, 2); s.expense = round(s.expense, 2); s.fee = round(s.fee, 2);
    s.refund = round(s.refund, 2); s.cardPayment = round(s.cardPayment, 2);
    s.spending = round(s.expense - s.fee, 2);
    s.balance = round(s.income - s.expense, 2);
    s.byCurrency = Object.values(cur).map(c => Object.assign(c, { net: c.expense - c.refund }))
      .sort((a, b) => a.currency === 'TWD' ? -1 : b.currency === 'TWD' ? 1 : a.currency.localeCompare(b.currency));
    return s;
  }

  /** 依維度彙總；valueFn 預設為淨支出（含手續費），只回傳 > 0 的項目 */
  function breakdown(entries, keyFn, valueFn) {
    valueFn = valueFn || netExpense;
    const map = new Map();
    for (const e of entries) {
      const v = valueFn(e);
      if (!v) continue;
      const k = keyFn(e);
      const cur = map.get(k.key) || { key: k.key, label: k.label, value: 0 };
      cur.value += v;
      map.set(k.key, cur);
    }
    return [...map.values()].map(g => (g.value = round(g.value, 2), g))
      .filter(g => g.value > 0).sort((a, b) => b.value - a.value);
  }

  function cardBalance(entries) {
    const b = { charges: 0, refunds: 0, payments: 0 };
    for (const e of entries) {
      if (e.type === 'expense') b.charges += e.amountTWD + e.feeTWD;
      else if (e.type === 'refund') b.refunds += e.amountTWD + e.feeTWD;
      else if (e.type === 'cardPayment') b.payments += e.amountTWD;
    }
    b.outstanding = round(b.charges - b.refunds - b.payments, 2);
    return b;
  }

  // ---------- 預算 ----------
  function usages(defs, entries, period) {
    const inPeriod = entries.filter(e => inRange(e.date, period.start, period.end));
    return defs.map(def => {
      const rel = def.categoryId ? inPeriod.filter(e => e.categoryId === def.categoryId) : inPeriod;
      const spent = Math.max(round(rel.reduce((s, e) => s + netExpense(e), 0), 2), 0);
      const ratio = def.amount > 0 ? spent / def.amount : 0;
      return {
        key: def.key, name: def.name, icon: def.icon, budget: def.amount, spent: spent,
        remaining: round(def.amount - spent, 2), ratio: ratio, percent: Math.floor(ratio * 100 + 1e-9),
        isTotal: def.key === 'total'
      };
    });
  }
  function isReached(u, threshold) { return u.budget > 0 && u.spent >= u.budget * threshold / 100 - 1e-9; }
  function pendingAlerts(u, thresholds, sent) {
    return thresholds.filter(t => isReached(u, t) && !sent.has(t)).sort((a, b) => a - b);
  }
  function thresholdsToClear(u, sent) { return [...sent].filter(t => !isReached(u, t)); }
  function alertThresholds(warningPercent) {
    const w = Math.min(Math.max(Math.round(warningPercent) || 80, 1), 99);
    return [w, 100];
  }
  function notificationText(u, threshold) {
    const title = threshold >= 100 ? '已超出預算：' + u.name : '預算提醒：' + u.name + ' 已達 ' + threshold + '%';
    const body = '本期已支出 ' + fmtTWD(u.spent) + '／預算 ' + fmtTWD(u.budget) + '（使用 ' + u.percent + '%）';
    return { title: title, body: body };
  }

  // ---------- 匯率 ----------
  /** 解析 fawazahmed0 Currency API 回應：{"date":"…","usd":{"twd":31.5}} */
  function parseCurrencyAPI(json, base) {
    if (!json || typeof json.date !== 'string') return null;
    const table = json[base.toLowerCase()];
    if (!table || typeof table.twd !== 'number' || !(table.twd > 0)) return null;
    return { rate: round(table.twd, 6), date: json.date };
  }

  // ---------- 格式 ----------
  const nf = {};
  function numberFmt(min, max) {
    const k = min + '-' + max;
    return nf[k] || (nf[k] = new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max }));
  }
  const CURRENCY_DIGITS = { JPY: 0, KRW: 0, VND: 0, IDR: 0, CLP: 0, ISK: 0, HUF: 2, TWD: 2 };
  function currencyDigits(code) {
    if (code in CURRENCY_DIGITS) return CURRENCY_DIGITS[code];
    try { return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits; }
    catch (e) { return 2; }
  }
  function fmtTWD(v) { return (v < 0 ? '-' : '') + 'NT$' + numberFmt(0, 2).format(Math.abs(v)); }
  function fmtMoney(v, code) {
    if (code === 'TWD') return fmtTWD(v);
    return (v < 0 ? '-' : '') + code + ' ' + numberFmt(0, currencyDigits(code)).format(Math.abs(v));
  }
  function fmtRate(v) { return numberFmt(2, 6).format(v); }
  function fmtPercent(rate) { return numberFmt(0, 2).format(rate * 100) + '%'; }

  const api = {
    round, parseNumber, convert, fee, feeApplicable, defaultIncludesFee, effectiveRate, DEFAULT_FEE_RATE,
    dayKey, parseDay, todayKey, addDays, addMonths, clampDay, budgetPeriod, shiftPeriod, inRange,
    netExpense, netFee, summarize, breakdown, cardBalance,
    usages, isReached, pendingAlerts, thresholdsToClear, alertThresholds, notificationText,
    parseCurrencyAPI, currencyDigits, fmtTWD, fmtMoney, fmtRate, fmtPercent
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PL = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
