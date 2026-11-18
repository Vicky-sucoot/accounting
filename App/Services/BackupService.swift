import Foundation
import SwiftData
import SwiftUI
import UniformTypeIdentifiers

// MARK: - 備份檔格式（單一 JSON 檔，收據照片以 Base64 內嵌）

struct BackupFile: Codable {
    static let currentVersion = 1
    static let appIdentifier = "PocketLedger"

    var formatVersion: Int
    var app: String
    var exportedAt: Date
    var appVersion: String
    var settings: SettingsDTO
    var categories: [CategoryDTO]
    var cards: [CardDTO]
    var budgets: [BudgetDTO]
    var alertRecords: [AlertDTO]
    var entries: [EntryDTO]
    var receipts: [ReceiptDTO]

    // 金額一律以字串保存，避免 JSON 浮點數誤差
    struct SettingsDTO: Codable {
        var defaultFeeRate: String
        var feeOnDebitCard: Bool
        var feeOnlyForeign: Bool
        var favoriteCurrencies: [String]
        var defaultCurrency: String
        var defaultCountry: String
        var budgetStartDay: Int
        var budgetAlertsEnabled: Bool
        var warningPercent: Int
    }
    struct CategoryDTO: Codable {
        var id: UUID; var name: String; var icon: String; var kind: String; var sortOrder: Int
    }
    struct CardDTO: Codable {
        var id: UUID; var name: String; var lastFour: String; var kind: String
        var customFeeRate: String?; var sortOrder: Int; var createdAt: Date
    }
    struct BudgetDTO: Codable {
        var isTotal: Bool; var categoryID: UUID?; var amount: String
    }
    struct AlertDTO: Codable {
        var periodKey: String; var budgetKey: String; var threshold: Int; var sentAt: Date
    }
    struct EntryDTO: Codable {
        var id: UUID; var type: String; var amount: String; var currency: String; var date: Date
        var categoryID: UUID?; var countryCode: String; var paymentMethod: String; var cardID: UUID?
        var merchant: String; var note: String
        var exchangeRate: String; var rateDate: Date?; var rateSource: String; var rateDetail: String
        var amountTWD: String
        var includesFee: Bool; var feeRate: String; var feeTWD: String; var isFeeManual: Bool
        var receiptFileName: String?; var createdAt: Date; var updatedAt: Date
    }
    struct ReceiptDTO: Codable {
        var fileName: String
        var data: Data   // JSONEncoder 預設以 Base64 編碼
    }
}

enum BackupError: LocalizedError {
    case invalidFile
    case unsupportedVersion(Int)

    var errorDescription: String? {
        switch self {
        case .invalidFile: return "不是有效的記帳備份檔。"
        case .unsupportedVersion(let v): return "備份檔版本（\(v)）較新，請先更新 App。"
        }
    }
}

