/* 多幣記帳 網頁版：分頁：設定與各設定頁 */
/* 各檔案以一般 <script> 依序載入、共用同一個全域範圍（見 index.html 的載入順序）。 */
'use strict';

// ======================= 分頁：設定 =======================
function renderSettings(v) {
  const st = S.settings, lock = lockConfig();
  const link = (k, icon, label, value) => '<button class="row link" data-k="' + k + '"><span class="sicon" style="background:' + SETTING_COLORS[k] + '">' + svgIcon(k) + '</span><span class="k">' + esc(label) + '</span>' + (value ? '<span class="v">' + esc(value) + '</span>' : '') + '</button>';
  v.innerHTML = '<h1 class="large">設定</h1>' +
    '<div class="sec"><div class="sec-h"><span>記帳</span></div><div class="group">' +
    link('currency', '💱', '幣別與預設國家', st.defaultCurrency) +
    link('categories', '🗂️', '分類管理') +
    link('recurring', '🔁', '固定收支', (S.settings.recurring || []).filter(r => r.active !== false).length ? (S.settings.recurring || []).filter(r => r.active !== false).length + ' 項' : '') +
    link('cards', '💳', '卡片管理與繳款', S.cards.length ? S.cards.length + ' 張' : '') +
    link('fee', '％', '刷卡手續費', PL.fmtPercent(st.defaultFeeRate)) +
    link('rates', 'ℹ️', '匯率來源說明') + '</div></div>' +
    '<div class="sec"><div class="sec-h"><span>預算</span></div><div class="group">' + link('budget', '🔔', '預算週期與提醒', '每月 ' + st.budgetStartDay + ' 日起') + '</div></div>' +
    '<div class="sec"><div class="sec-h"><span>旅行與外幣</span></div><div class="group">' + link('trips', '🧳', '旅程與旅程預算', st.activeTrip ? '進行中：' + st.activeTrip : '') +
    link('wallets', '💴', '外幣現金錢包', walletCurrencies().length ? walletCurrencies().length + ' 種幣別' : '') +
    link('advances', '🤝', '代墊款', (() => { const t = S.entries.filter(e => e.advAmount && !e.advSettled).reduce((a, e) => a + PL.advanceTWD(e), 0); return t ? '待收 ' + PL.fmtTWD(PL.round(t, 2)) : ''; })()) + '</div></div>' +
    '<div class="sec"><div class="sec-h"><span>外觀</span></div><div class="group">' +
    '<div class="row"><span class="sicon" style="background:#4b5563">' + svgIcon('appearance') + '</span><span class="k">深色模式</span></div>' +
    '<div style="padding:0 14px 12px"><div class="seg" style="margin:0">' +
    [['system', '跟隨系統'], ['light', '淺色'], ['dark', '深色']].map(([k, l]) => '<button data-theme-opt="' + k + '" class="' + (currentTheme() === k ? 'on' : '') + '">' + l + '</button>').join('') +
    '</div></div></div><div class="sec-f">「跟隨系統」會隨 iPhone 的淺色／深色設定自動切換。這個選擇只存在這台裝置。</div></div>' +
    '<div class="sec"><div class="sec-h"><span>安全與資料</span></div><div class="group">' +
    link('lock', '🔒', 'App 鎖定', lock.mode === 'off' ? '未啟用' : (lock.mode === 'passcode' ? '密碼' : 'Face ID')) +
    link('backup', '💾', '備份與還原') +
    link('install', '📲', '安裝與離線使用', isStandalone() ? '已安裝' : '') + '</div>' +
    '<div class="sec-f">所有記帳資料只存在這台裝置的瀏覽器中，不使用雲端同步。網頁版 1.10</div></div>';
  const map = { currency: openCurrencySettings, categories: openCategorySettings, cards: openCardSettings, fee: openFeeSettings, rates: openRateInfo, budget: openBudgetSettings, recurring: openRecurring, trips: openTrips, wallets: openWallets, advances: openAdvances, lock: openLockSettings, backup: openBackup, install: openInstallHelp };
  $$('[data-k]', v).forEach(b => { b.onclick = () => map[b.dataset.k](); });
  $$('[data-theme-opt]', v).forEach(b => { b.onclick = () => { applyTheme(b.dataset.themeOpt); refreshView(); }; });
}

