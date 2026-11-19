/* 多幣記帳 網頁版：頁面堆疊（滑入／返回手勢）與共用畫面片段（交易列、左滑刪除、進度條） */
/* 各檔案以一般 <script> 依序載入、共用同一個全域範圍（見 index.html 的載入順序）。 */
'use strict';

// ======================= 頁面堆疊 =======================
const stack = [];
// 瀏覽器「上一頁」與 iPhone 返回手勢：子頁面開啟時保留一筆歷史紀錄，按返回時關閉最上層頁面
let historyGuard = false;
function pushPage(p) {
  stack.push(p);
  if (!historyGuard) { try { history.pushState({ plPage: true }, ''); historyGuard = true; } catch (e) { /* 忽略 */ } }
  renderPages(true); $('#pages').scrollTop = 0;
}
const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 關閉頁面時：複製目前畫面，讓它向右滑出（實際的頁面狀態立即更新） */
function ghostOut() {
  const cur = $('#pages .page');
  if (!cur || reduceMotion()) return;
  const g = document.createElement('div');
  g.className = 'ghost';
  const clone = cur.cloneNode(true);
  clone.classList.remove('enter');
  clone.style.marginTop = (-$('#pages').scrollTop) + 'px';
  g.appendChild(clone);
  document.body.appendChild(g);
  const from = cur.style.transform || 'translateX(0)';
  clone.style.transform = from;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    clone.style.transition = 'transform .26s cubic-bezier(.3,.7,.3,1)';
    clone.style.transform = 'translateX(105%)';
  }));
  setTimeout(() => g.remove(), 320);
}
window.addEventListener('popstate', () => {
  historyGuard = false;
  if (!stack.length) return;
  popPage();
  if (stack.length) { try { history.pushState({ plPage: true }, ''); historyGuard = true; } catch (e) { /* 忽略 */ } }
});
function popPage() { ghostOut(); const p = stack.pop(); if (p && p.onClose) p.onClose(); renderPages(); refreshView(); }
function popPages(n) { ghostOut(); for (let i = 0; i < n && stack.length; i++) { const p = stack.pop(); if (p.onClose) p.onClose(); } renderPages(); refreshView(); }
/** 主畫面 App 沒有瀏覽器返回手勢：從螢幕左緣向右滑關閉子頁面 */
(function edgeSwipe() {
  let sx = 0, sy = 0, active = false, moved = 0;
  const host = () => $('#pages .page');
  document.addEventListener('touchstart', ev => {
    const t = ev.touches[0];
    active = !!stack.length && isStandalone() && t.clientX < 28;
    sx = t.clientX; sy = t.clientY; moved = 0;
  }, { passive: true });
  document.addEventListener('touchmove', ev => {
    if (!active) return;
    const t = ev.touches[0], dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
    if (dy > 60 && dx < 40) { active = false; const h = host(); if (h) h.style.transform = ''; return; }
    moved = Math.max(0, dx);
    const h = host(); if (h) { h.style.transition = 'none'; h.style.transform = 'translateX(' + moved + 'px)'; }
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!active) return;
    active = false;
    const h = host();
    if (moved > 90) { popPage(); return; }
    if (h) { h.style.transition = 'transform .2s'; h.style.transform = ''; }
  });
})();
function closeAllPages() { if (stack.length) ghostOut(); while (stack.length) { const p = stack.pop(); if (p.onClose) p.onClose(); } renderPages(); refreshView(); }
function renderPages(entering) {
  const host = $('#pages');
  if (!stack.length) { host.hidden = true; host.replaceChildren(); document.body.style.overflow = ''; return; }
  const p = stack[stack.length - 1];
  const el = document.createElement('div');
  el.className = 'page' + (entering === true && !reduceMotion() ? ' enter' : '') + (p.footer ? ' has-foot' : '');
  el.innerHTML = '<header class="pbar"><button class="l" data-k="back">' + esc(p.leftLabel || (stack.length > 1 ? '‹ 返回' : '關閉')) + '</button>' +
    '<h1>' + esc(p.title) + '</h1>' +
    (p.right ? '<button class="r" data-k="right">' + esc(p.right.label) + '</button>' : '<span></span>') + '</header><div class="pbody"></div>';
  $('[data-k=back]', el).onclick = () => popPage();
  if (p.right) $('[data-k=right]', el).onclick = () => p.right.action();
  // 25. 固定在下方的主要按鈕（單手好按）
  if (p.footer && p.right) {
    el.insertAdjacentHTML('beforeend', '<div class="pfoot"><button class="btn primary block" data-k="footsave">' + esc(p.right.label) + '</button></div>');
    $('[data-k=footsave]', el).onclick = () => p.right.action();
  }
  host.replaceChildren(el);
  host.hidden = false;
  document.body.style.overflow = 'hidden';
  p.render($('.pbody', el), p, el);
}
function rerenderTop() { if (stack.length) renderPages(); }
function setRightEnabled(enabled) { $$('#pages [data-k=right], #pages [data-k=footsave]').forEach(b => { b.disabled = !enabled; }); }

