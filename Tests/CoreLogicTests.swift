import XCTest
@testable import PocketLedger

final class FeeCalculatorTests: XCTestCase {
    let policy = FeePolicy.default

    func testDefaultRateIsThreePercent() {
        XCTAssertEqual(policy.defaultRate, Decimal(string: "0.03"))
    }

    func testForeignCardFeeRoundsToInteger() {
        let twd = FeeCalculator.convert(amount: 100, rate: Decimal(string: "31.5")!)
        XCTAssertEqual(twd, 3150)
        XCTAssertEqual(FeeCalculator.fee(amountTWD: twd, rate: policy.defaultRate), 95) // 94.5 → 95
    }

    func testConversionKeepsTwoDecimals() {
        // JPY 1,234 × 0.2135 = 263.459 → 263.46
        XCTAssertEqual(FeeCalculator.convert(amount: 1234, rate: Decimal(string: "0.2135")!), Decimal(string: "263.46"))
    }

    func testCashHasNoFee() {
        XCTAssertFalse(FeeCalculator.isApplicable(type: .expense, method: .cash, currency: "USD", policy: policy))
        XCTAssertFalse(FeeCalculator.isApplicable(type: .expense, method: .ePayment, currency: "USD", policy: policy))
    }

    func testCreditCardFeeAppliesIncludingTWDByDefault() {
        XCTAssertTrue(FeeCalculator.isApplicable(type: .expense, method: .creditCard, currency: "TWD", policy: policy))
        var foreignOnly = policy
        foreignOnly.onlyForeignCurrency = true
        XCTAssertFalse(FeeCalculator.isApplicable(type: .expense, method: .creditCard, currency: "TWD", policy: foreignOnly))
    }

    func testDebitCardFollowsSetting() {
        XCTAssertFalse(FeeCalculator.isApplicable(type: .expense, method: .debitCard, currency: "JPY", policy: policy))
        var p = policy
        p.applyToDebitCard = true
        XCTAssertTrue(FeeCalculator.isApplicable(type: .expense, method: .debitCard, currency: "JPY", policy: p))
    }

    func testIncomeAndCardPaymentHaveNoFee() {
        XCTAssertFalse(FeeCalculator.isApplicable(type: .income, method: .creditCard, currency: "USD", policy: policy))
        XCTAssertFalse(FeeCalculator.isApplicable(type: .cardPayment, method: .creditCard, currency: "TWD", policy: policy))
    }

    func testRefundDoesNotIncludeFeeByDefault() {
        XCTAssertTrue(FeeCalculator.isApplicable(type: .refund, method: .creditCard, currency: "USD", policy: policy))
        XCTAssertFalse(FeeCalculator.defaultIncludesFee(type: .refund, method: .creditCard, currency: "USD", policy: policy))
    }

    func testCardRateOverridesDefault() {
        XCTAssertEqual(FeeCalculator.effectiveRate(cardRate: Decimal(string: "0.015"), policy: policy), Decimal(string: "0.015"))
        XCTAssertEqual(FeeCalculator.effectiveRate(cardRate: nil, policy: policy), policy.defaultRate)
    }
}

final class BudgetPeriodTests: XCTestCase {
    var cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Taipei")!
        return c
    }()

    func date(_ y: Int, _ m: Int, _ d: Int) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: 12))!
    }

    func testFirstDayPeriod() {
        let p = BudgetPeriod.containing(date(2026, 11, 18), startDay: 1, calendar: cal)
        XCTAssertEqual(cal.dateComponents([.month, .day], from: p.start), DateComponents(month: 11, day: 1))
        XCTAssertEqual(cal.dateComponents([.month, .day], from: p.end), DateComponents(month: 12, day: 1))
    }

    func testCustomStartDayBeforeStart() {
        // 起始日 25：11/18 屬於 10/25 – 11/24
        let p = BudgetPeriod.containing(date(2026, 11, 18), startDay: 25, calendar: cal)
        XCTAssertEqual(cal.dateComponents([.month, .day], from: p.start), DateComponents(month: 10, day: 25))
        XCTAssertEqual(cal.dateComponents([.month, .day], from: p.end), DateComponents(month: 11, day: 25))
    }

    func testCustomStartDayOnStart() {
        let p = BudgetPeriod.containing(date(2026, 11, 25), startDay: 25, calendar: cal)
        XCTAssertEqual(cal.dateComponents([.month, .day], from: p.start), DateComponents(month: 11, day: 25))
    }

    func testYearBoundary() {
        let p = BudgetPeriod.containing(date(2027, 1, 3), startDay: 10, calendar: cal)
        XCTAssertEqual(cal.dateComponents([.year, .month, .day], from: p.start), DateComponents(year: 2026, month: 12, day: 10))
    }

    func testStartDayIsClamped() {
        XCTAssertEqual(BudgetPeriod.clampDay(31), 28)
        XCTAssertEqual(BudgetPeriod.clampDay(0), 1)
    }
}

