/* 多幣記帳 網頁版：備份與還原、CSV 匯出、備份提醒 */
/* 各檔案以一般 <script> 依序載入、共用同一個全域範圍（見 index.html 的載入順序）。 */
'use strict';

// ======================= 備份與還原 =======================
const isoFromDay = k => { const d = PL.parseDay(k); d.setHours(12, 0, 0, 0); return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); };
const isoNoMs = s => { try { return new Date(s || Date.now()).toISOString().replace(/\.\d{3}Z$/, 'Z'); } catch (e) { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); } };
const dayFromISO = s => { const d = new Date(s); return isNaN(d) ? today() : PL.dayKey(d); };
const numStr = n => String(n === null || n === undefined ? 0 : n);
const blobToBase64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
const base64ToBlob = (b64, type) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: type || 'image/jpeg' }); };

/** 與 iOS 原生版相同的備份格式（formatVersion 1），兩邊可互相還原 */
async function buildBackup() {
  const st = S.settings;
  const receipts = [];
  for (const name of [...new Set(S.entries.map(e => e.receipt).filter(Boolean))]) {
    const r = await DB.get('receipts', name);
    if (r && r.blob) receipts.push({ fileName: name, data: await blobToBase64(r.blob) });
  }
  return {
    formatVersion: 1, app: 'PocketLedger', exportedAt: isoNoMs(), appVersion: 'web-1.10',
    settings: { defaultFeeRate: numStr(st.defaultFeeRate), feeOnDebitCard: st.feeOnDebitCard, feeOnlyForeign: st.feeOnlyForeign, favoriteCurrencies: st.favoriteCurrencies, defaultCurrency: st.defaultCurrency, defaultCountry: st.defaultCountry, budgetStartDay: st.budgetStartDay, budgetAlertsEnabled: st.budgetAlertsEnabled, warningPercent: st.warningPercent, activeTrip: st.activeTrip || '', tripBudgets: st.tripBudgets || {}, recurring: st.recurring || [] },
    categories: S.categories.map(c => ({ id: c.id, name: c.name, icon: ICON_REVERSE[c.icon] || c.icon, kind: c.kind, sortOrder: c.sortOrder, color: catColor(c) })),
    cards: S.cards.map(c => Object.assign({ id: c.id, name: c.name, lastFour: c.lastFour || '', kind: c.kind, sortOrder: c.sortOrder, createdAt: isoNoMs(c.createdAt) }, c.customFeeRate !== null && c.customFeeRate !== undefined ? { customFeeRate: numStr(c.customFeeRate) } : {},
      c.closingDay ? { closingDay: c.closingDay, dueDay: c.dueDay || 0 } : {})),
    budgets: S.budgets.map(b => Object.assign({ isTotal: b.isTotal, amount: numStr(b.amount) }, b.categoryId ? { categoryID: b.categoryId } : {})),
    alertRecords: S.alerts.map(a => ({ periodKey: a.periodKey, budgetKey: a.budgetKey, threshold: a.threshold, sentAt: isoNoMs(a.sentAt) })),
    entries: S.entries.slice().reverse().map(e => Object.assign({
      id: e.id, type: e.type, amount: numStr(e.amount), currency: e.currency, date: isoFromDay(e.date),
      countryCode: e.countryCode, paymentMethod: e.method, merchant: e.merchant || '', note: e.note || '',
      exchangeRate: numStr(e.rate), rateDate: isoFromDay(e.rateDate || e.date), rateSource: e.rateSource, rateDetail: e.rateDetail || '',
      amountTWD: numStr(e.amountTWD), includesFee: !!e.includesFee, feeRate: numStr(e.feeRate), feeTWD: numStr(e.feeTWD), isFeeManual: !!e.isFeeManual,
      createdAt: isoNoMs(e.createdAt), updatedAt: isoNoMs(e.updatedAt)
    }, e.trip ? { trip: e.trip } : {},
      e.advAmount ? { advAmount: numStr(e.advAmount), advWho: e.advWho || '', advTWD: numStr(e.advTWD), advFeeTWD: numStr(e.advFeeTWD), advSettled: !!e.advSettled, advSettledDate: e.advSettledDate || null } : {},
      e.reconciled ? { reconciled: true, estimate: e.estimate || null } : {},
      e.recurringId ? { recurringId: e.recurringId } : {}, e.categoryId ? { categoryID: e.categoryId } : {}, e.cardId ? { cardID: e.cardId } : {}, e.receipt ? { receiptFileName: e.receipt } : {})),
    receipts: receipts
  };
}
function validateBackup(b) {
  if (!b || b.app !== 'PocketLedger' || !Array.isArray(b.entries)) throw new Error('不是有效的記帳備份檔。');
  if (b.formatVersion > 1) throw new Error('備份檔版本（' + b.formatVersion + '）較新，請先更新 App。');
  return b;
}
async function restoreBackup(b) {
  const num = s => { const n = Number(s); return Number.isFinite(n) ? n : 0; };
  const st = Object.assign(defaultSettings(), {
    defaultFeeRate: num(b.settings.defaultFeeRate), feeOnDebitCard: !!b.settings.feeOnDebitCard, feeOnlyForeign: !!b.settings.feeOnlyForeign,
    favoriteCurrencies: b.settings.favoriteCurrencies || DEFAULT_FAVORITES.slice(), defaultCurrency: b.settings.defaultCurrency || 'TWD',
    defaultCountry: b.settings.defaultCountry || 'TW', budgetStartDay: PL.clampDay(b.settings.budgetStartDay),
    budgetAlertsEnabled: b.settings.budgetAlertsEnabled !== false, warningPercent: b.settings.warningPercent || 80,
    activeTrip: b.settings.activeTrip || '', tripBudgets: b.settings.tripBudgets || {}, recurring: b.settings.recurring || []
  });
  const cats = (b.categories || []).map(c => ({ id: c.id, name: c.name, icon: ICON_MAP[c.icon] || (/^[a-z0-9.]+$/.test(c.icon) ? '🏷️' : c.icon), kind: c.kind === 'income' ? 'income' : 'expense', sortOrder: c.sortOrder || 0, color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : undefined }));
  const catIds = new Set(cats.map(c => c.id));
  const cards = (b.cards || []).map(c => ({ id: c.id, name: c.name, lastFour: c.lastFour || '', kind: c.kind === 'debit' ? 'debit' : 'credit', customFeeRate: c.customFeeRate !== undefined && c.customFeeRate !== null ? num(c.customFeeRate) : null, sortOrder: c.sortOrder || 0, createdAt: c.createdAt, closingDay: c.closingDay || 0, dueDay: c.dueDay || 0 }));
  const cardIds = new Set(cards.map(c => c.id));
  const budgets = (b.budgets || []).filter(x => x.isTotal || catIds.has(x.categoryID)).map(x => ({ id: uid(), isTotal: !!x.isTotal, categoryId: x.isTotal ? null : x.categoryID, amount: num(x.amount) }));
  const alerts = (b.alertRecords || []).map(a => ({ id: a.periodKey + '|' + a.budgetKey + '|' + a.threshold, periodKey: a.periodKey, budgetKey: a.budgetKey, threshold: a.threshold, sentAt: a.sentAt }));
  const entries = b.entries.map(d => ({
    id: d.id, type: d.type, amount: num(d.amount), currency: d.currency, date: dayFromISO(d.date),
    categoryId: catIds.has(d.categoryID) ? d.categoryID : null, countryCode: d.countryCode || 'TW', method: d.paymentMethod || 'other',
    cardId: cardIds.has(d.cardID) ? d.cardID : null, merchant: d.merchant || '', note: d.note || '',
    rate: num(d.exchangeRate) || 1, rateDate: d.rateDate ? dayFromISO(d.rateDate) : dayFromISO(d.date), rateSource: d.rateSource || 'manual', rateDetail: d.rateDetail || '',
    amountTWD: num(d.amountTWD), includesFee: !!d.includesFee, feeRate: num(d.feeRate), feeTWD: num(d.feeTWD), isFeeManual: !!d.isFeeManual,
    receipt: d.receiptFileName ? String(d.receiptFileName).split('/').pop() : null, createdAt: d.createdAt, updatedAt: d.updatedAt,
    trip: d.trip || '',
    advAmount: d.advAmount ? num(d.advAmount) : 0, advWho: d.advWho || '', advTWD: d.advTWD ? num(d.advTWD) : 0, advFeeTWD: d.advFeeTWD ? num(d.advFeeTWD) : 0,
    advSettled: !!d.advSettled, advSettledDate: d.advSettledDate || null, reconciled: !!d.reconciled, estimate: d.estimate || null, recurringId: d.recurringId || null
  }));
  const receipts = (b.receipts || []).map(r => ({ name: String(r.fileName).split('/').pop(), blob: base64ToBlob(r.data) }));
  await DB.clearAll();
  await DB.put('settings', st);
  await DB.putMany('categories', cats);
  await DB.putMany('cards', cards);
  await DB.putMany('budgets', budgets);
  await DB.putMany('alerts', alerts);
  await DB.putMany('receipts', receipts);
  await DB.putMany('entries', entries);
  await loadAll();
}
function markBackedUp() { lsSet('pl.lastBackup', today()); lsSet('pl.backupCount', S.entries.length); lsSet('pl.snoozeBackup', null); }
/** 透過分享選單（iPhone：儲存到檔案、AirDrop）或下載存檔；回傳 'shared' | 'downloaded' | null */
async function saveFile(name, text, mime) {
  const file = new File([text], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return null; }
  }
  // 下載備援：部分瀏覽器不支援中文檔名，改用英數檔名
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name.replace('記帳備份', 'PocketLedger-backup').replace('記帳明細', 'PocketLedger-transactions').replace('全部', 'all').replace(/[^\x20-\x7e]/g, '');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return 'downloaded';
}
async function exportBackup() {
  try {
    const json = JSON.stringify(await buildBackup(), null, 2);
    const r = await saveFile('記帳備份_' + today() + '.json', json, 'application/json');
    if (!r) return false;
    markBackedUp();
    toast(r === 'shared' ? '已匯出備份檔' : '備份檔已下載');
    return true;
  } catch (e) { toast('匯出失敗：' + e.message); return false; }
}
/** 匯出交易明細 CSV（Excel／Numbers 可開啟） */
async function exportCSV(entries, label) {
  const rows = [['日期', '類型', '分類', '商家', '備註', '國家／地區', '付款方式', '卡片', '旅程', '幣別', '原幣金額',
    '匯率', '匯率日期', '匯率來源', '新台幣金額', '手續費', '含手續費總額', '對支出的影響', '代墊對象', '代墊金額（原幣）', '代墊新台幣', '代墊已收回', '已對帳']];
  entries.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
    rows.push([e.date, TYPES[e.type].t, e.type === 'cardPayment' ? '' : catName(e), e.merchant || '', e.note || '',
      regionName(e.countryCode), METHODS[e.method], cardById(e.cardId) ? cardById(e.cardId).name : '', e.trip || '',
      e.currency, e.amount, e.rate, e.rateDate || '', RATE_SOURCES[e.rateSource] || e.rateSource,
      e.amountTWD, e.feeTWD, PL.round(e.amountTWD + e.feeTWD, 2), PL.round(PL.netExpense(e), 2),
      e.advAmount ? e.advWho || '' : '', e.advAmount || '', e.advAmount ? PL.round(PL.advanceTWD(e), 2) : '', e.advAmount ? (e.advSettled ? '是' : '否') : '', e.reconciled ? '是' : '']);
  });
  try {
    const r = await saveFile('記帳明細_' + label + '.csv', PL.toCSV(rows), 'text/csv');
    if (r) toast('已匯出 ' + entries.length + ' 筆交易');
  } catch (e) { toast('匯出失敗：' + e.message); }
}
/** 備份提醒：有資料且（從未備份、超過 14 天，或新增 30 筆以上）時提醒；可延後 3 天 */
const BACKUP_DAYS = 14, BACKUP_ENTRIES = 30;
function backupReminder() {
  if (!S.entries.length) return null;
  const snooze = lsGet('pl.snoozeBackup', null);
  if (snooze && snooze > today()) return null;
  const last = lsGet('pl.lastBackup', null);
  const added = S.entries.length - lsGet('pl.backupCount', 0);
  if (!last) return '尚未備份過記帳資料。網頁版資料只存在這台裝置，建議現在匯出備份檔。';
  const days = Math.round((PL.parseDay(today()) - PL.parseDay(last)) / 86400000);
  if (days >= BACKUP_DAYS) return '已經 ' + days + ' 天沒有備份了（上次 ' + fmtDate(last) + '）。';
  if (added >= BACKUP_ENTRIES) return '上次備份後已新增 ' + added + ' 筆交易。';
  return null;
}
function openBackup() {
  pushPage({
    title: '備份與還原',
    render(body) {
      const nReceipts = S.entries.filter(e => e.receipt).length;
      const item = (t, d) => '<div class="row stack"><b>' + t + '</b><span class="muted small">' + d + '</span></div>';
      body.innerHTML = '<div class="sec"><div class="sec-h"><span>目前資料</span></div><div class="group">' +
        '<div class="row"><span class="k">交易筆數</span><span class="v">' + S.entries.length + '</span></div>' +
        '<div class="row"><span class="k">收據照片</span><span class="v">' + nReceipts + ' 張</span></div>' +
        '<div class="row"><span class="k">上次備份</span><span class="v">' + (lsGet('pl.lastBackup', null) ? fmtDate(lsGet('pl.lastBackup', null)) : '尚未備份') + '</span></div></div></div>' +
        '<div class="sec"><div class="group"><button class="row accent" data-k="export">⬆️ 匯出備份檔</button>' +
        '<button class="row accent" data-k="csv">📄 匯出全部交易（CSV，可用 Excel 開啟）</button>' +
        '<label class="row accent filebtn" style="position:relative">⬇️ 從備份檔還原<input type="file" accept=".json,application/json" id="bk-file"></label></div>' +
        '<div class="sec-f">還原會以備份內容「完整取代」目前所有資料（交易、分類、卡片、預算、設定與收據照片）。</div></div>' +
        '<div class="sec"><div class="sec-h"><span>說明</span></div><div class="group">' +
        item('CSV 明細', 'CSV 只用來在 Excel／Numbers 分析，不含收據照片，也不能用來還原；還原請使用備份檔（JSON）。') +
        item('檔案格式', '單一 JSON 檔（例如「記帳備份_2026-11-18.json」），包含記帳紀錄、分類、卡片、預算、提醒狀態、設定，以及內嵌的收據照片。格式與 iOS 原生版相同，可以互相還原。') +
        item('儲存位置', '匯出時會開啟分享選單：選「儲存到檔案」可存到「我的 iPhone」、iCloud 雲碟等，也可以用 AirDrop 傳到電腦。App 本身不會上傳任何資料。') +
        item('加密', '備份檔未加密，內容可被任何人讀取（包括收據照片）。請存放在你信任的位置，不要公開分享。') +
        item('App 鎖定', '密碼與 Face ID 設定不包含在備份檔；在新裝置還原後請重新設定。') +
        item('更換手機或刪除 App', '網頁版資料只存在目前這個瀏覽器／主畫面 App 中，換手機、刪除主畫面 App 或清除 Safari 網站資料都會遺失，請先匯出備份檔，再到新裝置還原。') + '</div></div>';
      $('[data-k=export]', body).onclick = async () => { await exportBackup(); rerenderTop(); };
      $('[data-k=csv]', body).onclick = () => exportCSV(S.entries, '全部_' + today());
      const fi = $('#bk-file', body);
      fi.onchange = async () => {
        const file = fi.files && fi.files[0]; if (!file) return;
        try {
          const b = validateBackup(JSON.parse(await file.text()));
          const when = b.exportedAt ? fmtDate(dayFromISO(b.exportedAt)) : '未知';
          if (!confirm('確定要還原？\n備份時間：' + when + '\n交易 ' + b.entries.length + ' 筆、收據 ' + (b.receipts || []).length + ' 張。\n目前裝置上的資料將被完全取代。')) { fi.value = ''; return; }
          await restoreBackup(b);
          closeAllPages();
          toast('還原完成：共 ' + b.entries.length + ' 筆交易');
        } catch (e) { toast(e instanceof SyntaxError ? '不是有效的記帳備份檔。' : e.message); fi.value = ''; }
      };
    }
  });
}
