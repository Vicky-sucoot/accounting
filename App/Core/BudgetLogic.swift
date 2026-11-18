import Foundation

/// 預算週期：每月自訂起始日（1–28），start 含、end 不含
struct BudgetPeriod: Equatable {
    let start: Date
    let end: Date
    let startDay: Int

    static func clampDay(_ day: Int) -> Int { min(max(day, 1), 28) }

    static func containing(_ date: Date, startDay: Int, calendar: Calendar = .current) -> BudgetPeriod {
        let day = clampDay(startDay)
        let comps = calendar.dateComponents([.year, .month, .day], from: date)
        var start = calendar.date(from: DateComponents(year: comps.year, month: comps.month, day: day))!
        if (comps.day ?? 1) < day {
            start = calendar.date(byAdding: .month, value: -1, to: start)!
        }
        let end = calendar.date(byAdding: .month, value: 1, to: start)!
        return BudgetPeriod(start: start, end: end, startDay: day)
    }

    func shifted(by months: Int, calendar: Calendar = .current) -> BudgetPeriod {
        let newStart = calendar.date(byAdding: .month, value: months, to: start)!
        return BudgetPeriod.containing(newStart, startDay: startDay, calendar: calendar)
    }

    func contains(_ date: Date) -> Bool { date >= start && date < end }

    /// 提醒紀錄用的週期鍵，例如 2026-11-01
    var key: String { Fmt.dayKey(start) }

    var title: String {
        let lastDay = Calendar.current.date(byAdding: .day, value: -1, to: end)!
        if startDay == 1 {
            let c = Calendar.current.dateComponents([.year, .month], from: start)
            return "\(c.year ?? 0)年\(c.month ?? 0)月"
        }
        return "\(Fmt.shortDate(start)) – \(Fmt.shortDate(lastDay))"
    }
}

struct BudgetDefinition: Equatable {
    static let totalKey = "total"
    let key: String          // "total" 或分類 UUID
    let name: String
    let icon: String
    let amount: Decimal
    let categoryID: UUID?    // nil = 總預算
}

struct BudgetUsage: Identifiable, Equatable {
    let key: String
    let name: String
    let icon: String
    let budget: Decimal
    let spent: Decimal
    var id: String { key }
    var isTotal: Bool { key == BudgetDefinition.totalKey }
    var remaining: Decimal { budget - spent }
    var ratio: Double { budget > 0 ? (spent / budget).doubleValue : 0 }
    var percent: Int { Int((ratio * 100).rounded(.down)) }
}

enum BudgetCalculator {
    /// 以新台幣計算各預算使用量（支出含手續費，退款沖減）
    static func usages(definitions: [BudgetDefinition], entries: [TxSnapshot], period: BudgetPeriod) -> [BudgetUsage] {
        let inPeriod = entries.filter { period.contains($0.date) }
        return definitions.map { def in
            let relevant = def.categoryID == nil ? inPeriod : inPeriod.filter { $0.categoryID == def.categoryID }
            let spent = relevant.reduce(Decimal.zero) { $0 + $1.netExpenseTWD }
            return BudgetUsage(key: def.key, name: def.name, icon: def.icon,
                               budget: def.amount, spent: max(spent, 0))
        }
    }

    static func isReached(_ usage: BudgetUsage, threshold: Int) -> Bool {
        usage.budget > 0 && usage.spent >= usage.budget * Decimal(threshold) / 100
    }

    /// 尚未提醒、但已達到的門檻
    static func pendingAlerts(for usage: BudgetUsage, thresholds: [Int], alreadySent: Set<Int>) -> [Int] {
        thresholds.filter { isReached(usage, threshold: $0) && !alreadySent.contains($0) }.sorted()
    }

    /// 預算金額修改後，原本已提醒但現在已不再達到的門檻要清除，之後再次達到時才能重新提醒
    static func thresholdsToClear(for usage: BudgetUsage, sent: Set<Int>) -> Set<Int> {
        Set(sent.filter { !isReached(usage, threshold: $0) })
    }

    static func notificationText(for usage: BudgetUsage, threshold: Int) -> (title: String, body: String) {
        let title = threshold >= 100 ? "已超出預算：\(usage.name)" : "預算提醒：\(usage.name) 已達 \(threshold)%"
        let body = "本期已支出 \(Fmt.twd(usage.spent))／預算 \(Fmt.twd(usage.budget))（使用 \(usage.percent)%）"
        return (title, body)
    }
}