final class BudgetAlertTests: XCTestCase {
    let food = UUID()

    func snap(_ type: TransactionType, _ twd: Decimal, fee: Decimal = 0, category: UUID? = nil, date: Date = Date()) -> TxSnapshot {
        TxSnapshot(type: type, amount: twd, currency: "TWD", amountTWD: twd, feeTWD: fee, date: date,
                   categoryID: category, categoryName: "", countryCode: "TW", paymentMethod: .creditCard,
                   cardID: nil, cardName: nil)
    }

    func testUsageIncludesFeesAndSubtractsRefunds() {
        let period = BudgetPeriod.containing(Date(), startDay: 1)
        let defs = [
            BudgetDefinition(key: "total", name: "總", icon: "", amount: 10000, categoryID: nil),
            BudgetDefinition(key: food.uuidString, name: "餐飲", icon: "", amount: 1000, categoryID: food)
        ]
        let items = [
            snap(.expense, 800, fee: 24, category: food),
            snap(.refund, 100, category: food),
            snap(.expense, 3000, fee: 90),
            snap(.income, 50000),
            snap(.cardPayment, 5000)
        ]
        let u = BudgetCalculator.usages(definitions: defs, entries: items, period: period)
        XCTAssertEqual(u[0].spent, 3814)   // 824 - 100 + 3090
        XCTAssertEqual(u[1].spent, 724)
        XCTAssertEqual(u[1].percent, 72)
    }

    func testEachThresholdOnlyOnce() {
        let usage = BudgetUsage(key: "total", name: "總", icon: "", budget: 1000, spent: 850)
        XCTAssertEqual(BudgetCalculator.pendingAlerts(for: usage, thresholds: [80, 100], alreadySent: []), [80])
        XCTAssertEqual(BudgetCalculator.pendingAlerts(for: usage, thresholds: [80, 100], alreadySent: [80]), [])
        let over = BudgetUsage(key: "total", name: "總", icon: "", budget: 1000, spent: 1200)
        XCTAssertEqual(BudgetCalculator.pendingAlerts(for: over, thresholds: [80, 100], alreadySent: [80]), [100])
        XCTAssertEqual(BudgetCalculator.pendingAlerts(for: over, thresholds: [80, 100], alreadySent: []), [80, 100])
    }

    func testRaisingBudgetClearsUnreachedThresholds() {
        let usage = BudgetUsage(key: "total", name: "總", icon: "", budget: 2000, spent: 1200)  // 原本 1000 時已達 100%
        XCTAssertEqual(BudgetCalculator.thresholdsToClear(for: usage, sent: [80, 100]), [80, 100])
        let usage2 = BudgetUsage(key: "total", name: "總", icon: "", budget: 1400, spent: 1200)
        XCTAssertEqual(BudgetCalculator.thresholdsToClear(for: usage2, sent: [80, 100]), [100])
    }

    func testNotificationTextContainsAmounts() {
        let usage = BudgetUsage(key: "x", name: "餐飲", icon: "", budget: 10000, spent: 8200)
        let t = BudgetCalculator.notificationText(for: usage, threshold: 80)
        XCTAssertTrue(t.title.contains("餐飲"))
        XCTAssertTrue(t.body.contains("NT$8,200"))
        XCTAssertTrue(t.body.contains("NT$10,000"))
        XCTAssertTrue(t.body.contains("82%"))
    }
}

