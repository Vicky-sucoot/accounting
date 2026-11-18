import Foundation

/// 臺灣銀行牌告匯率一列
struct BOTRate: Equatable {
    let currency: String
    let cashBuy: Decimal?
    let spotBuy: Decimal?
    let cashSell: Decimal?
    let spotSell: Decimal?

    /// 優先使用即期匯率；部分幣別（如 KRW、VND）只有現金匯率
    func pick(_ side: RateSide) -> (rate: Decimal, label: String)? {
        switch side {
        case .sell:
            if let r = spotSell { return (r, "即期賣出") }
            if let r = cashSell { return (r, "現金賣出") }
        case .buy:
            if let r = spotBuy { return (r, "即期買入") }
            if let r = cashBuy { return (r, "現金買入") }
        }
        return nil
    }
}

/// 解析 https://rate.bot.com.tw/xrt/flcsv/0/{yyyy-MM-dd} 的 CSV
/// 欄位：幣別,匯率(本行買入),現金,即期,遠期10天…遠期180天,匯率(本行賣出),現金,即期,遠期…
enum BankOfTaiwanParser {
    static let supportedCurrencies: Set<String> = [
        "USD", "HKD", "GBP", "AUD", "CAD", "SGD", "CHF", "JPY", "ZAR", "SEK",
        "NZD", "THB", "PHP", "IDR", "EUR", "KRW", "VND", "MYR", "CNY"
    ]

    static func parse(_ data: Data) -> [String: BOTRate] {
        guard var text = String(data: data, encoding: .utf8) else { return [:] }
        if text.unicodeScalars.first == "\u{FEFF}" { text.removeFirst() }
        var result: [String: BOTRate] = [:]
        for line in text.components(separatedBy: .newlines) {
            let f = line.split(separator: ",", omittingEmptySubsequences: false)
                .map { $0.trimmingCharacters(in: CharacterSet(charactersIn: " \"\t")) }
            guard f.count >= 4,
                  f[0].count == 3,
                  f[0].allSatisfy({ $0.isLetter && $0.isUppercase }),
                  let sellIdx = f.firstIndex(of: "本行賣出") else { continue }
            func num(_ i: Int) -> Decimal? {
                guard i < f.count, let d = Decimal(string: f[i]), d > 0 else { return nil }
                return d
            }
            result[f[0]] = BOTRate(currency: f[0],
                                   cashBuy: num(2), spotBuy: num(3),
                                   cashSell: num(sellIdx + 1), spotSell: num(sellIdx + 2))
        }
        return result
    }
}

/// 解析 fawazahmed0/exchange-api：
/// https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{yyyy-MM-dd}/v1/currencies/{base}.json
/// 回傳格式 {"date":"2026-11-16","usd":{"twd":31.52,...}}
enum CurrencyAPIParser {
    static func parse(_ data: Data, base: String, quote: String = "twd") -> (rate: Decimal, date: String)? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let date = obj["date"] as? String,
              let table = obj[base.lowercased()] as? [String: Any],
              let value = table[quote.lowercased()] as? NSNumber,
              let rate = Decimal(string: value.stringValue), rate > 0 else { return nil }
        return (rate.rounded(scale: 6), date)
    }
}
