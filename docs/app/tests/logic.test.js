// 執行：node --test docs/app/tests/logic.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const PL = require('../logic.js');

const policy = { defaultFeeRate: 0.03, feeOnDebitCard: false, feeOnlyForeign: false };
const e = (type, amount, currency, amountTWD, feeTWD = 0, extra = {}) =>
  Object.assign({ type, amount, currency, amountTWD, feeTWD, date: PL.todayKey(), categoryId: null }, extra);

test('外幣刷卡：換算與手續費四捨五入', () => {
  const twd = PL.convert(100, 31.5);
  assert.equal(twd, 3150);
  assert.equal(PL.fee(twd, 0.03), 95);          // 94.5 → 95
  assert.equal(PL.convert(1234, 0.2135), 263.46); // 263.459
});

test('手續費適用範圍', () => {
  assert.equal(PL.feeApplicable('expense', 'cash', 'USD', policy), false);
  assert.equal(PL.feeApplicable('expense', 'ePayment', 'USD', policy), false);
  assert.equal(PL.feeApplicable('expense', 'creditCard', 'TWD', policy), true);
  assert.equal(PL.feeApplicable('expense', 'creditCard', 'TWD', { ...policy, feeOnlyForeign: true }), false);
  assert.equal(PL.feeApplicable('expense', 'debitCard', 'JPY', policy), false);
  assert.equal(PL.feeApplicable('expense', 'debitCard', 'JPY', { ...policy, feeOnDebitCard: true }), true);
  assert.equal(PL.feeApplicable('income', 'creditCard', 'USD', policy), false);
  assert.equal(PL.feeApplicable('refund', 'creditCard', 'USD', policy), true);
  assert.equal(PL.defaultIncludesFee('refund', 'creditCard', 'USD', policy), false);
  assert.equal(PL.effectiveRate(0.015, policy), 0.015);
  assert.equal(PL.effectiveRate(null, policy), 0.03);
});

test('預算週期與自訂起始日', () => {
  assert.deepEqual([PL.budgetPeriod('2026-11-18', 1).start, PL.budgetPeriod('2026-11-18', 1).end], ['2026-11-01', '2026-12-01']);
  assert.equal(PL.budgetPeriod('2026-11-18', 25).start, '2026-10-25');
  assert.equal(PL.budgetPeriod('2026-11-25', 25).start, '2026-11-25');
  assert.equal(PL.budgetPeriod('2027-01-03', 10).start, '2026-12-10');
  assert.equal(PL.budgetPeriod('2026-11-18', 5).title, '11/5 – 12/4');
  assert.equal(PL.clampDay(31), 28);
});

test('預算使用量含手續費、扣退款、不含收入與繳卡費', () => {
  const food = 'food';
  const period = PL.budgetPeriod(PL.todayKey(), 1);
  const defs = [
    { key: 'total', name: '總', amount: 10000, categoryId: null },
    { key: food, name: '餐飲', amount: 1000, categoryId: food }
  ];
  const items = [
    e('expense', 800, 'TWD', 800, 24, { categoryId: food }),
    e('refund', 100, 'TWD', 100, 0, { categoryId: food }),
    e('expense', 3000, 'TWD', 3000, 90),
    e('income', 50000, 'TWD', 50000),
    e('cardPayment', 5000, 'TWD', 5000)
  ];
  const u = PL.usages(defs, items, period);
  assert.equal(u[0].spent, 3814);
  assert.equal(u[1].spent, 724);
  assert.equal(u[1].percent, 72);
});

