import Foundation
import SwiftData

// MARK: - 交易

@Model
final class LedgerEntry {
    var id: UUID = UUID()
    var typeRaw: String = TransactionType.expense.rawValue
    /// 原幣金額（正數）
    var amount: Decimal = 0
    var currency: String = "TWD"
    var date: Date = Date()
    var category: LedgerCategory?
    var countryCode: String = "TW"
    var paymentMethodRaw: String = PaymentMethod.cash.rawValue
    var card: PaymentCard?
    var merchant: String = ""
    var note: String = ""

    // 匯率快照：存檔當下即固定，日後不再自動變動
    /// 1 單位外幣 = ? 新台幣
    var exchangeRate: Decimal = 1
    var rateDate: Date?
    var rateSourceRaw: String = RateSource.base.rawValue
    var rateDetail: String = ""
    /// 換算後新台幣金額（不含手續費）
    var amountTWD: Decimal = 0

    // 刷卡手續費
    var includesFee: Bool = false
    var feeRate: Decimal = 0
    var feeTWD: Decimal = 0
    var isFeeManual: Bool = false

    /// 收據照片檔名（存於 Application Support/Receipts）
    var receiptFileName: String?
    var createdAt: Date = Date()
    var updatedAt: Date = Date()

    init() {}
}

extension LedgerEntry {
    var type: TransactionType {
        get { TransactionType(rawValue: typeRaw) ?? .expense }
        set { typeRaw = newValue.rawValue }
    }
    var paymentMethod: PaymentMethod {
        get { PaymentMethod(rawValue: paymentMethodRaw) ?? .other }
        set { paymentMethodRaw = newValue.rawValue }
    }
    var rateSource: RateSource {
        get { RateSource(rawValue: rateSourceRaw) ?? .manual }
        set { rateSourceRaw = newValue.rawValue }
    }
    var isForeign: Bool { currency != "TWD" }
    /// 含手續費總額（新台幣）
    var totalTWD: Decimal { amountTWD + feeTWD }
    var categoryName: String { category?.name ?? "未分類" }
    var categoryIcon: String {
        if type == .cardPayment { return "creditcard.fill" }
        return category?.icon ?? "questionmark.circle"
    }
    var displayTitle: String {
        if type == .cardPayment { return "信用卡繳款" + (card.map { "・\($0.name)" } ?? "") }
        return merchant.isEmpty ? categoryName : merchant
    }

    var snapshot: TxSnapshot {
        TxSnapshot(type: type, amount: amount, currency: currency, amountTWD: amountTWD, feeTWD: feeTWD,
                   date: date, categoryID: category?.id, categoryName: categoryName,
                   countryCode: countryCode, paymentMethod: paymentMethod,
                   cardID: card?.id, cardName: card?.name)
    }
}

// MARK: - 分類

@Model
final class LedgerCategory {
    var id: UUID = UUID()
    var name: String = ""
    var icon: String = "tag.fill"
    var kindRaw: String = CategoryKind.expense.rawValue
    var sortOrder: Int = 0
    @Relationship(deleteRule: .nullify, inverse: \LedgerEntry.category)
    var entries: [LedgerEntry]? = []
    @Relationship(deleteRule: .cascade, inverse: \BudgetPlan.category)
    var budgets: [BudgetPlan]? = []

    init(id: UUID = UUID(), name: String, icon: String, kind: CategoryKind, sortOrder: Int) {
        self.id = id
        self.name = name
        self.icon = icon
        self.kindRaw = kind.rawValue
        self.sortOrder = sortOrder
    }

    var kind: CategoryKind {
        get { CategoryKind(rawValue: kindRaw) ?? .expense }
        set { kindRaw = newValue.rawValue }
    }
}

// MARK: - 卡片

@Model
final class PaymentCard {
    var id: UUID = UUID()
    /// 卡片別名，例如「國泰 CUBE」
    var name: String = ""
    var lastFour: String = ""
    var kindRaw: String = CardKind.credit.rawValue
    /// 個別手續費率；nil 代表使用全域預設
    var customFeeRate: Decimal?
    var sortOrder: Int = 0
    var createdAt: Date = Date()
    @Relationship(deleteRule: .nullify, inverse: \LedgerEntry.card)
    var entries: [LedgerEntry]? = []

    init(name: String, lastFour: String = "", kind: CardKind = .credit, customFeeRate: Decimal? = nil, sortOrder: Int = 0) {
        self.name = name
        self.lastFour = lastFour
        self.kindRaw = kind.rawValue
        self.customFeeRate = customFeeRate
        self.sortOrder = sortOrder
    }

    var kind: CardKind {
        get { CardKind(rawValue: kindRaw) ?? .credit }
        set { kindRaw = newValue.rawValue }
    }
    var displayName: String { lastFour.isEmpty ? name : "\(name)（\(lastFour)）" }
}

// MARK: - 預算

@Model
final class BudgetPlan {
    var id: UUID = UUID()
    var isTotal: Bool = false
    var category: LedgerCategory?
    /// 每月預算（新台幣）
    var amount: Decimal = 0

    init(isTotal: Bool, category: LedgerCategory?, amount: Decimal) {
        self.isTotal = isTotal
        self.category = category
        self.amount = amount
    }
}

/// 已發送的預算提醒（同一週期、同一預算、同一門檻只發一次）
@Model
final class BudgetAlertRecord {
    var periodKey: String = ""
    var budgetKey: String = ""
    var threshold: Int = 0
    var sentAt: Date = Date()

    init(periodKey: String, budgetKey: String, threshold: Int, sentAt: Date = Date()) {
        self.periodKey = periodKey
        self.budgetKey = budgetKey
        self.threshold = threshold
        self.sentAt = sentAt
    }
}

// MARK: - 設定（單一列）

@Model
final class AppSettings {
    var defaultFeeRate: Decimal = Decimal(string: "0.03")!
    var feeOnDebitCard: Bool = false
    var feeOnlyForeign: Bool = false
    var favoriteCurrencies: [String] = CurrencyCatalog.defaultFavorites
    var defaultCurrency: String = "TWD"
    var defaultCountry: String = "TW"
    var budgetStartDay: Int = 1
    var budgetAlertsEnabled: Bool = true
    /// 接近預算提醒門檻（%），100% 為固定的超支門檻
    var warningPercent: Int = 80

    init() {}

    var feePolicy: FeePolicy {
        FeePolicy(defaultRate: defaultFeeRate, applyToDebitCard: feeOnDebitCard, onlyForeignCurrency: feeOnlyForeign)
    }

    var alertThresholds: [Int] {
        Array(Set([min(max(warningPercent, 1), 99), 100])).sorted()
    }

    static func current(in context: ModelContext) -> AppSettings {
        if let s = try? context.fetch(FetchDescriptor<AppSettings>()).first { return s }
        let s = AppSettings()
        context.insert(s)
        try? context.save()
        return s
    }
}

enum AppSchema {
    static let models: [any PersistentModel.Type] = [
        LedgerEntry.self, LedgerCategory.self, PaymentCard.self,
        BudgetPlan.self, BudgetAlertRecord.self, AppSettings.self
    ]
}
