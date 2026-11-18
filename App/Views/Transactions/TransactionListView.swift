import SwiftUI
import SwiftData

/// 交易篩選條件（紀錄頁與報表共用）
struct EntryFilter: Equatable {
    var types: Set<TransactionType> = []
    var currencies: Set<String> = []
    var countries: Set<String> = []
    var categoryIDs: Set<UUID> = []
    var methods: Set<PaymentMethod> = []
    var cardIDs: Set<UUID> = []
    var useDateRange = false
    var startDate = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    var endDate = Date()

    var activeCount: Int {
        [types.isEmpty, currencies.isEmpty, countries.isEmpty, categoryIDs.isEmpty, methods.isEmpty, cardIDs.isEmpty, !useDateRange]
            .filter { !$0 }.count
    }

    func matches(_ e: LedgerEntry) -> Bool {
        if !types.isEmpty && !types.contains(e.type) { return false }
        if !currencies.isEmpty && !currencies.contains(e.currency) { return false }
        if !countries.isEmpty && !countries.contains(e.countryCode) { return false }
        if !categoryIDs.isEmpty && !(e.category.map { categoryIDs.contains($0.id) } ?? false) { return false }
        if !methods.isEmpty && !methods.contains(e.paymentMethod) { return false }
        if !cardIDs.isEmpty && !(e.card.map { cardIDs.contains($0.id) } ?? false) { return false }
        if useDateRange {
            let start = Calendar.current.startOfDay(for: startDate)
            let end = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: endDate)) ?? endDate
            if e.date < start || e.date >= end { return false }
        }
        return true
    }
}

struct TransactionListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \LedgerEntry.date, order: .reverse) private var entries: [LedgerEntry]
    @State private var search = ""
    @State private var filter = EntryFilter()
    @State private var showFilter = false
    @State private var showAdd = false

    private var filtered: [LedgerEntry] {
        entries.filter { e in
            guard filter.matches(e) else { return false }
            guard !search.isEmpty else { return true }
            return e.merchant.localizedCaseInsensitiveContains(search)
                || e.note.localizedCaseInsensitiveContains(search)
                || e.categoryName.localizedCaseInsensitiveContains(search)
                || (e.card?.name.localizedCaseInsensitiveContains(search) ?? false)
        }
    }

    private struct DayGroup: Identifiable {
        let day: Date
        let items: [LedgerEntry]
        var id: Date { day }
    }

    private var grouped: [DayGroup] {
        let dict = Dictionary(grouping: filtered) { Calendar.current.startOfDay(for: $0.date) }
        return dict.keys.sorted(by: >).map { DayGroup(day: $0, items: dict[$0] ?? []) }
    }

    var body: some View {
        NavigationStack {
            List {
                if filter.activeCount > 0 || !search.isEmpty {
                    let s = StatisticsEngine.summarize(filtered.map(\.snapshot))
                    Section {
                        HStack {
                            StatTile(title: "收入", value: Fmt.twd(s.incomeTWD), tint: .green)
                            StatTile(title: "支出含費", value: Fmt.twd(s.expenseTWD))
                            StatTile(title: "手續費", value: Fmt.twd(s.feeTWD), tint: .orange)
                        }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                    } header: {
                        Text("符合條件 \(filtered.count) 筆")
                    }
                }
                ForEach(grouped) { group in
                    Section {
                        ForEach(group.items) { e in
                            NavigationLink { TransactionDetailView(entry: e) } label: { EntryRow(entry: e) }
                        }
                        .onDelete { offsets in delete(offsets.map { group.items[$0] }) }
                    } header: {
                        HStack {
                            Text(Fmt.dayHeader(group.day))
                            Spacer()
                            let net = group.items.reduce(Decimal.zero) { $0 + $1.snapshot.netExpenseTWD }
                            if net != 0 { Text("支出 \(Fmt.twd(net))").monospacedDigit() }
                        }
                    }
                }
            }
            .overlay {
                if filtered.isEmpty {
                    ContentUnavailableView(entries.isEmpty ? "尚無交易" : "沒有符合條件的交易",
                                           systemImage: "tray",
                                           description: Text(entries.isEmpty ? "點右上角 ＋ 新增第一筆記帳" : "請調整搜尋或篩選條件"))
                }
            }
            .searchable(text: $search, prompt: "搜尋商家、備註、分類")
            .navigationTitle("交易紀錄")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showFilter = true } label: {
                        Label("篩選", systemImage: filter.activeCount > 0 ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAdd = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showFilter) {
                FilterSheet(filter: $filter, entries: entries, showDateRange: true)
            }
            .sheet(isPresented: $showAdd) { TransactionFormView(entry: nil) }
        }
    }

    private func delete(_ items: [LedgerEntry]) {
        for e in items {
            if let r = e.receiptFileName { ReceiptStore.delete(r) }
            context.delete(e)
        }
        try? context.save()
    }
}

