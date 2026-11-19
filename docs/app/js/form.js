/* 多幣記帳 網頁版：新增／編輯交易表單 */
/* 各檔案以一般 <script> 依序載入、共用同一個全域範圍（見 index.html 的載入順序）。 */
'use strict';

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
