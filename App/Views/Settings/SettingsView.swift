import SwiftUI
import SwiftData
import UserNotifications

struct SettingsView: View {
    @EnvironmentObject private var lock: LockManager
    @Query private var settingsList: [AppSettings]

    var body: some View {
        NavigationStack {
            List {
                Section("記帳") {
                    NavigationLink { CurrencySettingsView() } label: {
                        Label("幣別與預設國家", systemImage: "dollarsign.arrow.circlepath")
                    }
                    NavigationLink { CategorySettingsView() } label: {
                        Label("分類管理", systemImage: "square.grid.2x2")
                    }
                    NavigationLink { CardSettingsView() } label: {
                        Label("卡片管理與繳款", systemImage: "creditcard")
                    }
                    NavigationLink { FeeSettingsView() } label: {
                        LabeledContent {
                            Text(Fmt.percent(settingsList.first?.defaultFeeRate ?? 0.03))
                        } label: {
                            Label("刷卡手續費", systemImage: "percent")
                        }
                    }
                    NavigationLink { RateInfoView() } label: {
                        Label("匯率來源說明", systemImage: "info.circle")
                    }
                }
                Section("預算") {
                    NavigationLink { BudgetSettingsView() } label: {
                        Label("預算週期與提醒", systemImage: "bell.badge")
                    }
                }
                Section("安全與資料") {
                    NavigationLink { LockSettingsView() } label: {
                        LabeledContent {
                            Text(lock.mode == .off ? "未啟用" : (lock.mode == .passcode ? "密碼" : lock.biometryName))
                        } label: {
                            Label("App 鎖定", systemImage: "lock")
                        }
                    }
                    NavigationLink { BackupView() } label: {
                        Label("備份與還原", systemImage: "externaldrive")
                    }
                }
                Section {
                    LabeledContent("版本", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                } footer: {
                    Text("所有記帳資料僅儲存在這支 iPhone，不使用雲端同步。")
                }
            }
            .navigationTitle("設定")
        }
    }
}

// MARK: - 幣別

struct CurrencySettingsView: View {
    @Environment(\.modelContext) private var context
    @Query private var settingsList: [AppSettings]
    @State private var addCode = ""
    @State private var showAdd = false

    var body: some View {
        if let s = settingsList.first {
            Form {
                Section("預設值") {
                    Picker("預設幣別", selection: Binding(get: { s.defaultCurrency }, set: { s.defaultCurrency = $0; save() })) {
                        ForEach(s.favoriteCurrencies, id: \.self) { Text("\($0) \(CurrencyCatalog.name($0))").tag($0) }
                    }
                    NavigationLink {
                        RegionPickerView(selection: Binding(get: { s.defaultCountry }, set: { s.defaultCountry = $0; save() }))
                    } label: {
                        LabeledContent("預設國家／地區", value: RegionCatalog.label(s.defaultCountry))
                    }
                }
                Section {
                    ForEach(s.favoriteCurrencies, id: \.self) { code in
                        HStack {
                            Text(code).bold().frame(width: 52, alignment: .leading)
                            Text(CurrencyCatalog.name(code)).foregroundStyle(.secondary)
                            Spacer()
                            if BankOfTaiwanParser.supportedCurrencies.contains(code) {
                                Text("臺銀").font(.caption2).padding(4).background(.thinMaterial, in: Capsule())
                            }
                        }
                        .deleteDisabled(code == "TWD")
                    }
                    .onDelete { idx in
                        let removed = idx.map { s.favoriteCurrencies[$0] }
                        s.favoriteCurrencies.remove(atOffsets: idx)
                        if removed.contains(s.defaultCurrency) { s.defaultCurrency = "TWD" }
                        save()
                    }
                    .onMove { from, to in
                        s.favoriteCurrencies.move(fromOffsets: from, toOffset: to)
                        save()
                    }
                    Button { showAdd = true } label: { Label("新增常用幣別", systemImage: "plus") }
                } header: {
                    Text("常用幣別")
                } footer: {
                    Text("常用幣別會出現在新增交易的幣別選單。標示「臺銀」者可查詢臺灣銀行牌告匯率，其他幣別改用 Currency API。")
                }
            }
            .navigationTitle("幣別")
            .toolbar { EditButton() }
            .sheet(isPresented: $showAdd) {
                NavigationStack {
                    CurrencyPickerView(selection: $addCode)
                }
            }
            .onChange(of: addCode) { _, code in
                guard !code.isEmpty else { return }
                if !s.favoriteCurrencies.contains(code) { s.favoriteCurrencies.append(code) }
                addCode = ""
                save()
            }
        }
    }

    private func save() { try? context.save() }
}

// MARK: - 手續費

struct FeeSettingsView: View {
    @Environment(\.modelContext) private var context
    @Query private var settingsList: [AppSettings]
    @State private var percentText = ""

