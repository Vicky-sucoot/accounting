import Foundation

/// 交易類型
enum TransactionType: String, Codable, CaseIterable, Identifiable {
    case expense       // 支出
    case income        // 收入
    case refund        // 退款（沖減支出）
    case cardPayment   // 信用卡繳款（轉帳，不計入收支）

    var id: String { rawValue }

    var title: String {
        switch self {
        case .expense: return "支出"
        case .income: return "收入"
        case .refund: return "退款"
        case .cardPayment: return "繳卡費"
        }
    }

    var symbol: String {
        switch self {
        case .expense: return "arrow.up.right.circle.fill"
        case .income: return "arrow.down.left.circle.fill"
        case .refund: return "arrow.uturn.backward.circle.fill"
        case .cardPayment: return "creditcard.circle.fill"
        }
    }

    /// 對應的分類種類；繳卡費不使用分類
    var categoryKind: CategoryKind? {
        switch self {
        case .expense, .refund: return .expense
        case .income: return .income
        case .cardPayment: return nil
        }
    }
}

/// 付款方式
enum PaymentMethod: String, Codable, CaseIterable, Identifiable {
    case cash, creditCard, debitCard, ePayment, other

    var id: String { rawValue }

    var title: String {
        switch self {
        case .cash: return "現金"
        case .creditCard: return "信用卡"
        case .debitCard: return "金融卡"
        case .ePayment: return "電子支付"
        case .other: return "其他"
        }
    }

    var symbol: String {
        switch self {
        case .cash: return "banknote"
        case .creditCard: return "creditcard"
        case .debitCard: return "creditcard.and.123"
        case .ePayment: return "iphone.gen3"
        case .other: return "ellipsis.circle"
        }
    }

    /// 是否需要選擇卡片
    var usesCard: Bool { self == .creditCard || self == .debitCard }
}

enum CardKind: String, Codable, CaseIterable, Identifiable {
    case credit, debit
    var id: String { rawValue }
    var title: String { self == .credit ? "信用卡" : "金融卡" }
    var method: PaymentMethod { self == .credit ? .creditCard : .debitCard }
}

enum CategoryKind: String, Codable, CaseIterable, Identifiable {
    case expense, income
    var id: String { rawValue }
    var title: String { self == .expense ? "支出分類" : "收入分類" }
}

/// 匯率資料來源
enum RateSource: String, Codable {
    case base           // 新台幣，免換算
    case bankOfTaiwan   // 臺灣銀行牌告匯率
    case currencyAPI    // fawazahmed0 Currency API（市場中間價）
    case manual         // 使用者手動輸入

    var title: String {
        switch self {
        case .base: return "新台幣（免換算）"
        case .bankOfTaiwan: return "臺灣銀行牌告匯率"
        case .currencyAPI: return "Currency API（市場中間價）"
        case .manual: return "手動輸入匯率"
        }
    }
}

/// 查詢匯率時使用的報價方向：支出／退款用「銀行賣出」，收入用「銀行買入」
enum RateSide: String {
    case sell, buy
}
