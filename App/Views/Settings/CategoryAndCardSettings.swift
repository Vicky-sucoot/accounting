import SwiftUI
import SwiftData

// MARK: - 分類

struct CategorySettingsView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \LedgerCategory.sortOrder) private var categories: [LedgerCategory]
    @State private var kind: CategoryKind = .expense
    @State private var editing: LedgerCategory?
    @State private var showNew = false
    @State private var pendingDelete: LedgerCategory?

    private var list: [LedgerCategory] { categories.filter { $0.kind == kind } }

    var body: some View {
        List {
            Picker("種類", selection: $kind) {
                ForEach(CategoryKind.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .listRowBackground(Color.clear)

            Section {
                ForEach(list) { c in
                    Button { editing = c } label: {
                        HStack {
                            Label(c.name, systemImage: c.icon).foregroundStyle(.primary)
                            Spacer()
                            Text("\(c.entries?.count ?? 0) 筆").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .onMove(perform: move)
                .onDelete { idx in pendingDelete = idx.first.map { list[$0] } }
            } footer: {
                Text("刪除分類後，相關交易會變成「未分類」，該分類的預算也會一併刪除。")
            }
        }
        .navigationTitle("分類管理")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button { showNew = true } label: { Image(systemName: "plus") } }
            ToolbarItem(placement: .topBarTrailing) { EditButton() }
        }
        .sheet(item: $editing) { CategoryEditView(category: $0, kind: $0.kind) }
        .sheet(isPresented: $showNew) { CategoryEditView(category: nil, kind: kind) }
        .confirmationDialog("刪除分類「\(pendingDelete?.name ?? "")」？", isPresented: Binding(
            get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }), titleVisibility: .visible) {
            Button("刪除", role: .destructive) {
                if let c = pendingDelete { context.delete(c); try? context.save() }
                pendingDelete = nil
                BudgetMonitor.budgetsDidChange(context: context)
            }
        }
    }

    private func move(from: IndexSet, to: Int) {
        var items = list
        items.move(fromOffsets: from, toOffset: to)
        for (i, c) in items.enumerated() { c.sortOrder = i }
        try? context.save()
    }
}

struct CategoryEditView: View {
    let category: LedgerCategory?
    let kind: CategoryKind
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query private var all: [LedgerCategory]
    @State private var name = ""
    @State private var icon = "tag.fill"

    static let icons = [
        "fork.knife", "cup.and.saucer.fill", "cart.fill", "bag.fill", "tram.fill", "car.fill", "airplane",
        "bed.double.fill", "house.fill", "gamecontroller.fill", "film.fill", "gift.fill", "heart.fill",
        "cross.case.fill", "book.fill", "graduationcap.fill", "pawprint.fill", "tshirt.fill", "phone.fill",
        "bolt.fill", "wifi", "banknote.fill", "chart.line.uptrend.xyaxis", "briefcase.fill",
        "plus.circle.fill", "ellipsis.circle.fill", "tag.fill", "star.fill"
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section("名稱") { TextField("例如：咖啡", text: $name) }
                Section("圖示") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 12) {
                        ForEach(Self.icons, id: \.self) { i in
                            Image(systemName: i)
                                .font(.title3)
                                .frame(width: 40, height: 40)
                                .background(i == icon ? Color.accentColor.opacity(0.2) : .clear, in: RoundedRectangle(cornerRadius: 8))
                                .onTapGesture { icon = i }
                        }
                    }
                }
            }
            .navigationTitle(category == nil ? "新增分類" : "編輯分類")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("儲存") { save() }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                if let c = category { name = c.name; icon = c.icon }
            }
        }
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if let c = category {
            c.name = trimmed
            c.icon = icon
        } else {
            let order = (all.filter { $0.kind == kind }.map(\.sortOrder).max() ?? -1) + 1
            context.insert(LedgerCategory(name: trimmed, icon: icon, kind: kind, sortOrder: order))
        }
        try? context.save()
        dismiss()
    }
}

// MARK: - 卡片

struct CardSettingsView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \PaymentCard.sortOrder) private var cards: [PaymentCard]
    @Query private var settingsList: [AppSettings]
    @State private var showNew = false

    var body: some View {
        List {
            if cards.isEmpty {
                Text("尚未建立卡片。建立後，刷卡時可選擇卡片，並可為各卡設定不同手續費率。")
                    .foregroundStyle(.secondary)
            }
            ForEach(cards) { card in
                NavigationLink { CardDetailView(card: card) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(card.displayName).font(.headline)
                            Text(card.kind.title).font(.caption2).padding(.horizontal, 6).padding(.vertical, 2)
                                .background(.thinMaterial, in: Capsule())
                        }
                        Text("手續費 \(Fmt.percent(card.customFeeRate ?? settingsList.first?.defaultFeeRate ?? 0.03))\(card.customFeeRate == nil ? "（預設）" : "")")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .onDelete { idx in
                idx.map { cards[$0] }.forEach { context.delete($0) }
                try? context.save()
            }
        }
        .navigationTitle("卡片管理")
        .toolbar { Button { showNew = true } label: { Image(systemName: "plus") } }
        .sheet(isPresented: $showNew) { CardEditView(card: nil) }
    }
}

