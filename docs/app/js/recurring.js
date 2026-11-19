/* 多幣記帳 網頁版：固定收支（自動記帳） */
/* 各檔案以一般 <script> 依序載入、共用同一個全域範圍（見 index.html 的載入順序）。 */
'use strict';

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