final class StatisticsTests: XCTestCase {
    func make(_ type: TransactionType, _ amount: Decimal, _ cur: String, twd: Decimal, fee: Decimal = 0) -> TxSnapshot {
        TxSnapshot(type: type, amount: amount, currency: cur, amountTWD: twd, feeTWD: fee, date: Date(),
                   categoryID: nil, categoryName: "未分類", countryCode: "JP", paymentMethod: .creditCard,
                   cardID: nil, cardName: nil)
    }

    func testCurrenciesAreNotMixed() {
        let s = StatisticsEngine.summarize([
            make(.expense, 120, "USD", twd: 3780, fee: 113),
            make(.expense, 8000, "JPY", twd: 1708, fee: 51),
            make(.expense, 3500, "TWD", twd: 3500),
            make(.income, 50000, "TWD", twd: 50000),
            make(.cardPayment, 4000, "TWD", twd: 4000)
        ])
        XCTAssertEqual(s.byCurrency.map(\.currency), ["TWD", "JPY", "USD"])
        XCTAssertEqual(s.byCurrency.first { $0.currency == "USD" }?.netExpense, 120)
        XCTAssertEqual(s.byCurrency.first { $0.currency == "JPY" }?.netExpense, 8000)
        XCTAssertEqual(s.expenseTWD, 3780 + 113 + 1708 + 51 + 3500)
        XCTAssertEqual(s.feeTWD, 164)
        XCTAssertEqual(s.spendingTWD, 3780 + 1708 + 3500)
        XCTAssertEqual(s.incomeTWD, 50000)
        XCTAssertEqual(s.cardPaymentTWD, 4000)        // 繳卡費不算支出
        XCTAssertEqual(s.balanceTWD, 50000 - s.expenseTWD)
    }

    func testCardBalance() {
        let b = CardBalance.compute([
            make(.expense, 100, "USD", twd: 3150, fee: 95),
            make(.refund, 20, "USD", twd: 630),
            make(.cardPayment, 2000, "TWD", twd: 2000)
        ])
        XCTAssertEqual(b.outstanding, 3245 - 630 - 2000)
    }
}

final class RateParserTests: XCTestCase {
    func testBankOfTaiwanCSV() {
        let csv = """
        \u{FEFF}幣別,匯率,現金,即期,遠期10天,遠期30天,遠期60天,遠期90天,遠期120天,遠期150天,遠期180天,匯率,現金,即期,遠期10天,遠期30天,遠期60天,遠期90天,遠期120天,遠期150天,遠期180天
        USD,本行買入,31.85000,32.20000,32.15,32.1,32.0,31.9,31.8,31.7,31.6,本行賣出,32.52000,32.30000,32.25,32.2,32.1,32.0,31.9,31.8,31.7
        KRW,本行買入,0.02097,0.00000,0,0,0,0,0,0,0,本行賣出,0.02487,0.00000,0,0,0,0,0,0,0
        """
        let table = BankOfTaiwanParser.parse(Data(csv.utf8))
        XCTAssertEqual(table["USD"]?.pick(.sell)?.rate, Decimal(string: "32.3"))
        XCTAssertEqual(table["USD"]?.pick(.sell)?.label, "即期賣出")
        XCTAssertEqual(table["USD"]?.pick(.buy)?.rate, Decimal(string: "32.2"))
        XCTAssertEqual(table["KRW"]?.pick(.sell)?.rate, Decimal(string: "0.02487"))
        XCTAssertEqual(table["KRW"]?.pick(.sell)?.label, "現金賣出")
    }

    func testCurrencyAPIJSON() {
        let json = #"{"date":"2026-11-16","usd":{"twd":31.523456,"jpy":154.2}}"#
        let r = CurrencyAPIParser.parse(Data(json.utf8), base: "USD")
        XCTAssertEqual(r?.rate, Decimal(string: "31.523456"))
        XCTAssertEqual(r?.date, "2026-11-16")
    }

    func testDecimalParse() {
        XCTAssertEqual(Decimal.parse("1,234.5"), Decimal(string: "1234.5"))
        XCTAssertNil(Decimal.parse("abc"))
        XCTAssertNil(Decimal.parse(""))
    }
}