struct CardDetailView: View {
    @Bindable var card: PaymentCard
    @State private var showEdit = false
    @State private var showPayment = false

    private var snapshots: [TxSnapshot] { (card.entries ?? []).map(\.snapshot) }
    private var balance: CardBalance { CardBalance.compute(snapshots) }
    private var payments: [LedgerEntry] {
        (card.entries ?? []).filter { $0.type == .cardPayment }.sorted { $0.date > $1.date }
    }

    var body: some View {
        List {
            Section {
                LabeledContent("累計刷卡（含手續費）", value: Fmt.twd(balance.charges))
                LabeledContent("退款", value: Fmt.twd(balance.refunds))
                LabeledContent("已繳款", value: Fmt.twd(balance.payments))
                LabeledContent("估計未繳金額", value: Fmt.twd(balance.outstanding)).bold()
                if card.kind == .credit {
                    Button { showPayment = true } label: { Label("記錄繳卡費", systemImage: "checkmark.circle") }
                }
            } header: {
                Text("帳務概況")
            } footer: {
                Text("刷卡當下已記為支出；繳卡費只是轉帳，不再計入支出，避免重複計算。估計未繳 = 刷卡 − 退款 − 已繳款，僅供參考。")
            }
            if !payments.isEmpty {
                Section("繳款紀錄") {
                    ForEach(payments) { p in
                        NavigationLink { TransactionDetailView(entry: p) } label: {
                            LabeledContent(Fmt.date(p.date), value: Fmt.twd(p.amountTWD))
                        }
                    }
                }
            }
        }
        .navigationTitle(card.name)
        .toolbar { Button("編輯") { showEdit = true } }
        .sheet(isPresented: $showEdit) { CardEditView(card: card) }
        .sheet(isPresented: $showPayment) { TransactionFormView(entry: nil, presetType: .cardPayment, presetCard: card) }
    }
}

struct CardEditView: View {
    let card: PaymentCard?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query private var cards: [PaymentCard]
    @Query private var settingsList: [AppSettings]
    @State private var name = ""
    @State private var lastFour = ""
    @State private var kind: CardKind = .credit
    @State private var useCustomFee = false
    @State private var feeText = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("卡片") {
                    TextField("卡片別名，例如：國泰 CUBE", text: $name)
                    TextField("末四碼（選填）", text: $lastFour)
                        .keyboardType(.numberPad)
                        .onChange(of: lastFour) { _, v in
                            let digits = String(v.filter(\.isNumber).prefix(4))
                            if digits != v { lastFour = digits }
                        }
                    Picker("種類", selection: $kind) {
                        ForEach(CardKind.allCases) { Text($0.title).tag($0) }
                    }
                }
                Section {
                    Toggle("使用個別手續費率", isOn: $useCustomFee)
                    if useCustomFee {
                        HStack {
                            Text("費率")
                            Spacer()
                            TextField("1.5", text: $feeText).keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(width: 80)
                            Text("%")
                        }
                    }
                } header: {
                    Text("刷卡手續費")
                } footer: {
                    Text("未開啟時使用預設費率 \(Fmt.percent(settingsList.first?.defaultFeeRate ?? 0.03))。")
                }
            }
            .navigationTitle(card == nil ? "新增卡片" : "編輯卡片")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("儲存") { save() }.disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                guard let c = card else { return }
                name = c.name
                lastFour = c.lastFour
                kind = c.kind
                if let r = c.customFeeRate { useCustomFee = true; feeText = (r * 100).plainString }
            }
        }
    }

    private func save() {
        let rate: Decimal? = useCustomFee ? Decimal.parse(feeText).map { $0 / 100 } : nil
        let target: PaymentCard
        if let card {
            target = card
        } else {
            target = PaymentCard(name: "", sortOrder: (cards.map(\.sortOrder).max() ?? -1) + 1)
            context.insert(target)
        }
        target.name = name.trimmingCharacters(in: .whitespaces)
        target.lastFour = lastFour
        target.kind = kind
        target.customFeeRate = rate
        try? context.save()
        dismiss()
    }
}