function openCurrencySettings() {
  pushPage({
    title: '幣別',
    render(body) {
      const st = S.settings;
      body.innerHTML = '<div class="sec"><div class="sec-h"><span>預設值</span></div><div class="group">' +
        '<label class="row"><span class="k">預設幣別</span><select id="c-def">' + optionList(st.favoriteCurrencies.map(c => [c, c + ' ' + currencyName(c)]), st.defaultCurrency) + '</select></label>' +
        '<label class="row"><span class="k">預設國家／地區</span><select id="c-ctry">' + regionOptions(st.defaultCountry) + '</select></label></div></div>' +
        '<div class="sec"><div class="sec-h"><span>常用幣別</span></div><div class="group">' +
        st.favoriteCurrencies.map((c, i) => '<div class="row"><span class="k"><b>' + esc(c) + '</b> <span class="muted small">' + esc(currencyName(c)) + '</span></span>' +
          '<button class="iconbtn" data-up="' + i + '" aria-label="上移"' + (i === 0 ? ' disabled style="opacity:.3"' : '') + '>↑</button>' +
          (c === 'TWD' ? '' : '<button class="iconbtn danger" data-rm="' + i + '" aria-label="移除">－</button>') + '</div>').join('') +
        '<label class="row"><span class="k">新增常用幣別</span><select id="c-add"><option value="">選擇…</option>' + optionList(ALL_CURRENCIES.filter(c => !st.favoriteCurrencies.includes(c)).map(c => [c, c + ' ' + currencyName(c)]), '') + '</select></label>' +
        '</div><div class="sec-f">常用幣別會出現在新增交易的幣別選單最上方。</div></div>';
      const save = async () => { await saveSettings(); rerenderTop(); };
      $('#c-def', body).onchange = ev => { st.defaultCurrency = ev.target.value; save(); };
      $('#c-ctry', body).onchange = ev => { st.defaultCountry = ev.target.value; save(); };
      $('#c-add', body).onchange = ev => { if (ev.target.value) { st.favoriteCurrencies.push(ev.target.value); save(); } };
      $$('[data-rm]', body).forEach(b => { b.onclick = () => { const c = st.favoriteCurrencies.splice(+b.dataset.rm, 1)[0]; if (c === st.defaultCurrency) st.defaultCurrency = 'TWD'; save(); }; });
      $$('[data-up]', body).forEach(b => { b.onclick = () => { const i = +b.dataset.up; if (i > 0) { const a = st.favoriteCurrencies; [a[i - 1], a[i]] = [a[i], a[i - 1]]; save(); } }; });
    }
  });
}

