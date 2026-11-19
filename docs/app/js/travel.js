/* 多幣記帳 網頁版：依帳單對帳、外幣現金錢包、代墊款、旅程預算 */
/* 各檔案以一般 <script> 依序載入、共用同一個全域範圍（見 index.html 的載入順序）。 */
'use strict';

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
