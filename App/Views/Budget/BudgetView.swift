import SwiftUI
import SwiftData

struct BudgetView: View {
    @Query private var entries: [LedgerEntry]
    @Query private var plans: [BudgetPlan]
    @Query private var settingsList: [AppSettings]
    @State private var offset = 0
    @State private var showEdit = false

    private var settings: AppSettings? { settingsList.first }
    private var period: BudgetPeriod {
        BudgetPeriod.containing(Date(), startDay: settings?.budgetStartDay ?? 1).shifted(by: offset)
    }
    private var usages: [BudgetUsage] {
        BudgetCalculator.usages(definitions: BudgetMonitor.makeDefinitions(plans),
                                entries: entries.filter { period.contains($0.date) }.map(\.snapshot),
                                period: period)
    }

    var body: some View {
        NavigationStack {
            let all = usages
            List {
                Section {
                    HStack {
                        Button { offset -= 1 } label: { Image(systemName: "chevron.left") }
                        Spacer()
                        VStack {
                            Text(period.title).font(.headline)
                            Text("\(Fmt.date(period.start)) 起").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button { offset += 1 } label: { Image(systemName: "chevron.right") }
                            .disabled(offset >= 0)
                    }
                    .buttonStyle(.borderless)
                }

                if all.isEmpty {
                    Section {
                        ContentUnavailableView {
                            Label("尚未設定預算", systemImage: "target")
                        } description: {
                            Text("可設定每月總預算，以及各支出分類的月預算。")
                        } actions: {
                            Button("設定預算") { showEdit = true }.buttonStyle(.borderedProminent)
                        }
                    }
                } else {
                    if let total = all.first(where: \.isTotal) {
                        Section("總預算") {
                            BudgetProgressRow(usage: total, warningPercent: settings?.warningPercent ?? 80)
                        }
                    }
                    let categoryUsages = all.filter { !$0.isTotal }
                    if !categoryUsages.isEmpty {
                        Section("分類預算") {
                            ForEach(categoryUsages) {
                                BudgetProgressRow(usage: $0, warningPercent: settings?.warningPercent ?? 80)
                            }
                        }
                    }
                }

                Section {
                    Label("預算以新台幣計算，外幣支出依各筆保存的匯率換算；刷卡手續費計入已用金額，退款會扣回。", systemImage: "info.circle")
                    Label(alertText, systemImage: "bell.badge")
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
            .navigationTitle("預算")
            .toolbar {
                Button("編輯預算") { showEdit = true }
            }
            .sheet(isPresented: $showEdit) { BudgetEditView() }
        }
    }

    private var alertText: String {
        guard let s = settings, s.budgetAlertsEnabled else { return "預算提醒已關閉（可在設定中開啟）" }
        return "達到 \(s.warningPercent)% 及 100% 時發送通知；同一週期每個門檻只提醒一次。"
    }
}

struct BudgetEditView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Query(sort: \LedgerCategory.sortOrder) private var categories: [LedgerCategory]
    @Query private var plans: [BudgetPlan]

    @State private var totalText = ""
    @State private var categoryTexts: [UUID: String] = [:]
    @State private var loaded = false

    private var expenseCategories: [LedgerCategory] { categories.filter { $0.kind == .expense } }

    private var categorySum: Decimal {
        categoryTexts.values.compactMap(Decimal.parse).reduce(0, +)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    AmountField(title: "每月總預算", text: $totalText)
                } footer: {
                    Text("留空或 0 代表不設定。")
                }
                Section {
                    ForEach(expenseCategories) { c in
                        AmountField(title: c.name, text: Binding(
                            get: { categoryTexts[c.id] ?? "" },
                            set: { categoryTexts[c.id] = $0 }))
                    }
                } header: {
                    Text("分類月預算")
                } footer: {
                    let total = Decimal.parse(totalText) ?? 0
                    if total > 0 && categorySum > total {
                        Text("分類預算合計 \(Fmt.twd(categorySum)) 已超過總預算。").foregroundStyle(.orange)
                    } else {
                        Text("分類預算合計 \(Fmt.twd(categorySum))")
                    }
                }
            }
            .navigationTitle("編輯預算")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("儲存") { save() }.bold() }
            }
            .onAppear(perform: load)
        }
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        if let t = plans.first(where: \.isTotal), t.amount > 0 { totalText = t.amount.plainString }
        for p in plans where !p.isTotal {
            if let c = p.category, p.amount > 0 { categoryTexts[c.id] = p.amount.plainString }
        }
    }

    private func save() {
        upsert(isTotal: true, category: nil, amount: Decimal.parse(totalText) ?? 0)
        for c in expenseCategories {
            upsert(isTotal: false, category: c, amount: Decimal.parse(categoryTexts[c.id] ?? "") ?? 0)
        }
        try? context.save()
        BudgetMonitor.budgetsDidChange(context: context)
        dismiss()
    }

    private func upsert(isTotal: Bool, category: LedgerCategory?, amount: Decimal) {
        let existing = plans.first { isTotal ? $0.isTotal : (!$0.isTotal && $0.category?.id == category?.id) }
        if amount <= 0 {
            if let existing { context.delete(existing) }
            return
        }
        if let existing {
            existing.amount = amount
        } else {
            let plan = BudgetPlan(isTotal: isTotal, category: nil, amount: amount)
            context.insert(plan)
            plan.category = category
        }
    }
}
