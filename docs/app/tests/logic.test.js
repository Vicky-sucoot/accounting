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
