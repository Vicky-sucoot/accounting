import Foundation

extension Decimal {
    /// 依指定小數位數四捨五入（預設為一般四捨五入）
    func rounded(scale: Int, mode: NSDecimalNumber.RoundingMode = .plain) -> Decimal {
        var value = self
        var result = Decimal()
        NSDecimalRound(&result, &value, scale, mode)
        return result
    }

    var doubleValue: Double { NSDecimalNumber(decimal: self).doubleValue }

    /// 給 TextField 使用的純數字字串（無千分位）
    var plainString: String { NSDecimalNumber(decimal: self).stringValue }

    /// 解析使用者輸入，允許千分位逗號
    static func parse(_ text: String) -> Decimal? {
        let cleaned = text
            .replacingOccurrences(of: ",", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty,
              cleaned.allSatisfy({ $0.isNumber || $0 == "." || $0 == "-" }) else { return nil }
        return Decimal(string: cleaned, locale: Locale(identifier: "en_US_POSIX"))
    }
}

enum Fmt {
    static let zhLocale = Locale(identifier: "zh-Hant-TW")

    private static func number(_ value: Decimal, minFraction: Int, maxFraction: Int) -> String {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US")
        f.numberStyle = .decimal
        f.minimumFractionDigits = minFraction
        f.maximumFractionDigits = maxFraction
        return f.string(from: NSDecimalNumber(decimal: value)) ?? "\(value)"
    }

    /// NT$1,234.5
    static func twd(_ value: Decimal) -> String {
        let sign = value < 0 ? "-" : ""
        return sign + "NT$" + number(abs(value), minFraction: 0, maxFraction: 2)
    }

    /// 各幣別原始金額，例如 USD 120.50、JPY 8,000
    static func money(_ value: Decimal, _ currency: String) -> String {
        if currency == "TWD" { return twd(value) }
        let digits = fractionDigits(for: currency)
        let sign = value < 0 ? "-" : ""
        return "\(sign)\(currency) " + number(abs(value), minFraction: 0, maxFraction: digits)
    }

    static func fractionDigits(for currency: String) -> Int {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = currency
        return f.maximumFractionDigits
    }

    static func rate(_ value: Decimal) -> String {
        number(value, minFraction: 2, maxFraction: 6)
    }

    /// 0.03 → 3%；0.015 → 1.5%
    static func percent(_ rate: Decimal) -> String {
        number(rate * 100, minFraction: 0, maxFraction: 2) + "%"
    }

    static func date(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = zhLocale
        f.dateFormat = "yyyy/MM/dd"
        return f.string(from: date)
    }

    static func shortDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = zhLocale
        f.dateFormat = "M/d"
        return f.string(from: date)
    }

    static func dayHeader(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = zhLocale
        f.dateFormat = "M月d日 EEEE"
        return f.string(from: date)
    }

    /// API 用日期 yyyy-MM-dd（以裝置目前時區的日曆日為準）
    static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    static func date(fromDayKey key: String, calendar: Calendar = .current) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}

enum CurrencyCatalog {
    static let defaultFavorites = ["TWD", "USD", "JPY", "EUR", "KRW", "CNY", "HKD", "GBP", "THB", "SGD", "AUD"]

    static var allCodes: [String] {
        Array(Set(Locale.commonISOCurrencyCodes)).sorted()
    }

    static func name(_ code: String) -> String {
        Fmt.zhLocale.localizedString(forCurrencyCode: code) ?? code
    }

    /// 選擇幣別時建議的國家／地區
    static let suggestedRegion: [String: String] = [
        "TWD": "TW", "USD": "US", "JPY": "JP", "KRW": "KR", "CNY": "CN", "HKD": "HK",
        "MOP": "MO", "GBP": "GB", "THB": "TH", "SGD": "SG", "AUD": "AU", "NZD": "NZ",
        "CAD": "CA", "CHF": "CH", "VND": "VN", "MYR": "MY", "PHP": "PH", "IDR": "ID",
        "SEK": "SE", "ZAR": "ZA", "INR": "IN"
    ]
}

enum RegionCatalog {
    static let common = ["TW", "JP", "KR", "US", "CN", "HK", "MO", "TH", "SG", "VN", "MY", "GB", "FR", "DE", "IT", "AU"]

    static var all: [String] {
        Locale.Region.isoRegions
            .map(\.identifier)
            .filter { $0.count == 2 && $0.allSatisfy(\.isLetter) }
            .sorted { name($0).localizedCompare(name($1)) == .orderedAscending }
    }

    static func name(_ code: String) -> String {
        Fmt.zhLocale.localizedString(forRegionCode: code) ?? code
    }

    static func flag(_ code: String) -> String {
        code.uppercased().unicodeScalars
            .compactMap { UnicodeScalar(127397 + $0.value) }
            .map { String($0) }
            .joined()
    }

    static func label(_ code: String) -> String { "\(flag(code)) \(name(code))" }
}