function openCategorySettings() {
  let kind = 'expense';
  pushPage({
    title: '分類管理',
    right: { label: '＋新增', action: () => openCategoryEdit(null, kind) },
    render(body) {
      const list = S.categories.filter(c => c.kind === kind);
      body.innerHTML = '<div class="seg" data-k="kind"><button data-v="expense" class="' + (kind === 'expense' ? 'on' : '') + '">支出分類</button><button data-v="income" class="' + (kind === 'income' ? 'on' : '') + '">收入分類</button></div>' +
        '<div class="sec"><div class="group">' + list.map((c, i) => '<div class="row"><span class="eicon" style="--ec:' + catColor(c) + ';width:32px;height:32px;font-size:17px">' + esc(c.icon) + '</span><button class="k" style="border:0;background:none;text-align:left;padding:0" data-edit="' + c.id + '">' + esc(c.name) +
          ' <span class="muted small">' + S.entries.filter(e => e.categoryId === c.id).length + ' 筆</span></button>' +
          '<button class="iconbtn" data-up="' + i + '" aria-label="上移"' + (i === 0 ? ' disabled style="opacity:.3"' : '') + '>↑</button></div>').join('') +
        '</div><div class="sec-f">點分類可編輯或刪除。刪除分類後，相關交易會變成「未分類」，該分類的預算也會一併刪除。</div></div>';
      $$('[data-k=kind] button', body).forEach(b => { b.onclick = () => { kind = b.dataset.v; rerenderTop(); }; });
      $$('[data-edit]', body).forEach(b => { b.onclick = () => openCategoryEdit(catById(b.dataset.edit), kind); });
      $$('[data-up]', body).forEach(b => {
        b.onclick = async () => {
          const i = +b.dataset.up; if (i === 0) return;
          [list[i - 1], list[i]] = [list[i], list[i - 1]];
          list.forEach((c, j) => { c.sortOrder = j; });
          await DB.putMany('categories', list); sortData(); rerenderTop();
        };
      });
    }
  });
}
function openCategoryEdit(cat, kind) {
  const f = { name: cat ? cat.name : '', icon: cat ? cat.icon : '🏷️', color: cat ? catColor(cat) : CAT_COLORS[S.categories.length % CAT_COLORS.length] };
  pushPage({
    title: cat ? '編輯分類' : '新增分類', leftLabel: '取消',
    right: {
      label: '儲存', action: async () => {
        const name = f.name.trim(); if (!name) { toast('請輸入分類名稱'); return; }
        const order = cat ? cat.sortOrder : Math.max(-1, ...S.categories.filter(c => c.kind === kind).map(c => c.sortOrder)) + 1;
        await upsert('categories', S.categories, Object.assign(cat || { id: uid(), kind: kind, sortOrder: order }, { name: name, icon: f.icon, color: f.color }));
        popPage();
      }
    },
    render(body) {
      body.innerHTML = '<div class="sec"><div class="sec-h"><span>名稱</span></div><div class="group"><label class="row"><input type="text" id="cat-name" style="text-align:left" value="' + esc(f.name) + '" placeholder="例如：咖啡"></label></div></div>' +
        '<div class="sec"><div class="sec-h"><span>顏色</span></div><div class="group"><div class="colorpick">' + CAT_COLORS.map(c => '<button data-c="' + c + '" class="' + (c === f.color ? 'on' : '') + '" style="background:' + c + '" aria-label="顏色 ' + c + '"></button>').join('') + '</div></div>' +
        '<div class="sec-f">交易列、報表圓餅圖都會使用這個顏色。</div></div>' +
        '<div class="sec"><div class="sec-h"><span>圖示</span></div><div class="group"><div class="iconpick" style="--ec:' + f.color + '">' + ICONS.map(i => '<button data-i="' + i + '" class="' + (i === f.icon ? 'on' : '') + '">' + i + '</button>').join('') + '</div></div></div>' +
        (cat ? '<div class="sec"><div class="group"><button class="row center danger" data-k="del">刪除分類</button></div></div>' : '');
      const n = $('#cat-name', body); n.oninput = () => { f.name = n.value; };
      $$('[data-i]', body).forEach(b => { b.onclick = () => { f.icon = b.dataset.i; $$('[data-i]', body).forEach(x => x.classList.toggle('on', x === b)); }; });
      $$('[data-c]', body).forEach(b => {
        b.onclick = () => {
          f.color = b.dataset.c;
          $$('[data-c]', body).forEach(x => x.classList.toggle('on', x === b));
          $('.iconpick', body).style.setProperty('--ec', f.color);
        };
      });
      const del = $('[data-k=del]', body);
      if (del) del.onclick = async () => {
        if (!confirm('刪除分類「' + cat.name + '」？相關交易會變成「未分類」，該分類的預算也會刪除。')) return;
        for (const e of S.entries.filter(e => e.categoryId === cat.id)) { e.categoryId = null; await DB.put('entries', e); }
        for (const b of S.budgets.filter(b => b.categoryId === cat.id)) await remove('budgets', S.budgets, b.id);
        await remove('categories', S.categories, cat.id);
        await budgetsChanged();
        popPage();
      };
    }
  });
}