enum BackupService {
    static func encoder() -> JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return e
    }

    static func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }

    static func defaultFileName(date: Date = Date()) -> String {
        "記帳備份_\(Fmt.dayKey(date))"
    }

    // MARK: 匯出

    static func makeBackup(context: ModelContext) throws -> Data {
        let s = AppSettings.current(in: context)
        let categories = try context.fetch(FetchDescriptor<LedgerCategory>())
        let cards = try context.fetch(FetchDescriptor<PaymentCard>())
        let budgets = try context.fetch(FetchDescriptor<BudgetPlan>())
        let alerts = try context.fetch(FetchDescriptor<BudgetAlertRecord>())
        let entries = try context.fetch(FetchDescriptor<LedgerEntry>(sortBy: [SortDescriptor(\.date)]))

        var receipts: [BackupFile.ReceiptDTO] = []
        for name in Set(entries.compactMap(\.receiptFileName)).sorted() {
            if let data = ReceiptStore.loadData(name) {
                receipts.append(.init(fileName: name, data: data))
            }
        }

        let file = BackupFile(
            formatVersion: BackupFile.currentVersion,
            app: BackupFile.appIdentifier,
            exportedAt: Date(),
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0",
            settings: .init(defaultFeeRate: s.defaultFeeRate.plainString, feeOnDebitCard: s.feeOnDebitCard,
                            feeOnlyForeign: s.feeOnlyForeign, favoriteCurrencies: s.favoriteCurrencies,
                            defaultCurrency: s.defaultCurrency, defaultCountry: s.defaultCountry,
                            budgetStartDay: s.budgetStartDay, budgetAlertsEnabled: s.budgetAlertsEnabled,
                            warningPercent: s.warningPercent),
            categories: categories.map { .init(id: $0.id, name: $0.name, icon: $0.icon, kind: $0.kindRaw, sortOrder: $0.sortOrder) },
            cards: cards.map { .init(id: $0.id, name: $0.name, lastFour: $0.lastFour, kind: $0.kindRaw,
                                     customFeeRate: $0.customFeeRate?.plainString, sortOrder: $0.sortOrder, createdAt: $0.createdAt) },
            budgets: budgets.map { .init(isTotal: $0.isTotal, categoryID: $0.category?.id, amount: $0.amount.plainString) },
            alertRecords: alerts.map { .init(periodKey: $0.periodKey, budgetKey: $0.budgetKey, threshold: $0.threshold, sentAt: $0.sentAt) },
            entries: entries.map { e in
                .init(id: e.id, type: e.typeRaw, amount: e.amount.plainString, currency: e.currency, date: e.date,
                      categoryID: e.category?.id, countryCode: e.countryCode, paymentMethod: e.paymentMethodRaw,
                      cardID: e.card?.id, merchant: e.merchant, note: e.note,
                      exchangeRate: e.exchangeRate.plainString, rateDate: e.rateDate, rateSource: e.rateSourceRaw,
                      rateDetail: e.rateDetail, amountTWD: e.amountTWD.plainString,
                      includesFee: e.includesFee, feeRate: e.feeRate.plainString, feeTWD: e.feeTWD.plainString,
                      isFeeManual: e.isFeeManual, receiptFileName: e.receiptFileName,
                      createdAt: e.createdAt, updatedAt: e.updatedAt)
            },
            receipts: receipts
        )
        return try encoder().encode(file)
    }

    // MARK: 匯入（以備份內容完整取代目前資料）

    static func decode(_ data: Data) throws -> BackupFile {
        guard let file = try? decoder().decode(BackupFile.self, from: data),
              file.app == BackupFile.appIdentifier else { throw BackupError.invalidFile }
        guard file.formatVersion <= BackupFile.currentVersion else {
            throw BackupError.unsupportedVersion(file.formatVersion)
        }
        return file
    }

    static func restore(_ file: BackupFile, context: ModelContext) throws {
        func dec(_ s: String) -> Decimal { Decimal(string: s) ?? 0 }

        // 1. 清除現有資料
        try context.fetch(FetchDescriptor<LedgerEntry>()).forEach { context.delete($0) }
        try context.fetch(FetchDescriptor<BudgetPlan>()).forEach { context.delete($0) }
        try context.fetch(FetchDescriptor<BudgetAlertRecord>()).forEach { context.delete($0) }
        try context.fetch(FetchDescriptor<LedgerCategory>()).forEach { context.delete($0) }
        try context.fetch(FetchDescriptor<PaymentCard>()).forEach { context.delete($0) }
        try context.fetch(FetchDescriptor<AppSettings>()).forEach { context.delete($0) }
        try context.save()
        ReceiptStore.deleteAll()

        // 2. 設定
        let s = AppSettings()
        s.defaultFeeRate = dec(file.settings.defaultFeeRate)
        s.feeOnDebitCard = file.settings.feeOnDebitCard
        s.feeOnlyForeign = file.settings.feeOnlyForeign
        s.favoriteCurrencies = file.settings.favoriteCurrencies
        s.defaultCurrency = file.settings.defaultCurrency
        s.defaultCountry = file.settings.defaultCountry
        s.budgetStartDay = BudgetPeriod.clampDay(file.settings.budgetStartDay)
        s.budgetAlertsEnabled = file.settings.budgetAlertsEnabled
        s.warningPercent = file.settings.warningPercent
        context.insert(s)

        // 3. 分類、卡片
        var categoryMap: [UUID: LedgerCategory] = [:]
        for c in file.categories {
            let cat = LedgerCategory(id: c.id, name: c.name, icon: c.icon,
                                     kind: CategoryKind(rawValue: c.kind) ?? .expense, sortOrder: c.sortOrder)
            context.insert(cat)
            categoryMap[c.id] = cat
        }
        var cardMap: [UUID: PaymentCard] = [:]
        for c in file.cards {
            let card = PaymentCard(name: c.name, lastFour: c.lastFour, kind: CardKind(rawValue: c.kind) ?? .credit,
                                   customFeeRate: c.customFeeRate.flatMap { Decimal(string: $0) }, sortOrder: c.sortOrder)
            card.id = c.id
            card.createdAt = c.createdAt
            context.insert(card)
            cardMap[c.id] = card
        }

        // 4. 預算與提醒狀態
        for b in file.budgets {
            let category = b.categoryID.flatMap { categoryMap[$0] }
            if !b.isTotal && category == nil { continue }
            let plan = BudgetPlan(isTotal: b.isTotal, category: nil, amount: dec(b.amount))
            context.insert(plan)
            plan.category = category
        }
        for a in file.alertRecords {
            context.insert(BudgetAlertRecord(periodKey: a.periodKey, budgetKey: a.budgetKey, threshold: a.threshold, sentAt: a.sentAt))
        }

        // 5. 收據照片
        for r in file.receipts {
            try? ReceiptStore.write(r.data, fileName: r.fileName)
        }

        // 6. 交易
        for d in file.entries {
            let e = LedgerEntry()
            context.insert(e)
            e.id = d.id
            e.typeRaw = d.type
            e.amount = dec(d.amount)
            e.currency = d.currency
            e.date = d.date
            e.category = d.categoryID.flatMap { categoryMap[$0] }
            e.countryCode = d.countryCode
            e.paymentMethodRaw = d.paymentMethod
            e.card = d.cardID.flatMap { cardMap[$0] }
            e.merchant = d.merchant
            e.note = d.note
            e.exchangeRate = dec(d.exchangeRate)
            e.rateDate = d.rateDate
            e.rateSourceRaw = d.rateSource
            e.rateDetail = d.rateDetail
            e.amountTWD = dec(d.amountTWD)
            e.includesFee = d.includesFee
            e.feeRate = dec(d.feeRate)
            e.feeTWD = dec(d.feeTWD)
            e.isFeeManual = d.isFeeManual
            e.receiptFileName = d.receiptFileName.map { ($0 as NSString).lastPathComponent }
            e.createdAt = d.createdAt
            e.updatedAt = d.updatedAt
        }
        try context.save()
    }
}

/// 給 fileExporter 使用的文件
struct BackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data

    init(data: Data) { self.data = data }

    init(configuration: ReadConfiguration) throws {
        guard let d = configuration.file.regularFileContents else { throw BackupError.invalidFile }
        data = d
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
