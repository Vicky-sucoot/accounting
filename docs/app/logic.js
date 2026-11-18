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
  /** 代墊給別人的部分（新台幣，含按比例分攤的手續費） */
  function advanceTWD(e) { return e.type === 'expense' ? (e.advTWD || 0) + (e.advFeeTWD || 0) : 0; }
  /** 對自己支出的淨影響（含手續費、扣除代墊）：支出為正、退款為負；收入、繳卡費、換匯為 0 */
  function netExpense(e) {
    if (e.type === 'expense') return e.amountTWD + e.feeTWD - advanceTWD(e);
    if (e.type === 'refund') return -(e.amountTWD + e.feeTWD);
    return 0;
  }
  function netFee(e) {
    if (e.type === 'expense') return e.feeTWD - (e.advFeeTWD || 0);
    if (e.type === 'refund') return -e.feeTWD;
    return 0;
  }
  /** 代墊：依原幣代墊金額占比，拆出新台幣金額與手續費 */
  function advanceSplit(amount, amountTWD, feeTWD, advAmount) {
    if (!(advAmount > 0) || !(amount > 0)) return { advTWD: 0, advFeeTWD: 0 };
    const ratio = Math.min(advAmount / amount, 1);
    return { advTWD: round(amountTWD * ratio, 2), advFeeTWD: round(feeTWD * ratio, 2) };
  }

  // ---------- 外幣現金錢包（移動平均成本） ----------
  /** 會影響外幣現金餘額的交易：換匯（+）、現金支出（−）、現金退款（+） */
  function isWalletEvent(e, currency) {
    if (e.currency !== currency || currency === 'TWD') return false;
    if (e.type === 'exchange') return true;
    return e.method === 'cash' && (e.type === 'expense' || e.type === 'refund');
  }
  /**
   * 計算某幣別現金錢包的餘額與平均成本。
   * opts.until：只計入日期 ≤ until 的交易；opts.excludeId：排除正在編輯的交易。
   */
  function walletState(entries, currency, opts) {
    opts = opts || {};
    const events = entries.filter(e => isWalletEvent(e, currency) && e.id !== opts.excludeId && (!opts.until || e.date <= opts.until))
      .slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    let balance = 0, cost = 0, lastRate = null;
    for (const e of events) {
      if (e.type === 'exchange') {
        balance += e.amount; cost += e.amountTWD; lastRate = e.amountTWD / e.amount;
      } else {
        const avg = balance > 0 ? cost / balance : (lastRate || e.rate || 0);
        const sign = e.type === 'expense' ? -1 : 1;
        balance += sign * e.amount;
        cost += sign * e.amount * avg;
        if (balance <= 1e-9) { balance = Math.max(balance, 0); cost = balance > 0 ? cost : 0; }
      }
    }
    const avgRate = balance > 1e-9 ? cost / balance : lastRate;
    return { balance: round(balance, 6), cost: round(cost, 2), avgRate: avgRate ? round(avgRate, 6) : null, count: events.length };
  }

  function summarize(entries) {
    const s = { income: 0, expense: 0, spending: 0, fee: 0, refund: 0, cardPayment: 0, exchange: 0, advance: 0, count: 0, byCurrency: [] };
    const cur = {};
    for (const e of entries) {
      s.count++;
      if (e.type === 'cardPayment') { s.cardPayment += e.amountTWD; continue; }
      if (e.type === 'exchange') { s.exchange += e.amountTWD; continue; }   // 換匯是轉換，不是支出
      const c = cur[e.currency] || (cur[e.currency] = { currency: e.currency, income: 0, expense: 0, refund: 0 });
      if (e.type === 'income') { s.income += e.amountTWD; c.income += e.amount; }
      if (e.type === 'expense') { c.expense += e.amount - (e.advAmount || 0); s.advance += advanceTWD(e); }
      if (e.type === 'refund') { s.refund += e.amountTWD + e.feeTWD; c.refund += e.amount; }
      s.expense += netExpense(e);
      s.fee += netFee(e);
    }
    s.income = round(s.income, 2); s.expense = round(s.expense, 2); s.fee = round(s.fee, 2);
    s.refund = round(s.refund, 2); s.cardPayment = round(s.cardPayment, 2);
    s.exchange = round(s.exchange, 2); s.advance = round(s.advance, 2);
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

  // ---------- 信用卡帳單週期 ----------
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  /** 某年月的結帳日（超過當月天數時取月底），回傳 YYYY-MM-DD */
  function dayInMonth(y, m, day) {
    const d = new Date(y, m, 1);
    return dayKey(new Date(d.getFullYear(), d.getMonth(), Math.min(day, daysInMonth(d.getFullYear(), d.getMonth()))));
  }
  /** 含 dateKey 的帳單週期：上次結帳日隔天 ～ 本次結帳日（含） */
  function statementCycle(dateKey, closingDay) {
    const d = parseDay(dateKey);
    let close = dayInMonth(d.getFullYear(), d.getMonth(), closingDay);
    if (dateKey > close) close = dayInMonth(d.getFullYear(), d.getMonth() + 1, closingDay);
    const c = parseDay(close);
    const prevClose = dayInMonth(c.getFullYear(), c.getMonth() - 1, closingDay);
    return { start: addDays(prevClose, 1), close: close };
  }
  function previousCycle(cycle, closingDay) { return statementCycle(addDays(cycle.start, -1), closingDay); }
  /** 繳款截止日：繳款日大於結帳日時在同月，否則在次月 */
  function dueDate(closeKey, closingDay, dueDay) {
    const c = parseDay(closeKey);
    const sameMonth = dueDay > closingDay;
    return dayInMonth(c.getFullYear(), c.getMonth() + (sameMonth ? 0 : 1), dueDay);
  }
  /**
   * 卡片帳單概況（新台幣）。entries 為該卡片的交易。
   * 上期帳單金額 = 上期週期內刷卡（含手續費）− 退款；結帳日之後的繳卡費視為繳這期帳單。
   */
  function cardStatement(entries, closingDay, dueDay, todayKey) {
    const cur = statementCycle(todayKey, closingDay);
    const last = previousCycle(cur, closingDay);
    const sumCharges = (s, e) => entries.filter(x => x.date >= s && x.date <= e)
      .reduce((a, x) => a + (x.type === 'expense' ? x.amountTWD + x.feeTWD : x.type === 'refund' ? -(x.amountTWD + x.feeTWD) : 0), 0);
    const amount = round(Math.max(sumCharges(last.start, last.close), 0), 2);
    const paid = round(entries.filter(x => x.type === 'cardPayment' && x.date > last.close && x.date <= todayKey)
      .reduce((a, x) => a + x.amountTWD, 0), 2);
    const remaining = round(Math.max(amount - paid, 0), 2);
    const due = dueDay ? dueDate(last.close, closingDay, dueDay) : null;
    const daysLeft = due ? Math.round((parseDay(due) - parseDay(todayKey)) / 86400000) : null;
    let status = 'none';
    if (amount <= 0) status = 'none';
    else if (remaining <= 0) status = 'paid';
    else if (due && daysLeft < 0) status = 'overdue';
    else if (due && daysLeft <= 3) status = 'dueSoon';
    else status = 'unpaid';
    return {
      last: { start: last.start, close: last.close, amount, paid, remaining, due, daysLeft, status },
      current: { start: cur.start, close: cur.close, amount: round(sumCharges(cur.start, cur.close), 2) }
    };
  }

  // ---------- 月趨勢 ----------
  /** 截至 endDateKey 所在月份、往前 n 個月的每月收入、淨支出（含手續費）、手續費 */
  function monthlyTotals(entries, endDateKey, n) {
    const end = parseDay(endDateKey);
    const months = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
      months.push({ key: d.getFullYear() + '-' + pad(d.getMonth() + 1), year: d.getFullYear(), month: d.getMonth() + 1, income: 0, expense: 0, fee: 0 });
    }
    const map = new Map(months.map(m => [m.key, m]));
    for (const e of entries) {
      const m = map.get(e.date.slice(0, 7));
      if (!m) continue;
      if (e.type === 'income') m.income += e.amountTWD;
      m.expense += netExpense(e);
      m.fee += netFee(e);
    }
    months.forEach(m => { m.income = round(m.income, 2); m.expense = round(m.expense, 2); m.fee = round(m.fee, 2); });
    return months;
  }

  // ---------- 月曆 ----------
  /** 月曆格子：monthKey 為 YYYY-MM，回傳每週 7 格（週日起），月份外為 null */
  function calendarWeeks(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const days = daysInMonth(y, m - 1);
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(y + '-' + pad(m) + '-' + pad(d));
    while (cells.length % 7) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }
  /** 每日合計：{ 'YYYY-MM-DD': { expense（淨支出含手續費）, income, count } } */
  function dailyTotals(entries) {
    const map = {};
    for (const e of entries) {
      const d = map[e.date] || (map[e.date] = { expense: 0, income: 0, count: 0 });
      d.count++;
      d.expense += netExpense(e);
      if (e.type === 'income') d.income += e.amountTWD;
    }
    Object.values(map).forEach(d => { d.expense = round(d.expense, 2); d.income = round(d.income, 2); });
    return map;
  }

  // ---------- CSV ----------
  /** 產生 CSV（含 UTF-8 BOM，Excel 開啟中文不亂碼） */
  function toCSV(rows) {
    const cell = v => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) && isNaN(Number(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
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
    netExpense, netFee, advanceTWD, advanceSplit, walletState, isWalletEvent, summarize, breakdown, cardBalance,
    usages, isReached, pendingAlerts, thresholdsToClear, alertThresholds, notificationText,
    statementCycle, previousCycle, dueDate, cardStatement, monthlyTotals, toCSV,
    calendarWeeks, dailyTotals,
    parseCurrencyAPI, currencyDigits, fmtTWD, fmtMoney, fmtRate, fmtPercent
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PL = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