function openCardSettings() {
  pushPage({
    title: '卡片管理',
    right: { label: '＋新增', action: () => openCardEdit(null) },
    render(body) {
      body.innerHTML = (S.cards.length ? '' : '<div class="group"><div class="empty">尚未建立卡片。建立後，刷卡時可選擇卡片，並可為各卡設定不同手續費率。</div></div>') +
        '<div class="sec"><div class="group">' + S.cards.map(c => '<button class="row link" data-card="' + c.id + '"><span class="k"><b>' + esc(cardLabel(c)) + '</b> <span class="muted small">' + (c.kind === 'credit' ? '信用卡' : '金融卡') + '</span><br>' +
          '<span class="muted small">手續費 ' + PL.fmtPercent(c.customFeeRate !== null && c.customFeeRate !== undefined ? c.customFeeRate : S.settings.defaultFeeRate) + (c.customFeeRate !== null && c.customFeeRate !== undefined ? '' : '（預設）') +
          (c.closingDay ? '・結帳 ' + c.closingDay + ' 日' + (c.dueDay ? '・繳款 ' + c.dueDay + ' 日' : '') : '') + '</span>' +
          cardStatusChip(c) + '</span></button>').join('') + '</div></div>';
      $$('[data-card]', body).forEach(b => { b.onclick = () => openCardDetail(b.dataset.card); });
    }
  });
}
function openCardDetail(id) {
  pushPage({
    title: '卡片',
    right: { label: '編輯', action: () => openCardEdit(cardById(id)) },
    render(body, p) {
      const c = cardById(id); if (!c) { popPage(); return; }
      $('#pages .pbar h1').textContent = c.name;
      const items = S.entries.filter(e => e.cardId === id);
      const b = PL.cardBalance(items);
      const payments = items.filter(e => e.type === 'cardPayment');
      const stm = c.kind === 'credit' && c.closingDay ? PL.cardStatement(items, c.closingDay, c.dueDay || 0, today()) : null;
      const L = stm && stm.last;
      const statusText = L ? ({ none: '本期無帳款', paid: '✅ 已繳清', unpaid: '未繳', dueSoon: '⏰ 即將到期', overdue: '⚠️ 已逾期' })[L.status] : '';
      const dueText = L && L.due ? fmtDate(L.due) + (L.status === 'paid' || L.status === 'none' ? '' : L.daysLeft > 0 ? '（還有 ' + L.daysLeft + ' 天）' : L.daysLeft === 0 ? '（今天）' : '（逾期 ' + (-L.daysLeft) + ' 天）') : '未設定';
      body.innerHTML =
        (c.kind === 'credit' ? (stm ? '<div class="sec"><div class="sec-h"><span>上期帳單 ' + fmtDate(L.start).slice(5) + ' – ' + fmtDate(L.close).slice(5) + '</span><span>' + statusText + '</span></div><div class="group">' +
          '<div class="row"><span class="k">帳單金額（含手續費）</span><span class="v num">' + PL.fmtTWD(L.amount) + '</span></div>' +
          '<div class="row"><span class="k">結帳後已繳</span><span class="v num">' + PL.fmtTWD(L.paid) + '</span></div>' +
          '<div class="row"><b class="k">本期應繳</b><b class="num ' + (L.status === 'overdue' ? 'danger' : '') + '">' + PL.fmtTWD(L.remaining) + '</b></div>' +
          (() => {
            const pend = items.filter(x => (x.type === 'expense' || x.type === 'refund') && x.currency !== 'TWD' && !x.reconciled && x.date >= L.start && x.date <= L.close);
            return pend.length ? '<button class="row link" data-k="pendrec"><span class="k">🧾 外幣交易待對帳</span><span class="v">' + pend.length + ' 筆</span></button>' : '';
          })() +
          '<div class="row"><span class="k">繳款截止</span><span class="v ' + (L.status === 'overdue' ? 'danger' : L.status === 'dueSoon' ? 'accent' : '') + '">' + dueText + '</span></div>' +
          '</div></div>' +
          '<div class="sec"><div class="sec-h"><span>本期累計 ' + fmtDate(stm.current.start).slice(5) + ' – ' + fmtDate(stm.current.close).slice(5) + '（尚未結帳）</span></div><div class="group">' +
          '<div class="row"><span class="k">目前刷卡（含手續費）</span><span class="v num">' + PL.fmtTWD(stm.current.amount) + '</span></div></div>' +
          '<div class="sec-f">帳單金額依 App 內紀錄估算，實際以銀行帳單為準。結帳日之後的繳卡費會算在上期帳單。</div></div>'
          : '<div class="sec"><div class="group"><button class="row link" data-k="setcycle"><span class="k">📅 設定結帳日與繳款日</span><span class="v">依帳單週期對帳</span></button></div></div>') : '') +
        '<div class="sec"><div class="sec-h"><span>帳務概況（全部）</span></div><div class="group">' +
        '<div class="row"><span class="k">累計刷卡（含手續費）</span><span class="v num">' + PL.fmtTWD(b.charges) + '</span></div>' +
        '<div class="row"><span class="k">退款</span><span class="v num">' + PL.fmtTWD(b.refunds) + '</span></div>' +
        '<div class="row"><span class="k">已繳款</span><span class="v num">' + PL.fmtTWD(b.payments) + '</span></div>' +
        '<div class="row"><b class="k">估計未繳金額</b><b class="num">' + PL.fmtTWD(b.outstanding) + '</b></div>' +
        (c.kind === 'credit' ? '<button class="row accent" data-k="pay">✅ 記錄繳卡費' + (L && L.remaining > 0 ? '（帶入應繳 ' + PL.fmtTWD(L.remaining) + '）' : '') + '</button>' : '') +
        '</div><div class="sec-f">刷卡當下已記為支出；繳卡費只是轉帳，不再計入支出，避免重複計算。估計未繳 = 刷卡 − 退款 − 已繳款，僅供參考。</div></div>' +
        (payments.length ? '<div class="sec"><div class="sec-h"><span>繳款紀錄</span></div><div class="group">' + payments.map(entryRowHTML).join('') + '</div></div>' : '');
      const pay = $('[data-k=pay]', body);
      if (pay) pay.onclick = () => openForm(null, { type: 'cardPayment', cardId: id, amount: L && L.remaining > 0 ? L.remaining : null });
      const sc = $('[data-k=setcycle]', body); if (sc) sc.onclick = () => openCardEdit(c);
      const pr = $('[data-k=pendrec]', body);
      if (pr) pr.onclick = () => pushPage({
        title: '待對帳',
        render(b2) {
          const pend = S.entries.filter(x => x.cardId === id && (x.type === 'expense' || x.type === 'refund') && x.currency !== 'TWD' && !x.reconciled && x.date >= L.start && x.date <= L.close);
          b2.innerHTML = '<div class="sec"><div class="group">' + (pend.length ? pend.map(entryRowHTML).join('') : '<div class="empty"><b>全部對帳完成</b></div>') + '</div>' +
            '<div class="sec-f">點交易 →「依信用卡帳單調整實際金額」，輸入帳單上的新台幣金額與手續費。</div></div>';
          bindEntryRows(b2);
        }
      });
      bindEntryRows(body);
    }
  });
}
function openCardEdit(card) {
  const f = { name: card ? card.name : '', lastFour: card ? card.lastFour : '', kind: card ? card.kind : 'credit',
    closingDay: card && card.closingDay ? card.closingDay : 0, dueDay: card && card.dueDay ? card.dueDay : 0,
    custom: !!card && card.customFeeRate !== null && card.customFeeRate !== undefined,
    feeText: card && card.customFeeRate !== null && card.customFeeRate !== undefined ? String(PL.round(card.customFeeRate * 100, 4)) : '' };
  pushPage({
    title: card ? '編輯卡片' : '新增卡片', leftLabel: '取消',
    right: {
      label: '儲存', action: async () => {
        const name = f.name.trim(); if (!name) { toast('請輸入卡片別名'); return; }
        const pct = PL.parseNumber(f.feeText);
        const obj = Object.assign(card || { id: uid(), sortOrder: S.cards.length, createdAt: new Date().toISOString() },
          { name: name, lastFour: f.lastFour, kind: f.kind, customFeeRate: f.custom && pct !== null ? PL.round(pct / 100, 6) : null,
            closingDay: f.kind === 'credit' ? f.closingDay : 0, dueDay: f.kind === 'credit' && f.closingDay ? f.dueDay : 0 });
        await upsert('cards', S.cards, obj);
        popPage();
      }
    },
    render(body) {
      body.innerHTML = '<div class="sec"><div class="sec-h"><span>卡片</span></div><div class="group">' +
        '<label class="row"><span class="k">別名</span><input type="text" id="cd-name" value="' + esc(f.name) + '" placeholder="例如：國泰 CUBE"></label>' +
        '<label class="row"><span class="k">末四碼（選填）</span><input inputmode="numeric" id="cd-last" maxlength="4" value="' + esc(f.lastFour) + '"></label>' +
        '<label class="row"><span class="k">種類</span><select id="cd-kind">' + optionList([['credit', '信用卡'], ['debit', '金融卡']], f.kind) + '</select></label></div></div>' +
        (f.kind === 'credit' ? '<div class="sec"><div class="sec-h"><span>帳單週期</span></div><div class="group">' +
          '<label class="row"><span class="k">結帳日</span><select id="cd-close">' + optionList([['0', '未設定']].concat(Array.from({ length: 31 }, (_, i) => [String(i + 1), i === 30 ? '每月月底（31 日）' : '每月 ' + (i + 1) + ' 日'])), String(f.closingDay)) + '</select></label>' +
          (f.closingDay ? '<label class="row"><span class="k">繳款截止日</span><select id="cd-due">' + optionList([['0', '未設定']].concat(Array.from({ length: 31 }, (_, i) => [String(i + 1), '每月 ' + (i + 1) + ' 日'])), String(f.dueDay)) + '</select></label>' : '') +
          '</div><div class="sec-f">依信用卡帳單填寫。設定後會依帳單週期計算「本期應繳」，並在繳款截止前 3 天與逾期時提醒。繳款日小於或等於結帳日時，視為次月繳款。</div></div>' : '') +
        '<div class="sec"><div class="sec-h"><span>刷卡手續費</span></div><div class="group">' + switchHTML('cd-custom', f.custom, '使用個別手續費率') +
        (f.custom ? '<label class="row"><span class="k">費率</span><input inputmode="decimal" id="cd-fee" value="' + esc(f.feeText) + '" placeholder="1.5"><span>%</span></label>' : '') +
        '</div><div class="sec-f">未開啟時使用預設費率 ' + PL.fmtPercent(S.settings.defaultFeeRate) + '。</div></div>' +
        (card ? '<div class="sec"><div class="group"><button class="row center danger" data-k="del">刪除卡片</button></div></div>' : '');
      $('#cd-name', body).oninput = ev => { f.name = ev.target.value; };
      $('#cd-last', body).oninput = ev => { ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, 4); f.lastFour = ev.target.value; };
      $('#cd-kind', body).onchange = ev => { f.kind = ev.target.value; rerenderTop(); };
      const cl = $('#cd-close', body); if (cl) cl.onchange = () => { f.closingDay = +cl.value; rerenderTop(); };
      const du = $('#cd-due', body); if (du) du.onchange = () => { f.dueDay = +du.value; };
      $('#cd-custom', body).onchange = ev => { f.custom = ev.target.checked; rerenderTop(); };
      const fee = $('#cd-fee', body); if (fee) fee.oninput = () => { f.feeText = fee.value; };
      const del = $('[data-k=del]', body);
      if (del) del.onclick = async () => {
        if (!confirm('刪除卡片「' + card.name + '」？相關交易會保留，但不再標示卡片。')) return;
        for (const e of S.entries.filter(e => e.cardId === card.id)) { e.cardId = null; await DB.put('entries', e); }
        await remove('cards', S.cards, card.id);
        popPages(2);
      };
    }
  });
}

