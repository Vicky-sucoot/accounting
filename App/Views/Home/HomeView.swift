import SwiftUI
import SwiftData

struct HomeView: View {
    @Binding var selectedTab: AppTab
    @Query(sort: \LedgerEntry.date, order: .reverse) private var entries: [LedgerEntry]
    @Query private var plans: [BudgetPlan]
    @Query private var settingsList: [AppSettings]
    @State private var showAdd = false

    private var settings: AppSettings? { settingsList.first }
    private var period: BudgetPeriod {
        BudgetPeriod.containing(Date(), startDay: settings?.budgetStartDay ?? 1)
    }
    private var periodEntries: [LedgerEntry] { entries.filter { period.contains($0.date) } }
    private var summary: LedgerSummary { StatisticsEngine.summarize(periodEntries.map(\.snapshot)) }
    private var totalUsage: BudgetUsage? {
        let defs = BudgetMonitor.makeDefinitions(plans).filter { $0.categoryID == nil }
        return BudgetCalculator.usages(definitions: defs, entries: periodEntries.map(\.snapshot), period: period).first
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    overviewCard
                    if let totalUsage {
                        Button { selectedTab = .budget } label: {
                            BudgetProgressRow(usage: totalUsage, warningPercent: settings?.warningPercent ?? 80)
                                .padding()
                                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                        }
                        .buttonStyle(.plain)
                    } else {
                        Button { selectedTab = .budget } label: {
                            Label("設定每月預算，掌握支出進度", systemImage: "target")
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding()
                                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                        }
                    }
                    currencySection
                    recentSection
                }
                .padding()
                .padding(.bottom, 80)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("收支總覽")
            .overlay(alignment: .bottomTrailing) { AddButton { showAdd = true } }
            .sheet(isPresented: $showAdd) { TransactionFormView(entry: nil) }
        }
    }

    private var overviewCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("本期 \(period.title)").font(.subheadline).foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text("支出（含手續費）").font(.caption).foregroundStyle(.secondary)
                Text(Fmt.twd(summary.expenseTWD))
                    .font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit())
            }
            HStack(spacing: 10) {
                StatTile(title: "收入", value: Fmt.twd(summary.incomeTWD), tint: .green)
                StatTile(title: "手續費", value: Fmt.twd(summary.feeTWD), tint: .orange)
                StatTile(title: "結餘", value: Fmt.twd(summary.balanceTWD),
                         tint: summary.balanceTWD < 0 ? .red : .primary)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground).opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
    }

    private var currencySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("各幣別原始金額").font(.headline)
            Text("不同幣別不直接相加，合計請看上方新台幣金額").font(.caption).foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 8) {
                CurrencyBreakdownView(items: summary.byCurrency)
            }
            .padding()
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        }
    }

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("最近交易").font(.headline)
                Spacer()
                Button("查看全部") { selectedTab = .list }.font(.subheadline)
            }
            VStack(spacing: 0) {
                if entries.isEmpty {
                    Text("尚無交易，點右下角 ＋ 開始記帳")
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                }
                ForEach(entries.prefix(6)) { e in
                    NavigationLink { TransactionDetailView(entry: e) } label: {
                        EntryRow(entry: e).padding(.horizontal).padding(.vertical, 6)
                    }
                    .buttonStyle(.plain)
                    if e.id != entries.prefix(6).last?.id { Divider().padding(.leading, 60) }
                }
            }
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        }
    }
}

struct AddButton: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: "plus")
                .font(.title2.bold())
                .foregroundStyle(.white)
                .frame(width: 60, height: 60)
                .background(Color.accentColor, in: Circle())
                .shadow(radius: 4, y: 2)
        }
        .padding(20)
        .accessibilityLabel("新增交易")
    }
}