test('每個門檻只提醒一次；調高預算後清除未達門檻', () => {
  const u = { budget: 1000, spent: 850, percent: 85 };
  assert.deepEqual(PL.pendingAlerts(u, [80, 100], new Set()), [80]);
  assert.deepEqual(PL.pendingAlerts(u, [80, 100], new Set([80])), []);
  const over = { budget: 1000, spent: 1200 };
  assert.deepEqual(PL.pendingAlerts(over, [80, 100], new Set([80])), [100]);
  assert.deepEqual(PL.pendingAlerts(over, [80, 100], new Set()), [80, 100]);
  assert.deepEqual(PL.thresholdsToClear({ budget: 1400, spent: 1200 }, new Set([80, 100])), [100]);
  const t = PL.notificationText({ name: '餐飲', budget: 10000, spent: 8200, percent: 82 }, 80);
  assert.match(t.title, /餐飲/);
  assert.match(t.body, /NT\$8,200.*NT\$10,000.*82%/);
});

test('統計：各幣別分開、繳卡費不計支出', () => {
  const s = PL.summarize([
    e('expense', 120, 'USD', 3780, 113),
    e('expense', 8000, 'JPY', 1708, 51),
    e('expense', 3500, 'TWD', 3500),
    e('income', 50000, 'TWD', 50000),
    e('cardPayment', 4000, 'TWD', 4000)
  ]);
  assert.deepEqual(s.byCurrency.map(c => c.currency), ['TWD', 'JPY', 'USD']);
  assert.equal(s.byCurrency.find(c => c.currency === 'USD').net, 120);
  assert.equal(s.expense, 3780 + 113 + 1708 + 51 + 3500);
  assert.equal(s.fee, 164);
  assert.equal(s.spending, 3780 + 1708 + 3500);
  assert.equal(s.cardPayment, 4000);
  assert.equal(s.balance, 50000 - s.expense);
});

test('卡片估計未繳', () => {
  const b = PL.cardBalance([e('expense', 100, 'USD', 3150, 95), e('refund', 20, 'USD', 630), e('cardPayment', 2000, 'TWD', 2000)]);
  assert.equal(b.outstanding, 3245 - 630 - 2000);
});

test('匯率 API 解析與數字輸入', () => {
  assert.deepEqual(PL.parseCurrencyAPI({ date: '2026-11-16', usd: { twd: 31.523456 } }, 'USD'), { rate: 31.523456, date: '2026-11-16' });
  assert.equal(PL.parseCurrencyAPI({ date: 'x', usd: {} }, 'USD'), null);
  assert.equal(PL.parseNumber('1,234.5'), 1234.5);
  assert.equal(PL.parseNumber('abc'), null);
  assert.equal(PL.parseNumber(''), null);
  assert.equal(PL.fmtMoney(8000, 'JPY'), 'JPY 8,000');
  assert.equal(PL.fmtTWD(-1234.5), '-NT$1,234.5');
});

test('信用卡帳單週期與繳款日', () => {
  // 結帳日 25、繳款日 10（次月）
  assert.deepEqual(PL.statementCycle('2026-11-18', 25), { start: '2026-10-26', close: '2026-11-25' });
  assert.deepEqual(PL.statementCycle('2026-11-26', 25), { start: '2026-11-26', close: '2026-12-25' });
  assert.equal(PL.dueDate('2026-11-25', 25, 10), '2026-12-10');
  // 結帳日 5、繳款日 20（同月）
  assert.equal(PL.dueDate('2026-11-05', 5, 20), '2026-11-20');
  // 月底結帳（31 日）在 2 月取月底
  assert.deepEqual(PL.statementCycle('2027-02-10', 31), { start: '2027-02-01', close: '2027-02-28' });
  assert.equal(PL.statementCycle('2027-03-05', 31).start, '2027-03-01');
});

test('卡片帳單：上期金額、繳款、狀態', () => {
  const x = (type, date, twd, fee = 0) => ({ type, date, amountTWD: twd, feeTWD: fee });
  const items = [
    x('expense', '2026-10-28', 3150, 95),   // 上期（10/26–11/25）
    x('refund', '2026-11-02', 630),
    x('expense', '2026-11-27', 500),        // 本期
    x('cardPayment', '2026-11-28', 1000)    // 結帳後繳款
  ];
  const s = PL.cardStatement(items, 25, 10, '2026-12-08');
  assert.equal(s.last.amount, 2615);
  assert.equal(s.last.paid, 1000);
  assert.equal(s.last.remaining, 1615);
  assert.equal(s.last.due, '2026-12-10');
  assert.equal(s.last.daysLeft, 2);
  assert.equal(s.last.status, 'dueSoon');
  assert.equal(s.current.amount, 500);
  assert.equal(PL.cardStatement(items, 25, 10, '2026-12-11').last.status, 'overdue');
  items.push(x('cardPayment', '2026-12-09', 1615));
  assert.equal(PL.cardStatement(items, 25, 10, '2026-12-11').last.status, 'paid');
});

