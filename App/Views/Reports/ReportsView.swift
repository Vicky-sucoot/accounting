import SwiftUI
import SwiftData
import Charts

struct ReportsView: View {
    @Query(sort: \LedgerEntry.date, order: .reverse) private var entries: [LedgerEntry]

    enum RangeMode: String, CaseIterable, Identifiable {
        case month = "月", year = "年", custom = "自訂"
        var id: String { rawValue }
    }

    enum Dimension: String, CaseIterable, Identifiable {
        case category = "分類", country = "國家", method = "付款", card = "卡片", fee = "手續費"
        var id: String { rawValue }
    }

    @State private var mode: RangeMode = .month
    @State private var anchor = Date()
    @State private var customStart = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    @State private var customEnd = Date()
    @State private var filter = EntryFilter()
    @State private var showFilter = false
    @State private var dimension: Dimension = .category

    private var interval: DateInterval {
        let cal = Calendar.current
        switch mode {
        case .month:
            return cal.dateInterval(of: .month, for: anchor) ?? DateInterval(start: anchor, duration: 0)
        case .year:
            return cal.dateInterval(of: .year, for: anchor) ?? DateInterval(start: anchor, duration: 0)
        case .custom:
            let start = cal.startOfDay(for: min(customStart, customEnd))
            let end = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: max(customStart, customEnd))) ?? customEnd
            return DateInterval(start: start, end: end)
        }
    }

    private var rangeTitle: String {
        let c = Calendar.current.dateComponents([.year, .month], from: anchor)
        switch mode {
        case .month: return "\(c.year ?? 0)年\(c.month ?? 0)月"
        case .year: return "\(c.year ?? 0)年"
        case .custom: return "\(Fmt.date(interval.start)) – \(Fmt.date(interval.end.addingTimeInterval(-1)))"
        }
    }

    private var items: [TxSnapshot] {
        let i = interval
        return entries
            .filter { $0.date >= i.start && $0.date < i.end && filter.matches($0) }
            .map(\.snapshot)
    }

    var body: some View {
        NavigationStack {
            let snapshots = items
            let summary = StatisticsEngine.summarize(snapshots)
            List {
                Section {
                    Picker("期間", selection: $mode) {
                        ForEach(RangeMode.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    if mode == .custom {
                        DatePicker("開始", selection: $customStart, displayedComponents: .date)
                        DatePicker("結束", selection: $customEnd, displayedComponents: .date)
                    } else {
                        HStack {
                            Button { shift(-1) } label: { Image(systemName: "chevron.left") }
                            Spacer()
                            Text(rangeTitle).font(.headline)
                            Spacer()
                            Button { shift(1) } label: { Image(systemName: "chevron.right") }
                        }
                        .buttonStyle(.borderless)
                    }
                }

                Section("新台幣合計") {
                    Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                        GridRow {
                            StatTile(title: "收入", value: Fmt.twd(summary.incomeTWD), tint: .green)
                            StatTile(title: "支出（含手續費）", value: Fmt.twd(summary.expenseTWD))
                        }
                        GridRow {
                            StatTile(title: "刷卡手續費", value: Fmt.twd(summary.feeTWD), tint: .orange,
                                     footnote: "消費 \(Fmt.twd(summary.spendingTWD))")
                            StatTile(title: "結餘", value: Fmt.twd(summary.balanceTWD),
                                     tint: summary.balanceTWD < 0 ? .red : .primary)
                        }
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    if summary.refundTWD != 0 || summary.cardPaymentTWD != 0 {
                        if summary.refundTWD != 0 {
                            LabeledContent("退款（已自支出扣除）", value: Fmt.twd(summary.refundTWD))
                        }
                        if summary.cardPaymentTWD != 0 {
                            LabeledContent("信用卡繳款（不計入支出）", value: Fmt.twd(summary.cardPaymentTWD))
                        }
                    }
                }

                Section {
                    CurrencyBreakdownView(items: summary.byCurrency)
                } header: {
                    Text("各幣別原始金額")
                } footer: {
                    Text("各幣別分開統計、不直接相加；手續費一律以新台幣計。")
                }

                Section("圖表") {
                    Picker("維度", selection: $dimension) {
                        ForEach(Dimension.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    chart(for: snapshots)
                }
            }
            .navigationTitle("統計報表")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showFilter = true } label: {
                        Label("篩選", systemImage: filter.activeCount > 0 ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                    }
                }
            }
            .sheet(isPresented: $showFilter) {
                FilterSheet(filter: $filter, entries: entries, showDateRange: false)
            }
        }
    }

    private func shift(_ value: Int) {
        anchor = Calendar.current.date(byAdding: mode == .year ? .year : .month, value: value, to: anchor) ?? anchor
    }

    private func groups(for snapshots: [TxSnapshot]) -> [GroupTotal] {
        switch dimension {
        case .category:
            return StatisticsEngine.expenseBreakdown(snapshots) { ($0.categoryID?.uuidString ?? "none", $0.categoryName) }
        case .country:
            return StatisticsEngine.expenseBreakdown(snapshots) { ($0.countryCode, RegionCatalog.label($0.countryCode)) }
        case .method:
            return StatisticsEngine.expenseBreakdown(snapshots) { ($0.paymentMethod.rawValue, $0.paymentMethod.title) }
        case .card:
            return StatisticsEngine.expenseBreakdown(snapshots.filter { $0.cardID != nil }) {
                ($0.cardID?.uuidString ?? "", $0.cardName ?? "")
            }
        case .fee:
            return StatisticsEngine.feeBreakdown(snapshots) {
                ($0.cardID?.uuidString ?? "nocard", $0.cardName ?? "未指定卡片")
            }
        }
    }

    @ViewBuilder
    private func chart(for snapshots: [TxSnapshot]) -> some View {
        let data = groups(for: snapshots)
        if data.isEmpty {
            Text("此期間沒有可統計的支出").foregroundStyle(.secondary)
        } else {
            if dimension == .category {
                Chart(data) { g in
                    SectorMark(angle: .value("金額", g.value.doubleValue), innerRadius: .ratio(0.55), angularInset: 1.5)
                        .foregroundStyle(by: .value("項目", g.label))
                        .cornerRadius(4)
                }
                .chartLegend(position: .bottom, alignment: .center)
                .frame(height: 260)
                .padding(.vertical, 8)
            } else {
                Chart(data) { g in
                    BarMark(x: .value("金額", g.value.doubleValue), y: .value("項目", g.label))
                        .foregroundStyle(dimension == .fee ? Color.orange : Color.accentColor)
                        .annotation(position: .trailing) {
                            Text(Fmt.twd(g.value)).font(.caption2).foregroundStyle(.secondary)
                        }
                }
                .chartXAxis(.hidden)
                .frame(height: CGFloat(data.count) * 40 + 20)
                .padding(.vertical, 8)
            }
            let total = data.reduce(Decimal.zero) { $0 + $1.value }
            ForEach(data) { g in
                HStack {
                    Text(g.label)
                    Spacer()
                    Text(Fmt.twd(g.value)).monospacedDigit()
                    Text(percentText(g.value, total))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .frame(width: 48, alignment: .trailing)
                }
                .font(.subheadline)
            }
            Text(dimension == .fee ? "手續費淨額（退回的手續費已扣除）" : "金額為淨支出，含刷卡手續費並扣除退款")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func percentText(_ value: Decimal, _ total: Decimal) -> String {
        guard total > 0 else { return "" }
        return "\(Int(((value / total).doubleValue * 100).rounded()))%"
    }
}
