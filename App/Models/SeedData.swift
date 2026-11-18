import Foundation
import SwiftData

enum SeedData {
    static let expenseCategories: [(String, String)] = [
        ("餐飲", "fork.knife"), ("交通", "tram.fill"), ("住宿", "bed.double.fill"),
        ("購物", "bag.fill"), ("娛樂", "gamecontroller.fill"), ("其他", "ellipsis.circle.fill")
    ]
    static let incomeCategories: [(String, String)] = [
        ("薪資", "banknote.fill"), ("其他收入", "plus.circle.fill")
    ]

    /// 首次啟動時建立預設設定與分類
    static func seedIfNeeded(_ context: ModelContext) {
        _ = AppSettings.current(in: context)
        let count = (try? context.fetchCount(FetchDescriptor<LedgerCategory>())) ?? 0
        guard count == 0 else { return }
        for (i, c) in expenseCategories.enumerated() {
            context.insert(LedgerCategory(name: c.0, icon: c.1, kind: .expense, sortOrder: i))
        }
        for (i, c) in incomeCategories.enumerated() {
            context.insert(LedgerCategory(name: c.0, icon: c.1, kind: .income, sortOrder: i))
        }
        try? context.save()
    }
}
