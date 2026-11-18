import Foundation

/// 刷卡手續費規則（來自設定）
struct FeePolicy: Equatable {
    /// 全域預設費率，0.03 = 3%
    var defaultRate: Decimal = Decimal(string: "0.03")!
    /// 金融卡是否也計算手續費（預設否）
    var applyToDebitCard: Bool = false
    /// 只有外幣交易才計算手續費（預設否：依需求所有刷卡交易都計算）
    var onlyForeignCurrency: Bool = false

    static let `default` = FeePolicy()
}

enum FeeCalculator {
    /// 該筆交易是否可能有刷卡手續費
    static func isApplicable(type: TransactionType, method: PaymentMethod, currency: String, policy: FeePolicy) -> Bool {
        guard type == .expense || type == .refund else { return false }
        let methodOK: Bool
        switch method {
        case .creditCard: methodOK = true
        case .debitCard: methodOK = policy.applyToDebitCard
        default: methodOK = false   // 現金、電子支付、其他：不計手續費
        }
        guard methodOK else { return false }
        return !policy.onlyForeignCurrency || currency != "TWD"
    }

    /// 新增交易時「計入手續費」的預設值：支出預設計入；退款預設不退回手續費（可手動開啟）
    static func defaultIncludesFee(type: TransactionType, method: PaymentMethod, currency: String, policy: FeePolicy) -> Bool {
        type == .expense && isApplicable(type: type, method: method, currency: currency, policy: policy)
    }

    /// 卡片個別費率優先，否則使用全域預設
    static func effectiveRate(cardRate: Decimal?, policy: FeePolicy) -> Decimal {
        cardRate ?? policy.defaultRate
    }

    /// 手續費 = 新台幣換算金額 × 費率，四捨五入至整數元（與多數發卡銀行帳單一致）
    static func fee(amountTWD: Decimal, rate: Decimal) -> Decimal {
        (amountTWD * rate).rounded(scale: 0)
    }

    /// 外幣換算新台幣：原幣金額 × 匯率，四捨五入至小數 2 位
    static func convert(amount: Decimal, rate: Decimal) -> Decimal {
        (amount * rate).rounded(scale: 2)
    }
}
