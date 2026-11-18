import Foundation

/// 統計用的交易快照（與 SwiftData 解耦，方便測試）
struct TxSnapshot: Equatable {
    var type: TransactionType
    var amount: Decimal
    var currency: String
    var amountTWD: Decimal
    var feeTWD: Decimal
    var date: Date
    var categoryID: UUID?
    var categoryName: String
    var countryCode: String
    var paymentMethod: PaymentMethod
    var cardID: UUID?
    var cardName: String?

    /// 對支出的淨影響（含手續費）：支出為正、退款為負，其餘為 0
    var netExpenseTWD: Decimal {
        switch type {
        case .expense: return amountTWD + feeTWD
        case .refund: return -(amountTWD + feeTWD)
        default: return 0
        }
    }

    /// 對手續費統計的淨影響
    var netFeeTWD: Decimal {
        switch type {
        case .expense: return feeTWD
        case .refund: return -feeTWD
        default: return 0
        }
    }
}

struct CurrencyBreakdown: Identifiable, Equatable {
    let currency: String
    var income: Decimal = 0
    var expense: Decimal = 0
    var refund: Decimal = 0
    var id: String { currency }
    /// 該幣別淨支出（原幣，不含手續費；手續費一律以新台幣計）
    var netExpense: Decimal { expense - refund }
}

struct LedgerSummary: Equatable {
    var incomeTWD: Decimal = 0
    /// 淨支出（含手續費、扣除退款）
    var expenseTWD: Decimal = 0
    /// 淨消費金額（不含手續費）
    var spendingTWD: Decimal = 0
    var feeTWD: Decimal = 0
    var refundTWD: Decimal = 0
    var cardPaymentTWD: Decimal = 0
    var count: Int = 0
    var byCurrency: [CurrencyBreakdown] = []
    var balanceTWD: Decimal { incomeTWD - expenseTWD }
}

struct GroupTotal: Identifiable, Equatable {
    let key: String
    let label: String
    let value: Decimal
    var id: String { key }
}

enum StatisticsEngine {
    static func summarize(_ items: [TxSnapshot]) -> LedgerSummary {
        var s = LedgerSummary()
        var currencies: [String: CurrencyBreakdown] = [:]
        for t in items {
            s.count += 1
            var c = currencies[t.currency] ?? CurrencyBreakdown(currency: t.currency)
            switch t.type {
            case .income:
                s.incomeTWD += t.amountTWD
                c.income += t.amount
            case .expense:
                c.expense += t.amount
            case .refund:
                s.refundTWD += t.amountTWD + t.feeTWD
                c.refund += t.amount
            case .cardPayment:
                s.cardPaymentTWD += t.amountTWD   // 繳卡費僅記錄，不計入收支
            }
            s.expenseTWD += t.netExpenseTWD
            s.feeTWD += t.netFeeTWD
            if t.type != .cardPayment { currencies[t.currency] = c }
        }
        s.spendingTWD = s.expenseTWD - s.feeTWD
        // 新台幣排第一，其餘依字母
        s.byCurrency = currencies.values.sorted {
            if $0.currency == "TWD" { return true }
            if $1.currency == "TWD" { return false }
            return $0.currency < $1.currency
        }
        return s
    }

    /// 依維度彙總淨支出（含手續費），只列出大於 0 的項目
    static func expenseBreakdown(_ items: [TxSnapshot], key: (TxSnapshot) -> (key: String, label: String)) -> [GroupTotal] {
        group(items, value: \.netExpenseTWD, key: key)
    }

    static func feeBreakdown(_ items: [TxSnapshot], key: (TxSnapshot) -> (key: String, label: String)) -> [GroupTotal] {
        group(items, value: \.netFeeTWD, key: key)
    }

    private static func group(_ items: [TxSnapshot], value: KeyPath<TxSnapshot, Decimal>,
                              key: (TxSnapshot) -> (key: String, label: String)) -> [GroupTotal] {
        var totals: [String: (String, Decimal)] = [:]
        for t in items {
            let v = t[keyPath: value]
            guard v != 0 else { continue }
            let k = key(t)
            let current = totals[k.key]?.1 ?? 0
            totals[k.key] = (k.label, current + v)
        }
        return totals
            .map { GroupTotal(key: $0.key, label: $0.value.0, value: $0.value.1) }
            .filter { $0.value > 0 }
            .sorted { $0.value > $1.value }
    }
}

/// 信用卡帳務估算：累計刷卡（含手續費）－ 退款 － 已繳款 = 估計未繳
struct CardBalance: Equatable {
    var charges: Decimal = 0
    var refunds: Decimal = 0
    var payments: Decimal = 0
    var outstanding: Decimal { charges - refunds - payments }

    static func compute(_ items: [TxSnapshot]) -> CardBalance {
        var b = CardBalance()
        for t in items {
            switch t.type {
            case .expense: b.charges += t.amountTWD + t.feeTWD
            case .refund: b.refunds += t.amountTWD + t.feeTWD
            case .cardPayment: b.payments += t.amountTWD
            case .income: break
            }
        }
        return b
    }
}