function openFeeSettings() {
  pushPage({
    title: '刷卡手續費',
    render(body) {
      const st = S.settings;
      body.innerHTML = '<div class="sec"><div class="group"><label class="row"><span class="k">預設費率</span><input inputmode="decimal" id="fee-rate" value="' + PL.round(st.defaultFeeRate * 100, 4) + '"><span>%</span></label></div>' +
        '<div class="sec-f">可在「卡片管理」為個別卡片設定不同費率；個別費率優先。修改費率只影響之後新增或重新編輯的交易，已保存的交易不會改變。</div></div>' +
        '<div class="sec"><div class="sec-h"><span>適用範圍</span></div><div class="group">' + switchHTML('fee-debit', st.feeOnDebitCard, '金融卡也計算手續費') + switchHTML('fee-foreign', st.feeOnlyForeign, '僅外幣交易計算') + '</div></div>' +
        '<div class="sec"><div class="sec-h"><span>計算方式</span></div><div class="group"><div class="formula">① 外幣先換算新台幣：原幣金額 × 交易日匯率（小數 2 位）\n② 手續費 = 新台幣金額 × 費率，四捨五入至整數元\n③ 含手續費總額 = 新台幣金額 ＋ 手續費\n\n範例：USD 100 × 31.5 = NT$3,150\n      NT$3,150 × 3% = NT$95（94.5 四捨五入）\n      合計 NT$3,245</div></div>' +
        '<div class="sec-f">現金、電子支付不計手續費。實際帳單金額不同時，可在交易中開啟「手動調整手續費」。</div></div>';
      $('#fee-rate', body).oninput = ev => { const p = PL.parseNumber(ev.target.value); if (p !== null && p >= 0 && p <= 100) { st.defaultFeeRate = PL.round(p / 100, 6); saveSettings(); } };
      $('#fee-debit', body).onchange = ev => { st.feeOnDebitCard = ev.target.checked; saveSettings(); };
      $('#fee-foreign', body).onchange = ev => { st.feeOnlyForeign = ev.target.checked; saveSettings(); };
    }
  });
}

