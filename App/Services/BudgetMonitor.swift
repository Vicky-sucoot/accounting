import Foundation
import SwiftData

/// 預算使用量計算與超支提醒
enum BudgetMonitor {
    static func definitions(_ context: ModelContext) -> [BudgetDefinition] {
        let plans = (try? context.fetch(FetchDescriptor<BudgetPlan>())) ?? []
        return makeDefinitions(plans)
    }

    static func makeDefinitions(_ plans: [BudgetPlan]) -> [BudgetDefinition] {
        var result: [BudgetDefinition] = []
        if let total = plans.first(where: { $0.isTotal }), total.amount > 0 {
            result.append(BudgetDefinition(key: BudgetDefinition.totalKey, name: "每月總預算",
                                           icon: "chart.pie.fill", amount: total.amount, categoryID: nil))
        }
        let categoryPlans = plans
            .filter { !$0.isTotal && $0.amount > 0 && $0.category != nil }
            .sorted { ($0.category?.sortOrder ?? 0) < ($1.category?.sortOrder ?? 0) }
        for p in categoryPlans {
            guard let c = p.category else { continue }
            result.append(BudgetDefinition(key: c.id.uuidString, name: c.name, icon: c.icon,
                                           amount: p.amount, categoryID: c.id))
        }
        return result
    }

    static func usages(_ context: ModelContext, period: BudgetPeriod) -> [BudgetUsage] {
        let start = period.start, end = period.end
        let descriptor = FetchDescriptor<LedgerEntry>(predicate: #Predicate<LedgerEntry> { $0.date >= start && $0.date < end })
        let entries = (try? context.fetch(descriptor)) ?? []
        return BudgetCalculator.usages(definitions: definitions(context),
                                       entries: entries.map(\.snapshot), period: period)
    }

    /// 新增／修改／刪除交易後、App 回到前景時呼叫
    static func evaluate(context: ModelContext) {
        let settings = AppSettings.current(in: context)
        let period = BudgetPeriod.containing(Date(), startDay: settings.budgetStartDay)
        let records = (try? context.fetch(FetchDescriptor<BudgetAlertRecord>())) ?? []

        // 新週期開始：清除舊週期的提醒狀態
        for r in records where r.periodKey != period.key { context.delete(r) }

        guard settings.budgetAlertsEnabled else { try? context.save(); return }

        for usage in usages(context, period: period) {
            let sent = Set(records.filter { $0.periodKey == period.key && $0.budgetKey == usage.key }.map(\.threshold))
            let pending = BudgetCalculator.pendingAlerts(for: usage, thresholds: settings.alertThresholds, alreadySent: sent)
            guard let top = pending.last else { continue }
            // 一次跨過多個門檻時只通知最高門檻，但全部標記為已提醒
            for t in pending {
                context.insert(BudgetAlertRecord(periodKey: period.key, budgetKey: usage.key, threshold: t))
            }
            let text = BudgetCalculator.notificationText(for: usage, threshold: top)
            NotificationService.shared.send(id: "budget-\(period.key)-\(usage.key)-\(top)",
                                            title: text.title, body: text.body)
        }
        try? context.save()
    }

    /// 預算金額或門檻變更後：清除「新設定下已不再達到」的提醒紀錄，再重新評估
    static func budgetsDidChange(context: ModelContext) {
        let settings = AppSettings.current(in: context)
        let period = BudgetPeriod.containing(Date(), startDay: settings.budgetStartDay)
        let records = (try? context.fetch(FetchDescriptor<BudgetAlertRecord>())) ?? []
        let current = usages(context, period: period)
        let activeKeys = Set(current.map(\.key))
        for r in records where r.periodKey == period.key {
            if !activeKeys.contains(r.budgetKey) {
                context.delete(r)   // 預算已刪除
            } else if let u = current.first(where: { $0.key == r.budgetKey }),
                      !BudgetCalculator.isReached(u, threshold: r.threshold) {
                context.delete(r)
            }
        }
        try? context.save()
        evaluate(context: context)
    }
}
