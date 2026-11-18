import Foundation

struct RateQuote: Equatable {
    var rate: Decimal
    var rateDate: Date
    var source: RateSource
    var detail: String
}

enum RateLookupError: LocalizedError {
    case offline
    case notFound

    var errorDescription: String? {
        switch self {
        case .offline: return "目前無法連線，請手動輸入匯率。"
        case .notFound: return "資料來源查無該日匯率，請手動輸入匯率。"
        }
    }
}

/// 匯率查詢策略：
/// 1. 臺灣銀行牌告匯率（支援 19 種外幣，有歷史資料）：從交易日起往前找最多 7 天（週末／假日無牌告時採前一營業日）。
///    支出／退款取「即期賣出」，收入取「即期買入」；無即期報價的幣別改用現金匯率。
/// 2. 臺銀不支援的幣別或查無資料時，改用 fawazahmed0 Currency API（每日市場中間價，2024-03 起有歷史資料）。
/// 3. 都失敗 → 拋出錯誤，介面提示手動輸入。
actor ExchangeRateService {
    static let shared = ExchangeRateService()

    private var botCache: [String: [String: BOTRate]] = [:]
    private let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 10
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }()

    func quote(currency: String, date: Date, side: RateSide) async throws -> RateQuote {
        let code = currency.uppercased()
        if code == "TWD" {
            return RateQuote(rate: 1, rateDate: date, source: .base, detail: "")
        }
        let target = min(date, Date())   // 未來日期以今天查詢
        var networkFailed = false

        // 1) 臺灣銀行
        if BankOfTaiwanParser.supportedCurrencies.contains(code) {
            for offset in 0..<7 {
                try Task.checkCancellation()
                guard let day = Calendar.current.date(byAdding: .day, value: -offset, to: target) else { continue }
                do {
                    let table = try await botTable(for: day)
                    if let row = table[code], let picked = row.pick(side) {
                        let note = offset == 0 ? "" : "（交易日無牌告，採前一營業日）"
                        return RateQuote(rate: picked.rate, rateDate: Calendar.current.startOfDay(for: day),
                                         source: .bankOfTaiwan, detail: "臺灣銀行牌告 \(picked.label)\(note)")
                    }
                    if !table.isEmpty { break }   // 當日有牌告但沒有該幣別報價
                } catch {
                    if Task.isCancelled { throw CancellationError() }
                    networkFailed = networkFailed || Self.isConnectivity(error)
                    break
                }
            }
        }

        // 2) Currency API
        do {
            if let q = try await currencyAPI(code: code, date: target) { return q }
        } catch {
            if Task.isCancelled { throw CancellationError() }
            networkFailed = networkFailed || Self.isConnectivity(error)
        }

        throw networkFailed ? RateLookupError.offline : RateLookupError.notFound
    }

    // MARK: - 臺灣銀行

    private func botTable(for day: Date) async throws -> [String: BOTRate] {
        let key = Fmt.dayKey(day)
        if let cached = botCache[key] { return cached }
        let url = URL(string: "https://rate.bot.com.tw/xrt/flcsv/0/\(key)")!
        let (data, response) = try await session.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        let table = BankOfTaiwanParser.parse(data)
        // 今天的牌告可能稍後才有，不快取空結果
        if !table.isEmpty || !Calendar.current.isDateInToday(day) { botCache[key] = table }
        return table
    }

    // MARK: - Currency API

    private func currencyAPI(code: String, date: Date) async throws -> RateQuote? {
        let key = Fmt.dayKey(date)
        let base = code.lowercased()
        let urls = [
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@\(key)/v1/currencies/\(base).json",
            "https://\(key).currency-api.pages.dev/v1/currencies/\(base).json"
        ].compactMap(URL.init(string:))
        var lastError: Error?
        for url in urls {
            do {
                let (data, response) = try await session.data(from: url)
                guard (response as? HTTPURLResponse)?.statusCode == 200 else { continue }
                if let parsed = CurrencyAPIParser.parse(data, base: base) {
                    let rateDate = Fmt.date(fromDayKey: parsed.date) ?? Calendar.current.startOfDay(for: date)
                    return RateQuote(rate: parsed.rate, rateDate: rateDate, source: .currencyAPI,
                                     detail: "Currency API 市場中間價")
                }
            } catch {
                if Task.isCancelled { throw CancellationError() }
                lastError = error
            }
        }
        if let lastError, Self.isConnectivity(lastError) { throw lastError }
        return nil
    }

    private static func isConnectivity(_ error: Error) -> Bool {
        guard let e = error as? URLError else { return false }
        switch e.code {
        case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotFindHost,
             .cannotConnectToHost, .dnsLookupFailed, .dataNotAllowed, .internationalRoamingOff:
            return true
        default:
            return false
        }
    }
}