function openRateInfo() {
  pushPage({
    title: '匯率來源',
    render(body) {
      const item = (t, d) => '<div class="row stack"><b>' + t + '</b><span class="muted small">' + d + '</span></div>';
      body.innerHTML = '<div class="sec"><div class="sec-h"><span>查詢順序</span></div><div class="group">' +
        item('1. Currency API', 'fawazahmed0/exchange-api（jsDelivr CDN，另有 pages.dev 備援），免金鑰，涵蓋 150 種以上幣別，每日更新一次市場中間價，歷史資料自 2024 年 3 月起。') +
        item('2. 手動輸入', '查不到、早於 2024 年 3 月或手機離線時，請手動輸入匯率；交易會標示「手動匯率」。') + '</div></div>' +
        '<div class="sec"><div class="sec-h"><span>與 iOS 原生版的差異</span></div><div class="group">' +
        item('臺灣銀行牌告匯率', '臺銀網站不允許其他網頁直接讀取（CORS 限制），所以網頁版無法查詢臺銀牌告，改用 Currency API 的市場中間價；iOS 原生版仍優先使用臺銀「即期賣出／買入」。') + '</div></div>' +
        '<div class="sec"><div class="sec-h"><span>規則</span></div><div class="group">' +
        item('當天匯率', '當天或前一天的資料若尚未發布，會改用最新一筆，並顯示實際匯率日期。') +
        item('保存方式', '交易存檔時即保存匯率、匯率日期與來源，之後不會再變動。查過的匯率會暫存在手機上，同一天同一幣別不重複下載。') +
        item('限制', '來源為公開資料、非官方 API，格式可能變更；匯率僅供記帳參考，實際刷卡匯率以發卡銀行帳單為準。') + '</div></div>';
    }
  });
}

