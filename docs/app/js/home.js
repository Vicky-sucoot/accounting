/* 多幣記帳 網頁版：分頁：總覽、紀錄（月曆／清單）、篩選頁 */
/* 各檔案以一般 <script> 依序載入、共用同一個全域範圍（見 index.html 的載入順序）。 */
'use strict';

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
  // 所有提醒集中在一張「待辦」卡，每件事一行
  const todos = [];
  if (cachedN) todos.push('<div class="todo-row warnbanner"><span class="ti-ic" style="--ec:#0e8a9a">💱</span><span class="tx"><b>' + cachedN + ' 筆交易使用離線匯率</b><span>補查交易日匯率，金額與手續費會一併更新</span></span>' +
    '<button class="btn primary sm" data-k="refreshRates">補查</button></div>');
  dueCards.forEach(x => todos.push('<button class="todo-row warnbanner" data-duecard="' + esc(x.card.id) + '"><span class="ti-ic" style="--ec:' + (x.st.status === 'overdue' ? '#d1495b' : '#3b82c4') + '">💳</span><span class="tx"><b>' +
    esc(x.card.name) + (x.st.status === 'overdue' ? ' 已逾期' : ' 即將到期') + '</b><span>' +
    (x.st.status === 'overdue' ? '截止日 ' + fmtDate(x.st.due) + ' 已過，' : fmtDate(x.st.due) + ' 前（還有 ' + x.st.daysLeft + ' 天）') + '應繳 ' + PL.fmtTWD(x.st.remaining) + '</span></span><span class="chev">›</span></button>'));
  if (remind) todos.push('<div class="todo-row warnbanner"><span class="ti-ic" style="--ec:#e0892b">💾</span><span class="tx"><b>該備份了</b><span>' + esc(remind) + '</span></span>' +
    '<span class="acts"><button class="btn primary sm" data-k="doBackup">立即備份</button><button class="btn sm" data-k="snooze">3 天後</button></span></div>');
  if (showInstall) todos.push('<div class="todo-row"><span class="ti-ic" style="--ec:#117a88">📲</span><span class="tx"><b>加入主畫面</b><span>在 Safari 點「分享」→「加入主畫面」，就能離線使用</span></span>' +
    '<button class="x" data-k="hideInstall" aria-label="不再顯示">×</button></div>');
  v.innerHTML =
    '<h1 class="large">收支總覽</h1>' +
    (todos.length ? '<div class="sec todo"><div class="sec-h"><span>待辦 ' + todos.length + '</span></div><div class="group">' + todos.join('') + '</div></div>' : '') +
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