// MARK: - 篩選

struct FilterSheet: View {
    @Binding var filter: EntryFilter
    let entries: [LedgerEntry]
    var showDateRange: Bool
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \LedgerCategory.sortOrder) private var categories: [LedgerCategory]
    @Query(sort: \PaymentCard.sortOrder) private var cards: [PaymentCard]

    private var currencies: [String] { Array(Set(entries.map(\.currency))).sorted() }
    private var countries: [String] { Array(Set(entries.map(\.countryCode))).sorted() }

    var body: some View {
        NavigationStack {
            Form {
                if showDateRange {
                    Section("日期") {
                        Toggle("限定日期區間", isOn: $filter.useDateRange)
                        if filter.useDateRange {
                            DatePicker("開始", selection: $filter.startDate, displayedComponents: .date)
                            DatePicker("結束", selection: $filter.endDate, displayedComponents: .date)
                        }
                    }
                }
                multiSection("類型", items: TransactionType.allCases, selection: $filter.types) { $0.title }
                multiSection("幣別", items: currencies, selection: $filter.currencies) { "\($0) \(CurrencyCatalog.name($0))" }
                multiSection("國家／地區", items: countries, selection: $filter.countries) { RegionCatalog.label($0) }
                multiSection("分類", items: categories.map(\.id), selection: $filter.categoryIDs) { id in
                    let c = categories.first { $0.id == id }
                    return "\(c?.name ?? "")（\(c?.kind == .income ? "收入" : "支出")）"
                }
                multiSection("付款方式", items: PaymentMethod.allCases, selection: $filter.methods) { $0.title }
                if !cards.isEmpty {
                    multiSection("卡片", items: cards.map(\.id), selection: $filter.cardIDs) { id in
                        cards.first { $0.id == id }?.displayName ?? ""
                    }
                }
            }
            .navigationTitle("篩選")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("清除") { filter = EntryFilter() }
                }
                ToolbarItem(placement: .confirmationAction) { Button("完成") { dismiss() } }
            }
        }
        .presentationDetents([.large])
    }

    private func multiSection<T: Hashable>(_ title: String, items: [T], selection: Binding<Set<T>>,
                                           label: @escaping (T) -> String) -> some View {
        Section {
            if items.isEmpty {
                Text("尚無資料").foregroundStyle(.secondary)
            }
            ForEach(items, id: \.self) { item in
                Button {
                    if selection.wrappedValue.contains(item) {
                        selection.wrappedValue.remove(item)
                    } else {
                        selection.wrappedValue.insert(item)
                    }
                } label: {
                    HStack {
                        Text(label(item)).foregroundStyle(.primary)
                        Spacer()
                        if selection.wrappedValue.contains(item) {
                            Image(systemName: "checkmark").foregroundStyle(.tint)
                        }
                    }
                }
            }
        } header: {
            Text(title)
        } footer: {
            if selection.wrappedValue.isEmpty { Text("未選擇 = 全部") }
        }
    }
}