function openBudgetSettings() {
  pushPage({
    title: '預算週期與提醒',
    render(body) {
      const st = S.settings;
      const perm = 'Notification' in window ? Notification.permission : 'unsupported';
      body.innerHTML = '<div class="sec"><div class="sec-h"><span>預算週期</span></div><div class="group"><label class="row"><span class="k">每月起始日</span><select id="bs-day">' +
        optionList(Array.from({ length: 28 }, (_, i) => [String(i + 1), '每月 ' + (i + 1) + ' 日']), String(st.budgetStartDay)) + '</select></label></div>' +
        '<div class="sec-f">例如設定為 5 日，週期為每月 5 日至次月 4 日。起始日最多為 28 日。</div></div>' +
        '<div class="sec"><div class="sec-h"><span>提醒</span></div><div class="group">' + switchHTML('bs-on', st.budgetAlertsEnabled, '預算提醒') +
        '<label class="row"><span class="k">接近預算提醒</span><select id="bs-warn">' + optionList([50, 55, 60, 65, 70, 75, 80, 85, 90, 95].map(n => [String(n), n + '%']), String(st.warningPercent)) + '</select></label>' +
        '<div class="row"><span class="k">超支提醒</span><span class="v">100%（固定）</span></div>' +
        '<div class="row"><span class="k">系統通知</span><span class="v">' + ({ granted: '已允許', denied: '已封鎖', default: '尚未允許', unsupported: '不支援' })[perm] + '</span></div>' +
        (perm === 'default' ? '<div class="btnrow"><button class="btn primary" data-k="perm">允許通知</button></div>' : '') +
        '</div><div class="sec-f">總預算與各分類預算達到門檻時提醒，內容包含預算名稱、目前支出、預算金額與使用比例；同一週期、同一預算的每個門檻只提醒一次，新週期自動重設。' +
        'iPhone 需先把網頁「加入主畫面」並從主畫面開啟（iOS 16.4 以上），才能允許系統通知；未允許時改在 App 畫面上顯示提醒。網頁版只會在開啟 App 時檢查預算。</div></div>';
      $('#bs-day', body).onchange = async ev => { st.budgetStartDay = PL.clampDay(+ev.target.value); await saveSettings(); await budgetsChanged(); };
      $('#bs-on', body).onchange = async ev => { st.budgetAlertsEnabled = ev.target.checked; await saveSettings(); await evaluateBudgets(); };
      $('#bs-warn', body).onchange = async ev => { st.warningPercent = +ev.target.value; await saveSettings(); await budgetsChanged(); };
      const pb = $('[data-k=perm]', body);
      if (pb) pb.onclick = async () => { try { await Notification.requestPermission(); } catch (e) { /* 忽略 */ } rerenderTop(); };
    }
  });
}

