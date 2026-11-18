import SwiftUI
import SwiftData

/// 新增／編輯交易
struct TransactionFormView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query(sort: \LedgerCategory.sortOrder) private var categories: [LedgerCategory]
    @Query(sort: \PaymentCard.sortOrder) private var cards: [PaymentCard]
    @Query private var settingsList: [AppSettings]

    let entry: LedgerEntry?
    var presetType: TransactionType? = nil
    var presetCard: PaymentCard? = nil

    // 基本欄位
    @State private var type: TransactionType = .expense
    @State private var amountText = ""
    @State private var currency = "TWD"
    @State private var date = Date()
    @State private var categoryID: UUID?
    @State private var countryCode = "TW"
    @State private var method: PaymentMethod = .cash
    @State private var cardID: UUID?
    @State private var merchant = ""
    @State private var note = ""

    // 匯率
    @State private var rateQuote: RateQuote?
    @State private var isManualRate = false
    @State private var rateText = ""
    @State private var rateState: RateState = .idle
    @State private var loadedRateKey: String?

    // 手續費
    @State private var includesFee = false
    @State private var isFeeManual = false
    @State private var feeText = ""

    // 收據
    @State private var newReceipt: UIImage?
    @State private var existingReceipt: String?

    @State private var didLoad = false
    @State private var countryTouched = false
    @FocusState private var amountFocused: Bool

    enum RateState: Equatable { case idle, loading, fetched, failed(String) }

    // MARK: 計算

    private var settings: AppSettings? { settingsList.first }
    private var policy: FeePolicy { settings?.feePolicy ?? .default }
    private var effectiveCurrency: String { type == .cardPayment ? "TWD" : currency }
    private var isForeign: Bool { effectiveCurrency != "TWD" }
    private var amount: Decimal? { Decimal.parse(amountText) }
    private var rate: Decimal? {
        if !isForeign { return 1 }
        return isManualRate ? Decimal.parse(rateText) : rateQuote?.rate
    }
    private var amountTWD: Decimal? {
        guard let amount, let rate else { return nil }
        return FeeCalculator.convert(amount: amount, rate: rate)
    }
    private var selectedCard: PaymentCard? { cards.first { $0.id == cardID } }
    private var availableCards: [PaymentCard] {
        if type == .cardPayment { return cards.filter { $0.kind == .credit } }
        return cards.filter { $0.kind.method == method }
    }
    private var availableCategories: [LedgerCategory] {
        guard let kind = type.categoryKind else { return [] }
        return categories.filter { $0.kind == kind }
    }
    private var feeApplicable: Bool {
        FeeCalculator.isApplicable(type: type, method: method, currency: effectiveCurrency, policy: policy)
    }
    private var feeRate: Decimal { FeeCalculator.effectiveRate(cardRate: selectedCard?.customFeeRate, policy: policy) }
    private var computedFee: Decimal { amountTWD.map { FeeCalculator.fee(amountTWD: $0, rate: feeRate) } ?? 0 }
    private var finalFee: Decimal {
        guard feeApplicable && includesFee else { return 0 }
        return isFeeManual ? (Decimal.parse(feeText) ?? 0) : computedFee
    }
    private var rateKey: String {
        "\(effectiveCurrency)|\(Fmt.dayKey(date))|\(type == .income ? "buy" : "sell")"
    }
    private var canSave: Bool {
        guard let amount, amount > 0, let rate, rate > 0 else { return false }
        if type == .cardPayment && cardID == nil { return false }
        return true
    }

    // MARK: 畫面

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("類型", selection: Binding(get: { type }, set: { changeType($0) })) {
                        ForEach(TransactionType.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }

                amountSection
                if isForeign { rateSection }

                Section {
                    DatePicker("日期", selection: $date, displayedComponents: .date)
                    if type == .cardPayment {
                        cardPicker(title: "繳款卡片")
                    } else {
                        Picker("分類", selection: $categoryID) {
                            Text("未分類").tag(UUID?.none)
                            ForEach(availableCategories) { c in
                                Label(c.name, systemImage: c.icon).tag(Optional(c.id))
                            }
                        }
                        NavigationLink {
                            RegionPickerView(selection: Binding(get: { countryCode },
                                                                set: { countryCode = $0; countryTouched = true }))
                        } label: {
                            LabeledContent("國家／地區", value: RegionCatalog.label(countryCode))
                        }
                        Picker("付款方式", selection: Binding(get: { method }, set: { changeMethod($0) })) {
                            ForEach(PaymentMethod.allCases) { Label($0.title, systemImage: $0.symbol).tag($0) }
                        }
                        if method.usesCard { cardPicker(title: "卡片") }
                    }
                } footer: {
                    if type == .cardPayment {
                        Text("繳卡費是把錢從銀行帳戶轉去繳信用卡帳單，屬於轉帳，不會計入支出，避免與原本的刷卡消費重複計算。")
                    } else if type == .refund {
                        Text("退款會沖減所選分類的支出；若信用卡同時退回手續費，請在下方開啟「退回手續費」。")
                    }
                }

                if feeApplicable { feeSection }

                Section("商家與備註（選填）") {
                    if type != .cardPayment {
                        TextField("商家名稱", text: $merchant)
                    }
                    TextField("備註", text: $note, axis: .vertical)
                }

                if type != .cardPayment {
                    ReceiptEditor(newImage: $newReceipt, existingFileName: $existingReceipt)
                }
            }
            .navigationTitle(entry == nil ? "新增交易" : "編輯交易")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("儲存") { save() }.bold().disabled(!canSave)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("完成") { amountFocused = false; hideKeyboard() }
                }
            }
            .onAppear(perform: load)
            .task(id: rateKey) { await fetchRate(force: false) }
        }
    }

    private var amountSection: some View {
        Section {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                if type == .cardPayment {
                    Text("TWD").font(.title2.bold()).foregroundStyle(.secondary)
                } else {
                    Menu {
                        ForEach(settings?.favoriteCurrencies ?? CurrencyCatalog.defaultFavorites, id: \.self) { code in
                            Button("\(code)  \(CurrencyCatalog.name(code))") { changeCurrency(code) }
                        }
                    } label: {
                        HStack(spacing: 2) {
                            Text(currency).font(.title2.bold())
                            Image(systemName: "chevron.up.chevron.down").font(.caption)
                        }
                    }
                }
                TextField("0", text: $amountText)
                    .font(.system(size: 36, weight: .semibold, design: .rounded).monospacedDigit())
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .focused($amountFocused)
            }
            if type != .cardPayment {
                NavigationLink("其他幣別…") {
                    CurrencyPickerView(selection: Binding(get: { currency }, set: { changeCurrency($0) }),
                                       favorites: settings?.favoriteCurrencies ?? [])
                }
                .font(.subheadline)
            }
            if isForeign, let amountTWD {
                LabeledContent("換算新台幣", value: Fmt.twd(amountTWD)).font(.subheadline)
            }
        } header: {
            Text("金額與幣別")
        }
    }

    private var rateSection: some View {
        Section {
            switch rateState {
            case .loading:
                HStack { ProgressView(); Text("查詢 \(Fmt.date(date)) 匯率中…").foregroundStyle(.secondary) }
            case .failed(let message):
                Label(message, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange).font(.subheadline)
            default:
                EmptyView()
            }

            if isManualRate {
                HStack {
                    Text("1 \(currency) =")
                    TextField("匯率", text: $rateText)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                    Text("TWD")
                }
                Label("手動匯率", systemImage: "hand.raised.fill").font(.caption).foregroundStyle(.orange)
                Button("改回自動查詢") {
                    isManualRate = false
                    Task { await fetchRate(force: true) }
                }
            } else if let q = rateQuote {
                LabeledContent("匯率", value: "1 \(currency) = \(Fmt.rate(q.rate)) TWD")
                LabeledContent("匯率日期", value: Fmt.date(q.rateDate))
                LabeledContent("資料來源", value: q.source.title)
                if !q.detail.isEmpty { Text(q.detail).font(.caption).foregroundStyle(.secondary) }
                HStack {
                    Button("重新查詢") { Task { await fetchRate(force: true) } }.buttonStyle(.borderless)
                    Spacer()
                    Button("改用手動匯率") {
                        rateText = q.rate.plainString
                        isManualRate = true
                    }
                    .buttonStyle(.borderless)
                }
            } else if rateState != .loading {
                Button("查詢匯率") { Task { await fetchRate(force: true) } }
            }
        } header: {
            Text("交易日匯率")
        } footer: {
            Text("存檔後此筆交易會保存當時採用的匯率，之後匯率更新也不會改變舊紀錄。")
        }
    }

    private var feeSection: some View {
        Section {
            Toggle(type == .refund ? "退回手續費" : "計入刷卡手續費", isOn: $includesFee)
            if includesFee {
                LabeledContent("費率",
                               value: Fmt.percent(feeRate) + (selectedCard?.customFeeRate != nil ? "（卡片費率）" : "（預設）"))
                Toggle("手動調整手續費", isOn: Binding(get: { isFeeManual }, set: { manual in
                    isFeeManual = manual
                    if manual { feeText = computedFee.plainString }
                }))
                if isFeeManual {
                    AmountField(title: "實際手續費", text: $feeText)
                }
                if let amountTWD {
                    VStack(alignment: .leading, spacing: 6) {
                        breakdownRow("消費金額", amountTWD)
                        breakdownRow("手續費", finalFee)
                        Divider()
                        breakdownRow("含手續費總額", amountTWD + finalFee).bold()
                    }
                    Text(feeFormula(amountTWD: amountTWD))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            Text("刷卡手續費")
        }
    }

    private func breakdownRow(_ title: String, _ value: Decimal) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(Fmt.twd(value)).monospacedDigit()
        }
        .font(.subheadline)
    }

    private func feeFormula(amountTWD: Decimal) -> String {
        var lines: [String] = []
        if isForeign, let amount, let rate {
            lines.append("① 換算：\(Fmt.money(amount, currency)) × \(Fmt.rate(rate)) = \(Fmt.twd(amountTWD))")
        }
        if isFeeManual {
            lines.append("② 手續費：依帳單手動調整為 \(Fmt.twd(finalFee))（自動計算為 \(Fmt.twd(computedFee))）")
        } else {
            lines.append("② 手續費：\(Fmt.twd(amountTWD)) × \(Fmt.percent(feeRate)) = \(Fmt.twd(computedFee))（四捨五入至整數元）")
        }
        return lines.joined(separator: "\n")
    }

    @ViewBuilder
    private func cardPicker(title: String) -> some View {
        if availableCards.isEmpty {
            NavigationLink { CardSettingsView() } label: {
                LabeledContent(title, value: "尚未建立卡片，點此新增")
            }
        } else {
            Picker(title, selection: $cardID) {
                Text("未指定").tag(UUID?.none)
                ForEach(availableCards) { c in Text(c.displayName).tag(Optional(c.id)) }
            }
        }
    }

    // MARK: 狀態變更

    private func changeType(_ newType: TransactionType) {
        type = newType
        if let kind = newType.categoryKind,
           !(categories.first { $0.id == categoryID }.map { $0.kind == kind } ?? false) {
            categoryID = categories.first { $0.kind == kind }?.id
        }
        if newType == .cardPayment && selectedCard?.kind != .credit {
            cardID = cards.first { $0.kind == .credit }?.id
        }
        resetFeeDefaults()
    }

    private func changeMethod(_ newMethod: PaymentMethod) {
        method = newMethod
        if newMethod.usesCard {
            if selectedCard?.kind.method != newMethod {
                cardID = cards.first { $0.kind.method == newMethod }?.id
            }
        } else {
            cardID = nil
        }
        resetFeeDefaults()
    }

    private func changeCurrency(_ code: String) {
        currency = code
        if !countryTouched, let region = CurrencyCatalog.suggestedRegion[code] { countryCode = region }
        isManualRate = false
        rateText = ""
        resetFeeDefaults()
    }

    private func resetFeeDefaults() {
        includesFee = FeeCalculator.defaultIncludesFee(type: type, method: method, currency: effectiveCurrency, policy: policy)
        isFeeManual = false
    }

    private func load() {
        guard !didLoad else { return }
        if let e = entry {
            type = e.type
            amountText = e.amount.plainString
            currency = e.currency
            date = e.date
            categoryID = e.category?.id
            countryCode = e.countryCode
            method = e.paymentMethod
            cardID = e.card?.id
            merchant = e.merchant
            note = e.note
            if e.isForeign {
                if e.rateSource == .manual {
                    isManualRate = true
                    rateText = e.exchangeRate.plainString
                } else {
                    rateQuote = RateQuote(rate: e.exchangeRate, rateDate: e.rateDate ?? e.date,
                                          source: e.rateSource, detail: e.rateDetail)
                    rateState = .fetched
                }
                // 保留原本的匯率；只有改了幣別、日期或類型才重新查詢
                loadedRateKey = "\(e.currency)|\(Fmt.dayKey(e.date))|\(e.type == .income ? "buy" : "sell")"
            }
            includesFee = e.includesFee
            isFeeManual = e.isFeeManual
            feeText = e.feeTWD.plainString
            existingReceipt = e.receiptFileName
            countryTouched = true
        } else {
            let t = presetType ?? .expense
            type = t
            currency = settings?.defaultCurrency ?? "TWD"
            countryCode = settings?.defaultCountry ?? "TW"
            if let kind = t.categoryKind { categoryID = categories.first { $0.kind == kind }?.id }
            if let c = presetCard {
                cardID = c.id
                if t != .cardPayment { method = c.kind.method }
            } else if t == .cardPayment {
                cardID = cards.first { $0.kind == .credit }?.id
            }
            includesFee = FeeCalculator.defaultIncludesFee(type: t, method: method,
                                                           currency: t == .cardPayment ? "TWD" : currency, policy: policy)
            amountFocused = true
        }
        didLoad = true
    }

    private func fetchRate(force: Bool) async {
        guard didLoad, isForeign, !isManualRate else { return }
        if !force, rateKey == loadedRateKey, rateQuote != nil { return }
        let key = rateKey
        rateState = .loading
        rateQuote = nil
        do {
            let q = try await ExchangeRateService.shared.quote(currency: effectiveCurrency, date: date,
                                                               side: type == .income ? .buy : .sell)
            guard key == rateKey else { return }
            rateQuote = q
            rateState = .fetched
            loadedRateKey = key
        } catch {
            if Task.isCancelled || error is CancellationError { return }
            rateState = .failed(error.localizedDescription)
            isManualRate = true   // 查不到時切換為手動輸入
        }
    }

    // MARK: 儲存

    private func save() {
        guard let amount, let rate, amount > 0, rate > 0 else { return }
        let e = entry ?? LedgerEntry()
        if entry == nil { context.insert(e) }

        e.type = type
        e.amount = amount
        e.currency = effectiveCurrency
        e.date = date
        e.category = type == .cardPayment ? nil : categories.first { $0.id == categoryID }
        e.countryCode = type == .cardPayment ? (settings?.defaultCountry ?? "TW") : countryCode
        e.paymentMethod = type == .cardPayment ? .other : method
        e.card = (type == .cardPayment || method.usesCard) ? selectedCard : nil
        e.merchant = type == .cardPayment ? "" : merchant.trimmingCharacters(in: .whitespacesAndNewlines)
        e.note = note.trimmingCharacters(in: .whitespacesAndNewlines)

        // 匯率快照
        e.exchangeRate = rate
        if !isForeign {
            e.rateSource = .base
            e.rateDate = date
            e.rateDetail = ""
        } else if isManualRate {
            e.rateSource = .manual
            e.rateDate = Calendar.current.startOfDay(for: date)
            e.rateDetail = "使用者手動輸入"
        } else if let q = rateQuote {
            e.rateSource = q.source
            e.rateDate = q.rateDate
            e.rateDetail = q.detail
        }
        e.amountTWD = FeeCalculator.convert(amount: amount, rate: rate)

        // 手續費
        e.includesFee = feeApplicable && includesFee
        e.feeRate = e.includesFee ? feeRate : 0
        e.isFeeManual = e.includesFee && isFeeManual
        e.feeTWD = finalFee

        // 收據
        if let img = newReceipt, let name = try? ReceiptStore.save(img) {
            if let old = e.receiptFileName { ReceiptStore.delete(old) }
            e.receiptFileName = name
        } else if existingReceipt == nil, let old = e.receiptFileName {
            ReceiptStore.delete(old)
            e.receiptFileName = nil
        }
        if type == .cardPayment, let old = e.receiptFileName {
            ReceiptStore.delete(old)
            e.receiptFileName = nil
        }

        e.updatedAt = Date()
        try? context.save()
        BudgetMonitor.evaluate(context: context)
        dismiss()
    }

    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}