// ======================= 共用片段 =======================
function entryRowHTML(e) {
  const t = TYPES[e.type];
  const foreign = e.currency !== 'TWD';
  let sub = [];
  if (e.type !== 'cardPayment') { sub.push(flag(e.countryCode)); sub.push(cardById(e.cardId) ? cardById(e.cardId).name : METHODS[e.method]); }
  if (e.type === 'refund') sub.push('退款');
  if (e.trip) sub.push('🧳 ' + e.trip);
  if (foreign && e.rateSource === 'manual') sub.push('手動匯率');
  if (e.rateSource === 'wallet') sub.push('現金成本');
  if (e.rateSource === 'cached') sub.push('離線匯率');
  if (e.recurringId) sub.push('🔁 固定');
  if (e.reconciled) sub.push('✓已對帳');
  if (e.advAmount) sub.push('代墊' + (e.advWho ? '・' + e.advWho : '') + (e.advSettled ? '（已收回）' : ''));
  let second = foreign ? (e.type === 'exchange' ? '付 ' : '≈ ') + PL.fmtTWD(e.amountTWD) : '';
  if (e.feeTWD) second += (second ? ' ' : '') + '＋費 ' + PL.fmtTWD(e.feeTWD);
  const cls = e.type === 'income' || e.type === 'refund' ? 'pos' : (e.type === 'cardPayment' || e.type === 'exchange' ? 'muted' : '');
  return '<div class="swipe"><button class="swdel" data-del="' + esc(e.id) + '" tabindex="-1">刪除</button><button class="erow" data-entry="' + esc(e.id) + '">' +
    '<span class="eicon" style="--ec:' + entryColor(e) + '">' + esc(catIcon(e)) + '</span>' +
    '<span class="emain"><div class="etitle">' + esc(entryTitle(e)) + (e.receipt ? ' 📎' : '') + '</div><div class="esub">' + esc(sub.join(' · ')) + '</div></span>' +
    '<span class="eamt"><div class="a ' + cls + '">' + esc(t.sign + PL.fmtMoney(e.amount, e.currency)) + '</div>' +
    (second ? '<div class="b">' + esc(second) + '</div>' : '') + '</span></button></div>';
}
/** 交易列：點選開啟明細；向左滑出現「刪除」 */
const SWIPE_W = 84;
let openSwipe = null;
function hideDel(row) { setTimeout(() => { if (openSwipe !== row && row.parentNode) row.parentNode.classList.remove('sw-on'); }, 230); }
function closeSwipe() { if (openSwipe) { const r = openSwipe; r.style.transform = ''; openSwipe = null; hideDel(r); } }
function bindEntryRows(el) {
  $$('.swipe', el).forEach(sw => {
    const row = $('.erow', sw), del = $('.swdel', sw);
    let sx = 0, sy = 0, base = 0, dx = 0, mode = null;
    row.onclick = ev => {
      if (mode === 'swipe') { ev.preventDefault(); return; }
      if (openSwipe) { const was = openSwipe; closeSwipe(); if (was === row) return; }
      openDetail(row.dataset.entry);
    };
    sw.addEventListener('touchstart', ev => {
      const t = ev.touches[0];
      sx = t.clientX; sy = t.clientY; dx = 0; mode = null;
      base = openSwipe === row ? -SWIPE_W : 0;
      if (openSwipe && openSwipe !== row) closeSwipe();
    }, { passive: true });
    sw.addEventListener('touchmove', ev => {
      const t = ev.touches[0], mx = t.clientX - sx, my = t.clientY - sy;
      if (!mode) { if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) mode = 'swipe'; else if (Math.abs(my) > 8) mode = 'scroll'; }
      if (mode !== 'swipe') return;
      dx = Math.min(0, Math.max(-SWIPE_W - 30, base + mx));
      sw.classList.add('sw-on');
      row.style.transition = 'none';
      row.style.transform = 'translateX(' + dx + 'px)';
    }, { passive: true });
    sw.addEventListener('touchend', () => {
      if (mode !== 'swipe') return;
      row.style.transition = '';
      if (dx < -SWIPE_W / 2) { row.style.transform = 'translateX(' + (-SWIPE_W) + 'px)'; openSwipe = row; }
      else { row.style.transform = ''; if (openSwipe === row) openSwipe = null; hideDel(row); }
      setTimeout(() => { mode = null; }, 50);
    });
    del.onclick = async () => {
      const e = S.entries.find(x => x.id === del.dataset.del);
      openSwipe = null;
      if (!e) return;
      sw.classList.add('removing');
      const showUndo = await deleteEntryWithUndo(e);
      setTimeout(() => { if (stack.length) rerenderTop(); refreshView(); showUndo(); }, 180);
    };
  });
}
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