    var body: some View {
        if let s = settingsList.first {
            Form {
                Section {
                    HStack {
                        Text("預設費率")
                        Spacer()
                        TextField("3", text: $percentText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                            .onChange(of: percentText) { _, text in
                                if let p = Decimal.parse(text), p >= 0, p <= 100 {
                                    s.defaultFeeRate = p / 100
                                    try? context.save()
                                }
                            }
                        Text("%")
                    }
                } footer: {
                    Text("可在「卡片管理」為個別卡片設定不同費率；個別費率優先於預設費率。修改費率只影響之後新增或重新編輯的交易，已保存的交易不會改變。")
                }
                Section("適用範圍") {
                    Toggle("金融卡也計算手續費", isOn: Binding(get: { s.feeOnDebitCard }, set: { s.feeOnDebitCard = $0; try? context.save() }))
                    Toggle("僅外幣交易計算", isOn: Binding(get: { s.feeOnlyForeign }, set: { s.feeOnlyForeign = $0; try? context.save() }))
                }
                Section("計算方式") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("① 外幣先換算新台幣：原幣金額 × 交易日匯率（小數 2 位）")
                        Text("② 手續費 = 新台幣金額 × 費率，四捨五入至整數元")
                        Text("③ 含手續費總額 = 新台幣金額 ＋ 手續費")
                        Divider()
                        Text("範例：USD 100 × 31.5 = NT$3,150；NT$3,150 × 3% = NT$95（94.5 四捨五入）；合計 NT$3,245")
                            .foregroundStyle(.secondary)
                    }
                    .font(.footnote)
                    Text("現金、電子支付預設不計手續費。若實際帳單金額不同，可在交易中開啟「手動調整手續費」。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("刷卡手續費")
            .onAppear { percentText = (s.defaultFeeRate * 100).plainString }
        }
    }
}

// MARK: - 匯率說明

struct RateInfoView: View {
    var body: some View {
        List {
            Section("查詢順序") {
                info("1. 臺灣銀行牌告匯率", "rate.bot.com.tw 每日歷史牌告 CSV。支援 USD、JPY、EUR、KRW、CNY、HKD、GBP、AUD、CAD、SGD、CHF、THB、PHP、IDR、VND、MYR、NZD、SEK、ZAR 共 19 種。支出／退款採「即期賣出」，收入採「即期買入」；KRW、VND、PHP、IDR、MYR 等無即期報價者改用現金匯率。")
                info("2. Currency API（備援）", "fawazahmed0/exchange-api（jsDelivr CDN），免金鑰，涵蓋 150+ 幣別，每日更新一次市場中間價，歷史資料自 2024 年 3 月起。")
                info("3. 手動輸入", "以上都查不到或手機離線時，請手動輸入匯率；交易會標示「手動匯率」。")
            }
            Section("規則") {
                info("週末與假日", "臺銀假日無牌告，會自動採用往前最近一個營業日的匯率，並在交易中顯示實際匯率日期。")
                info("更新時間", "臺銀於營業日 09:00 起盤中多次更新，本 App 取當日最後一次牌告；當日稍早查詢可能與收盤牌告略有差異，可按「重新查詢」。")
                info("保存方式", "交易存檔時即保存匯率、匯率日期與來源，之後不會再變動。")
                info("限制", "兩個來源皆為公開資料、非官方 API，格式可能變更；匯率僅供記帳參考，實際刷卡匯率以發卡銀行帳單為準。")
            }
        }
        .navigationTitle("匯率來源")
    }

    private func info(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.subheadline.bold())
            Text(body).font(.footnote).foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - 預算設定

struct BudgetSettingsView: View {
    @Environment(\.modelContext) private var context
    @Query private var settingsList: [AppSettings]
    @State private var authStatus: UNAuthorizationStatusText = .unknown

    enum UNAuthorizationStatusText { case unknown, allowed, denied }

    var body: some View {
        if let s = settingsList.first {
            Form {
                Section {
                    Picker("每月起始日", selection: Binding(get: { s.budgetStartDay }, set: {
                        s.budgetStartDay = $0
                        try? context.save()
                        BudgetMonitor.budgetsDidChange(context: context)
                    })) {
                        ForEach(1...28, id: \.self) { Text("每月 \($0) 日").tag($0) }
                    }
                } header: {
                    Text("預算週期")
                } footer: {
                    Text("例如設定為 5 日，週期為每月 5 日至次月 4 日。為避免月份天數不同，起始日最多為 28 日。")
                }

                Section {
                    Toggle("預算提醒", isOn: Binding(get: { s.budgetAlertsEnabled }, set: {
                        s.budgetAlertsEnabled = $0
                        try? context.save()
                        if $0 { Task { await NotificationService.shared.requestAuthorization() } }
                        BudgetMonitor.evaluate(context: context)
                    }))
                    Stepper("接近預算提醒：\(s.warningPercent)%", value: Binding(get: { s.warningPercent }, set: {
                        s.warningPercent = $0
                        try? context.save()
                        BudgetMonitor.budgetsDidChange(context: context)
                    }), in: 50...95, step: 5)
                    LabeledContent("超支提醒", value: "100%（固定）")
                    if authStatus == .denied {
                        Button("通知權限已關閉，前往 iPhone 設定開啟") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                        }
                    }
                } header: {
                    Text("提醒")
                } footer: {
                    Text("總預算與各分類預算分別在達到門檻時發送本機通知，內容包含預算名稱、目前支出、預算金額與使用比例。同一週期、同一預算的每個門檻只提醒一次；新週期開始時自動重設。修改預算金額後，若使用率降到門檻以下，之後再次達到時會重新提醒。")
                }
            }
            .navigationTitle("預算週期與提醒")
            .task {
                let status = await NotificationService.shared.authorizationStatus()
                authStatus = status == .denied ? .denied : (status == .notDetermined ? .unknown : .allowed)
            }
        }
    }
}