function openTrips() {
  pushPage({
    title: '旅程標籤',
    render(body) {
      const st = S.settings;
      const trips = tripNames().map(name => {
        const items = S.entries.filter(e => e.trip === name);
        const s = PL.summarize(items);
        const dates = items.map(e => e.date).sort();
        return { name, n: items.length, s, from: dates[0], to: dates[dates.length - 1] };
      });
      const used = trips.filter(t => t.n || (st.tripBudgets || {})[t.name]);
      body.innerHTML = '<div class="sec"><div class="sec-h"><span>進行中的旅程</span></div><div class="group">' +
        '<label class="row"><span class="k">新交易自動標記</span><input type="text" id="t-active" list="dl-trips2" autocomplete="off" value="' + esc(st.activeTrip || '') + '" placeholder="例如：2026 東京"></label>' +
        '<datalist id="dl-trips2">' + tripNames().map(t => '<option value="' + esc(t) + '"></option>').join('') + '</datalist>' +
        (st.activeTrip ? '<button class="row center accent" data-k="end">結束旅程（之後的交易不再自動標記）</button>' : '') +
        '</div><div class="sec-f">出發前輸入旅程名稱，之後新增的交易都會自動標上這個旅程；每筆交易也可以在表單中個別修改。</div></div>' +
        '<div class="sec"><div class="sec-h"><span>所有旅程</span></div><div class="group">' +
        (used.length ? used.map(t => '<button class="row link" data-trip="' + esc(t.name) + '"><span class="k"><b>🧳 ' + esc(t.name) + '</b><br><span class="muted small">' +
          (t.n ? fmtDate(t.from) + ' – ' + fmtDate(t.to) + '・' + t.n + ' 筆' : '尚無交易') +
          ((st.tripBudgets || {})[t.name] ? '・預算 ' + PL.fmtTWD(st.tripBudgets[t.name]) + '（' + tripUsage(t.name).percent + '%）' : '') + '</span></span><span class="v num">支出 ' + PL.fmtTWD(t.s.expense) + '<br><span class="small">手續費 ' + PL.fmtTWD(t.s.fee) + '</span></span></button>').join('')
          : '<div class="row muted">尚無旅程。設定進行中的旅程後新增交易，或在交易表單填入旅程。</div>') +
        '</div><div class="sec-f">點旅程可設定旅程總預算，或在報表中查看該旅程的分類、國家、手續費等統計。</div></div>';
      const act = $('#t-active', body);
      act.onchange = async () => { st.activeTrip = act.value.trim(); await saveSettings(); rerenderTop(); toast(st.activeTrip ? '新交易會標記為「' + st.activeTrip + '」' : '已取消自動標記'); };
      const end = $('[data-k=end]', body);
      if (end) end.onclick = async () => { st.activeTrip = ''; await saveSettings(); rerenderTop(); toast('旅程已結束'); };
      $$('[data-trip]', body).forEach(b => { b.onclick = () => openTripDetail(b.dataset.trip); });
    }
  });
}

function openInstallHelp() {
  pushPage({
    title: '安裝與離線使用',
    render(body) {
      body.innerHTML = '<div class="sec"><div class="group help"><div class="row stack">' +
        (isStandalone() ? '<p>✅ 已從主畫面開啟，可以離線使用。</p>' : '') +
        '<b>iPhone（Safari）</b><ol><li>用 Safari 開啟這個網址</li><li>點下方「分享」按鈕</li><li>選「加入主畫面」→「新增」</li><li>之後從主畫面圖示開啟</li></ol>' +
        '<b>Android（Chrome）</b><ol><li>點右上角選單</li><li>選「安裝應用程式」或「加到主畫面」</li></ol></div></div></div>' +
        '<div class="sec"><div class="sec-h"><span>離線使用</span></div><div class="group help"><div class="row stack"><p>第一次開啟後，App 本身會存到手機上，沒有網路也能記帳、查紀錄、看報表與預算。</p><p>只有「查詢匯率」需要網路；離線時請手動輸入匯率，之後可在交易中按「改回自動查詢」。</p></div></div></div>' +
        '<div class="sec"><div class="sec-h"><span>資料保存</span></div><div class="group help"><div class="row stack"><p>記帳資料與收據照片存在這台裝置瀏覽器的本機資料庫（IndexedDB），不會上傳。</p>' +
        '<p>⚠️ 請從主畫面圖示使用：在一般 Safari 分頁中，若網站長時間未開啟，iOS 可能自動清除網站資料。加入主畫面後的 App 不受此限制。</p>' +
        '<p>⚠️ 主畫面 App 與 Safari 分頁的資料是分開的；刪除主畫面 App、清除 Safari 網站資料或換手機，資料都不會自動保留，請定期到「備份與還原」匯出備份檔。</p></div></div></div>';
    }
  });
}
