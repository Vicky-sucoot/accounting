/* 多幣記帳 網頁版：交易明細頁 */
/* 各檔案以一般 <script> 依序載入、共用同一個全域範圍（見 index.html 的載入順序）。 */
'use strict';

// ======================= 交易明細 =======================
function openDetail(id) {
  pushPage({
    title: '交易明細',
    right: { label: '編輯', action: () => { const e = S.entries.find(x => x.id === id); if (e) openForm(e); } },
    render(body, p) {
      const e = S.entries.find(x => x.id === id);
      if (!e) { popPage(); return; }
      p.title = entryTitle(e);
      const foreign = e.currency !== 'TWD';
      const c = cardById(e.cardId);
      body.innerHTML =
        '<div class="hero-card" style="text-align:center"><div class="lbl">' + esc(TYPES[e.type].t) + '</div><div class="big" style="margin-bottom:2px">' + esc(PL.fmtMoney(e.amount, e.currency)) + '</div>' +
        (foreign ? '<div class="muted">' + (e.type === 'exchange' ? '支付 ' : '≈ ') + PL.fmtTWD(e.amountTWD) + '</div>' : '') + '</div>' +
        '<div class="sec"><div class="sec-h"><span>基本資料</span></div><div class="group">' +
        '<div class="row"><span class="k">日期</span><span class="v">' + fmtDate(e.date) + '</span></div>' +
        (e.type !== 'cardPayment' ? '<div class="row"><span class="k">分類</span><span class="v">' + esc(catIcon(e) + ' ' + catName(e)) + '</span></div>' +
          '<div class="row"><span class="k">國家／地區</span><span class="v">' + esc(regionLabel(e.countryCode)) + '</span></div>' +
          '<div class="row"><span class="k">付款方式</span><span class="v">' + esc(METHODS[e.method]) + '</span></div>' : '') +
        (c ? '<div class="row"><span class="k">卡片</span><span class="v">' + esc(cardLabel(c)) + '</span></div>' : '') +
        (e.merchant ? '<div class="row"><span class="k">商家</span><span class="v">' + esc(e.merchant) + '</span></div>' : '') +
        (e.trip ? '<div class="row"><span class="k">旅程</span><span class="v">🧳 ' + esc(e.trip) + '</span></div>' : '') +
        (e.note ? '<div class="row stack"><span class="muted small">備註</span><span style="white-space:pre-wrap">' + esc(e.note) + '</span></div>' : '') + '</div></div>' +
        (foreign ? '<div class="sec"><div class="sec-h"><span>匯率換算</span></div><div class="group">' +
          '<div class="row"><span class="k">原始金額</span><span class="v num">' + esc(PL.fmtMoney(e.amount, e.currency)) + '</span></div>' +
          '<div class="row"><span class="k">匯率</span><span class="v num">1 ' + esc(e.currency) + ' = ' + PL.fmtRate(e.rate) + ' TWD</span></div>' +
          '<div class="row"><span class="k">換算新台幣</span><span class="v num">' + PL.fmtTWD(e.amountTWD) + '</span></div>' +
          '<div class="row"><span class="k">匯率日期</span><span class="v">' + fmtDate(e.rateDate) + '</span></div>' +
          '<div class="row"><span class="k">資料來源</span><span class="v">' + (e.rateSource === 'manual' ? '✋ ' : '') + esc(RATE_SOURCES[e.rateSource] || e.rateSource) + '</span></div>' +
          (e.rateDetail ? '<div class="row small muted">' + esc(e.rateDetail) + '</div>' : '') +
          '</div><div class="sec-f">此匯率於記帳時保存，不會因日後匯率更新而改變。</div></div>' : '') +
        ((e.includesFee || e.feeTWD) ? '<div class="sec"><div class="sec-h"><span>' + (e.type === 'refund' ? '退回手續費' : '刷卡手續費') + '</span></div><div class="group">' +
          '<div class="row"><span class="k">刷卡消費金額</span><span class="v num">' + PL.fmtTWD(e.amountTWD) + '</span></div>' +
          '<div class="row"><span class="k">手續費</span><span class="v num">' + PL.fmtTWD(e.feeTWD) + '</span></div>' +
          '<div class="row"><b class="k">含手續費總額</b><b class="num">' + PL.fmtTWD(e.amountTWD + e.feeTWD) + '</b></div>' +
          '<div class="formula">' + esc((foreign ? '換算：' + PL.fmtMoney(e.amount, e.currency) + ' × ' + PL.fmtRate(e.rate) + ' = ' + PL.fmtTWD(e.amountTWD) + '\n' : '') +
            (e.isFeeManual ? '手續費：依實際帳單手動調整為 ' + PL.fmtTWD(e.feeTWD) : '手續費：' + PL.fmtTWD(e.amountTWD) + ' × ' + PL.fmtPercent(e.feeRate) + ' = ' + PL.fmtTWD(e.feeTWD) + '（四捨五入至整數元）')) + '</div></div></div>' : '') +
        (e.receipt ? '<div class="sec"><div class="sec-h"><span>收據</span></div><div class="group" id="d-receipt"><div class="row muted">載入中…</div></div></div>' : '') +
        (e.advAmount ? '<div class="sec"><div class="sec-h"><span>代墊</span><span>' + (e.advSettled ? '✅ 已收回' : '待收回') + '</span></div><div class="group">' +
          '<div class="row"><span class="k">對象</span><span class="v">' + esc(e.advWho || '未填') + '</span></div>' +
          '<div class="row"><span class="k">代墊金額</span><span class="v num">' + esc(PL.fmtMoney(e.advAmount, e.currency)) + '（≈ ' + PL.fmtTWD(PL.advanceTWD(e)) + '）</span></div>' +
          '<div class="row"><span class="k">自己負擔</span><span class="v num">' + PL.fmtTWD(PL.netExpense(e)) + '</span></div>' +
          switchHTML('d-settled', !!e.advSettled, '已收回') + '</div></div>' : '') +
        ((e.method === 'creditCard' || e.method === 'debitCard') && (e.type === 'expense' || e.type === 'refund') ?
          '<div class="sec"><div class="sec-h"><span>帳單對帳</span><span>' + (e.reconciled ? '✅ 已對帳' : '') + '</span></div><div class="group">' +
          (e.reconciled && e.estimate ? '<div class="row small muted">原估算：' + (foreign ? '1 ' + esc(e.currency) + ' = ' + PL.fmtRate(e.estimate.rate) + '，' : '') + PL.fmtTWD(e.estimate.amountTWD) + ' ＋ 手續費 ' + PL.fmtTWD(e.estimate.feeTWD) +
            '；差額 ' + (e.amountTWD + e.feeTWD - e.estimate.amountTWD - e.estimate.feeTWD >= 0 ? '+' : '') + PL.fmtTWD(PL.round(e.amountTWD + e.feeTWD - e.estimate.amountTWD - e.estimate.feeTWD, 2)) + '</div>' : '') +
          '<button class="row accent" data-k="reconcile">🧾 ' + (e.reconciled ? '修改帳單金額' : '依信用卡帳單調整實際金額') + '</button>' +
          (e.reconciled ? '<button class="row danger" data-k="unreconcile">取消對帳，恢復原估算</button>' : '') + '</div></div>' : '') +
        '<div class="sec"><div class="group"><button class="row center accent" data-k="again">＋ 再記一筆（沿用幣別、分類、卡片、國家）</button>' +
        ((e.type === 'expense' || e.type === 'income') ? (e.recurringId && (S.settings.recurring || []).some(r => r.id === e.recurringId)
          ? '<button class="row center accent" data-k="rule">🔁 由固定收支自動記錄・查看設定</button>'
          : '<button class="row center accent" data-k="mkrule">🔁 設為每月固定收支</button>') : '') + '</div></div>' +
        '<div class="sec"><div class="group"><button class="row center danger" data-k="del">刪除這筆交易</button></div></div>';
      $('#pages .pbar h1').textContent = p.title;
      const mk = $('[data-k=mkrule]', body); if (mk) mk.onclick = () => openRecurringEdit(null, e);
      const rl = $('[data-k=rule]', body); if (rl) rl.onclick = () => openRecurringEdit((S.settings.recurring || []).find(r => r.id === e.recurringId));
      $('[data-k=again]', body).onclick = () => openForm(null, e.type === 'exchange' ? { type: 'exchange', currency: e.currency } : { copyFrom: e });
      const ds = $('#d-settled', body);
      if (ds) ds.onchange = async () => { e.advSettled = ds.checked; e.advSettledDate = ds.checked ? today() : null; await DB.put('entries', e); rerenderTop(); toast(ds.checked ? '已標記為收回' : '已改為待收回'); };
      const rc = $('[data-k=reconcile]', body); if (rc) rc.onclick = () => openReconcile(e);
      const urc = $('[data-k=unreconcile]', body);
      if (urc) urc.onclick = async () => {
        if (!e.estimate) return;
        Object.assign(e, e.estimate); e.reconciled = false; delete e.estimate;
        if (e.advAmount) Object.assign(e, PL.advanceSplit(e.amount, e.amountTWD, e.feeTWD, e.advAmount));
        await upsert('entries', S.entries, e); await evaluateBudgets(); rerenderTop(); toast('已恢復原估算');
      };
      $('[data-k=del]', body).onclick = async () => {
        const showUndo = await deleteEntryWithUndo(e); popPage(); showUndo();
      };
      if (e.receipt) receiptURL(e.receipt).then(u => {
        const h = $('#d-receipt', body); if (!h) return;
        h.innerHTML = u ? '<a href="' + u + '" target="_blank" rel="noopener"><img class="receipt-img" alt="收據" src="' + u + '"></a><div class="row small muted center">點圖片可放大檢視</div>' : '<div class="row muted">找不到收據照片</div>';
      });
    }
  });
}