test('月趨勢', () => {
  const m = PL.monthlyTotals([
    e('expense', 100, 'TWD', 100, 3, { date: '2026-11-03' }),
    e('refund', 20, 'TWD', 20, 0, { date: '2026-11-05' }),
    e('income', 500, 'TWD', 500, 0, { date: '2026-10-01' }),
    e('expense', 50, 'TWD', 50, 0, { date: '2026-04-30' })   // 範圍外
  ], '2026-11-18', 6);
  assert.deepEqual(m.map(x => x.key), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.equal(m[5].expense, 83);
  assert.equal(m[5].fee, 3);
  assert.equal(m[4].income, 500);
});

test('CSV 跳脫與 BOM', () => {
  const csv = PL.toCSV([['商家', '金額'], ['A, "B"', 10], ['=SUM(1)', -5]]);
  assert.ok(csv.startsWith('﻿商家,金額\r\n'));
  assert.ok(csv.includes('"A, ""B""",10'));
  assert.ok(csv.includes('"=SUM(1)",-5'));
});

test('外幣現金錢包：移動平均成本', () => {
  const w = (type, amount, twd, date, extra = {}) => Object.assign({ id: date + type + amount, type, amount, currency: 'JPY', amountTWD: twd, feeTWD: 0, method: 'cash', date, createdAt: date }, extra);
  const items = [
    w('exchange', 10000, 2200, '2026-11-01'),            // 0.22
    w('exchange', 10000, 2000, '2026-11-02'),            // 0.20 → 平均 0.21
    w('expense', 5000, 1050, '2026-11-03', { rate: 0.21 }),
    w('expense', 3000, 999, '2026-11-03', { method: 'creditCard' }),   // 刷卡不影響錢包
    w('exchange', 5000, 1150, '2026-11-10')              // 0.23
  ];
  const s1 = PL.walletState(items, 'JPY', { until: '2026-11-05' });
  assert.equal(s1.balance, 15000);
  assert.equal(s1.avgRate, 0.21);
  const s2 = PL.walletState(items, 'JPY');
  assert.equal(s2.balance, 20000);
  assert.equal(s2.cost, 3150 + 1150);
  assert.equal(s2.avgRate, 0.215);
  assert.equal(PL.walletState(items, 'USD').balance, 0);
});

test('代墊：自己的支出扣除代墊部分（含按比例手續費）', () => {
  const sp = PL.advanceSplit(100, 3150, 95, 40);   // 幫朋友付 USD 40
  assert.deepEqual(sp, { advTWD: 1260, advFeeTWD: 38 });
  const x = e('expense', 100, 'USD', 3150, 95, { advAmount: 40, advTWD: sp.advTWD, advFeeTWD: sp.advFeeTWD });
  assert.equal(PL.netExpense(x), 3245 - 1298);
  assert.equal(PL.netFee(x), 57);
  const s = PL.summarize([x, e('exchange', 10000, 'JPY', 2100)]);
  assert.equal(s.expense, 1947);
  assert.equal(s.advance, 1298);
  assert.equal(s.exchange, 2100);
  assert.equal(s.byCurrency.find(c => c.currency === 'USD').net, 60);
  assert.equal(s.byCurrency.find(c => c.currency === 'JPY'), undefined);   // 換匯不列入各幣別支出
  // 卡片帳務仍以實際刷卡全額計算
  assert.equal(PL.cardBalance([x]).charges, 3245);
});
