import SwiftUI
import SwiftData

struct TransactionDetailView: View {
    @Bindable var entry: LedgerEntry
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @State private var showEdit = false
    @State private var showDelete = false
    @State private var showReceipt = false

    var body: some View {
        List {
            Section {
                VStack(alignment: .center, spacing: 6) {
                    Label(entry.type.title, systemImage: entry.type.symbol)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(Fmt.money(entry.amount, entry.currency))
                        .font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit())
                    if entry.isForeign {
                        Text("≈ \(Fmt.twd(entry.amountTWD))").foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }

            Section("基本資料") {
                LabeledContent("日期", value: Fmt.date(entry.date))
                if entry.type != .cardPayment {
                    LabeledContent("分類") { Label(entry.categoryName, systemImage: entry.categoryIcon) }
                    LabeledContent("國家／地區", value: RegionCatalog.label(entry.countryCode))
                    LabeledContent("付款方式", value: entry.paymentMethod.title)
                }
                if let card = entry.card { LabeledContent("卡片", value: card.displayName) }
                if !entry.merchant.isEmpty { LabeledContent("商家", value: entry.merchant) }
                if !entry.note.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("備註").font(.caption).foregroundStyle(.secondary)
                        Text(entry.note)
                    }
                }
            }

            if entry.isForeign {
                Section {
                    LabeledContent("原始金額", value: Fmt.money(entry.amount, entry.currency))
                    LabeledContent("匯率", value: "1 \(entry.currency) = \(Fmt.rate(entry.exchangeRate)) TWD")
                    LabeledContent("換算新台幣", value: Fmt.twd(entry.amountTWD))
                    if let d = entry.rateDate { LabeledContent("匯率日期", value: Fmt.date(d)) }
                    LabeledContent("資料來源") {
                        HStack(spacing: 4) {
                            if entry.rateSource == .manual {
                                Image(systemName: "hand.raised.fill").foregroundStyle(.orange)
                            }
                            Text(entry.rateSource.title)
                        }
                    }
                    if !entry.rateDetail.isEmpty {
                        Text(entry.rateDetail).font(.caption).foregroundStyle(.secondary)
                    }
                } header: {
                    Text("匯率換算")
                } footer: {
                    Text("此匯率於記帳時保存，不會因日後匯率更新而改變。")
                }
            }

            if entry.includesFee || entry.feeTWD != 0 {
                Section {
                    LabeledContent("刷卡消費金額", value: Fmt.twd(entry.amountTWD))
                    LabeledContent("手續費", value: Fmt.twd(entry.feeTWD))
                    LabeledContent("含手續費總額", value: Fmt.twd(entry.totalTWD)).bold()
                    Text(feeExplanation).font(.caption).foregroundStyle(.secondary)
                } header: {
                    Text(entry.type == .refund ? "退回手續費" : "刷卡手續費")
                }
            }

            if let name = entry.receiptFileName, let img = ReceiptStore.loadImage(name) {
                Section("收據") {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 300)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .onTapGesture { showReceipt = true }
                    Text("點圖片可放大檢視").font(.caption).foregroundStyle(.secondary)
                }
                .fullScreenCover(isPresented: $showReceipt) { ReceiptViewer(image: img) }
            }

            Section {
                Button("刪除這筆交易", role: .destructive) { showDelete = true }
            }
        }
        .navigationTitle(entry.displayTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Button("編輯") { showEdit = true }
        }
        .sheet(isPresented: $showEdit) { TransactionFormView(entry: entry) }
        .confirmationDialog("確定要刪除這筆交易？", isPresented: $showDelete, titleVisibility: .visible) {
            Button("刪除", role: .destructive) {
                // 先返回上一頁再刪除，避免畫面讀取已刪除的物件
                let target = entry
                let receipt = entry.receiptFileName
                dismiss()
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 400_000_000)
                    if let receipt { ReceiptStore.delete(receipt) }
                    context.delete(target)
                    try? context.save()
                    BudgetMonitor.evaluate(context: context)
                }
            }
        }
    }

    private var feeExplanation: String {
        var lines: [String] = []
        if entry.isForeign {
            lines.append("換算：\(Fmt.money(entry.amount, entry.currency)) × \(Fmt.rate(entry.exchangeRate)) = \(Fmt.twd(entry.amountTWD))")
        }
        if entry.isFeeManual {
            lines.append("手續費：依實際帳單手動調整為 \(Fmt.twd(entry.feeTWD))")
        } else {
            lines.append("手續費：\(Fmt.twd(entry.amountTWD)) × \(Fmt.percent(entry.feeRate)) = \(Fmt.twd(entry.feeTWD))（四捨五入至整數元）")
        }
        return lines.joined(separator: "\n")
    }
}
