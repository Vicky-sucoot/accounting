/* 多幣記帳 網頁版：分頁：報表（月趨勢、圖表、點選明細）與預算 */
/* 各檔案以一般 <script> 依序載入、共用同一個全域範圍（見 index.html 的載入順序）。 */
'use strict';

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

/** 報表各維度的分組方式（圖表與點進去的明細共用） */
function chartGrouping(dim) {
  if (dim === 'category') return { keyFn: e => ({ key: e.categoryId || 'none', label: catIcon(e) + ' ' + catName(e) }), valueFn: PL.netExpense };
  if (dim === 'country') return { keyFn: e => ({ key: e.countryCode, label: regionLabel(e.countryCode) }), valueFn: PL.netExpense };
  if (dim === 'method') return { keyFn: e => ({ key: e.method, label: METHOD_ICONS[e.method] + ' ' + METHODS[e.method] }), valueFn: PL.netExpense };
  if (dim === 'card') return { keyFn: e => ({ key: e.cardId || 'none', label: cardById(e.cardId) ? cardById(e.cardId).name : '未指定卡片' }), valueFn: PL.netExpense, only: e => e.cardId && cardById(e.cardId) };
  return { keyFn: e => ({ key: e.cardId || 'none', label: cardById(e.cardId) ? cardById(e.cardId).name : '未指定卡片' }), valueFn: PL.netFee };
}
/** 點圖表的某一項：列出組成這個金額的交易 */
function openGroupDetail(dim, gkey, label, items) {
  const g = chartGrouping(dim);
  pushPage({
    title: label,
    render(body) {
      const list = S.entries.filter(e => items.some(x => x.id === e.id) && (!g.only || g.only(e)) && g.keyFn(e).key === gkey && g.valueFn(e) !== 0);
      const total = PL.round(list.reduce((a, e) => a + g.valueFn(e), 0), 2);
      const r = S.report, range = reportRange();
      let html = '<div class="hero-card"><div class="lbl">' + esc(range.title) + '・' + (dim === 'fee' ? '手續費' : '淨支出（含手續費）') + '</div><div class="big" style="margin-bottom:4px">' + PL.fmtTWD(total) + '</div>' +
        '<div class="muted small">' + list.length + ' 筆交易' + (filterCount(r.filter) ? '・已套用報表篩選' : '') + '</div></div>';
      const groups = new Map();
      list.forEach(e => { if (!groups.has(e.date)) groups.set(e.date, []); groups.get(e.date).push(e); });
      for (const [day, rows] of groups) html += '<div class="dayh"><span>' + esc(dayHeader(day)) + '</span><span></span></div><div class="group">' + rows.map(entryRowHTML).join('') + '</div>';
      body.innerHTML = html || '<div class="empty">沒有交易</div>';
      bindEntryRows(body);
    }
  });
}
function drawChart(host, items, dim) {
  const g = chartGrouping(dim);
  const data = PL.breakdown(g.only ? items.filter(g.only) : items, g.keyFn, g.valueFn);
  if (!data.length) { host.innerHTML = '<div class="group"><div class="empty">此期間沒有可統計的' + (dim === 'fee' ? '手續費' : '支出') + '</div></div>'; return; }
  const total = data.reduce((a, g) => a + g.value, 0);
  const pct = v => Math.round(v / total * 100) + '%';
  const note = '<div class="sec-f">' + (dim === 'fee' ? '手續費淨額（退回的手續費已扣除）。' : '金額為淨支出，含刷卡手續費並扣除退款。') + '</div>';
  // 分類圖使用分類自己的顏色
  const colorOf = (grp, i) => dim === 'category' ? (grp.key === 'none' ? '#9aa5ab' : catColor(catById(grp.key))) : 'var(' + CHART_COLORS[i % CHART_COLORS.length] + ')';
  if (dim === 'category') {
    const R = 80, C = 2 * Math.PI * R;
    let offset = 0;
    const arcs = data.map((g, i) => {
      const len = g.value / total * C;
      const gap = data.length > 1 ? Math.min(2, len / 3) : 0;
      const s = '<circle data-gkey="' + esc(g.key) + '" r="' + R + '" cx="100" cy="100" fill="none" stroke="' + colorOf(g, i) + '" stroke-width="30" stroke-dasharray="' + Math.max(len - gap, 0.01).toFixed(2) + ' ' + C.toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 100 100)"/>';
      offset += len; return s;
    }).join('');
    host.innerHTML = '<div class="group chart"><svg class="donut" viewBox="0 0 200 200" role="img" aria-label="分類支出比例">' + arcs +
      '<text x="100" y="94" text-anchor="middle" font-size="12" fill="var(--muted)">淨支出</text><text x="100" y="114" text-anchor="middle" font-size="16" font-weight="700" fill="var(--fg)">' + esc(PL.fmtTWD(total)) + '</text></svg>' +
      '<div class="legend">' + data.map((g, i) => '<button class="row link" data-gkey="' + esc(g.key) + '"><span class="dot" style="background:' + colorOf(g, i) + '"></span><span class="k">' + esc(g.label) + '</span><span class="v num">' + PL.fmtTWD(g.value) + '　' + pct(g.value) + '</span></button>').join('') + '</div></div>' + note;
  } else {
    const max = data[0].value;
    host.innerHTML = '<div class="group">' + data.map(g => '<button class="hbar ' + (dim === 'fee' ? 'fee' : '') + '" data-gkey="' + esc(g.key) + '"><div class="t"><span>' + esc(g.label) + '</span><span>' + PL.fmtTWD(g.value) + '　' + pct(g.value) + ' ›</span></div><div class="track"><i style="width:' + (g.value / max * 100).toFixed(1) + '%"></i></div></button>').join('') + '</div>' + note;
  }
  host.insertAdjacentHTML('beforeend', '<div class="sec-f">點選項目可以查看組成這個金額的交易。</div>');
  $$('[data-gkey]', host).forEach(el => {
    el.addEventListener('click', () => {
      const grp = data.find(x => x.key === el.dataset.gkey);
      if (grp) openGroupDetail(dim, grp.key, grp.label.trim(), items);
    });
  });
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
