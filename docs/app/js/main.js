/* 多幣記帳 網頁版：分頁切換與啟動 */
/* 各檔案以一般 <script> 依序載入、共用同一個全域範圍（見 index.html 的載入順序）。 */
'use strict';

// ======================= 分頁切換 =======================
const RENDERERS = { home: renderHome, list: renderList, reports: renderReports, budget: renderBudget, settings: renderSettings };
function refreshView() {
  revokeURLs();
  const v = $('#view');
  const y = window.scrollY;
  RENDERERS[S.tab](v);
  window.scrollTo(0, y);
}
function switchTab(tab) {
  S.tab = tab;
  $$('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  lsSet('pl.tab', tab);
  RENDERERS[tab]($('#view'));
  window.scrollTo(0, 0);
}

// ======================= 啟動 =======================
async function start() {
  syncThemeColor();
  showLock();
  try { await loadAll(); } catch (e) {
    $('#view').innerHTML = '<div class="empty"><b>無法開啟本機資料庫</b>請確認瀏覽器允許網站資料儲存（Safari 私密瀏覽模式無法使用）。</div>';
    return;
  }
  $$('.tabbar button').forEach(b => { b.onclick = () => switchTab(b.dataset.tab); });
  const saved = lsGet('pl.tab', 'home');
  switchTab(RENDERERS[saved] ? saved : 'home');
  await runRecurring();
  evaluateBudgets();
  setTimeout(prefetchRates, 2000);
  window.addEventListener('online', () => { prefetchRates(); if (!stack.length) refreshView(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (lockConfig().mode !== 'off' && $('#lock').hidden) showLock(); }
    else { runRecurring().then(evaluateBudgets).then(() => { if (!stack.length) refreshView(); }); prefetchRates(); }
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 離線快取不可用時仍可線上使用 */ });
  }
}
start();
// 測試用
globalThis.__PL_APP__ = { S, buildBackup, restoreBackup, evaluateBudgets, runRecurring, lastRates };
