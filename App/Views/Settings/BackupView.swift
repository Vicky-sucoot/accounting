import SwiftUI
import SwiftData
import UniformTypeIdentifiers

struct BackupView: View {
    @Environment(\.modelContext) private var context
    @Query private var entries: [LedgerEntry]

    @State private var exportDoc: BackupDocument?
    @State private var showExporter = false
    @State private var showImporter = false
    @State private var pendingImport: BackupFile?
    @State private var message: String?
    @State private var isWorking = false

    var body: some View {
        Form {
            Section {
                LabeledContent("交易筆數", value: "\(entries.count)")
                LabeledContent("收據照片", value: "\(entries.filter { $0.receiptFileName != nil }.count) 張・\(ByteCountFormatter.string(fromByteCount: ReceiptStore.totalSize(), countStyle: .file))")
            } header: {
                Text("目前資料")
            }

            Section {
                Button {
                    export()
                } label: {
                    Label("匯出備份檔", systemImage: "square.and.arrow.up")
                }
                .disabled(isWorking)
                Button {
                    showImporter = true
                } label: {
                    Label("從備份檔還原", systemImage: "square.and.arrow.down")
                }
                .disabled(isWorking)
                if isWorking { ProgressView() }
            } footer: {
                Text("還原會以備份內容「完整取代」目前所有資料（交易、分類、卡片、預算、設定與收據照片）。")
            }

            Section("說明") {
                info("檔案格式", "單一 JSON 檔（例如「記帳備份_2026-11-18.json」）。包含記帳紀錄、分類、卡片、預算、提醒狀態、設定，以及以 Base64 內嵌的收據照片。金額以文字保存，確保精確。")
                info("儲存位置", "匯出時由你選擇位置：「檔案」App 的「我的 iPhone」、iCloud 雲碟、Google Drive 等，或之後用 AirDrop 傳到電腦。App 本身不會上傳任何資料。")
                info("加密", "備份檔未加密，內容可被任何人讀取（包括收據照片）。請存放在你信任的位置，不要公開分享。")
                info("App 鎖定", "Face ID／App 密碼設定不包含在備份檔；在新手機還原後請重新設定。")
                info("更換手機", "使用 iCloud 或電腦（Finder）整機備份移轉時，App 資料通常會一起轉移；若不確定，請先匯出備份檔，在新手機安裝 App 後選擇「從備份檔還原」。")
                info("刪除 App", "刪除 App 會同時刪除手機上所有記帳資料與收據照片，且無法復原。刪除前務必先匯出備份檔。")
            }
        }
        .navigationTitle("備份與還原")
        .fileExporter(isPresented: $showExporter, document: exportDoc, contentType: .json,
                      defaultFilename: BackupService.defaultFileName()) { result in
            switch result {
            case .success: message = "備份檔已儲存。"
            case .failure(let error): message = "匯出失敗：\(error.localizedDescription)"
            }
            exportDoc = nil
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { result in
            handleImport(result)
        }
        .alert("確定要還原？", isPresented: Binding(get: { pendingImport != nil }, set: { if !$0 { pendingImport = nil } }),
               presenting: pendingImport) { file in
            Button("取消", role: .cancel) { pendingImport = nil }
            Button("取代目前資料", role: .destructive) { restore(file) }
        } message: { file in
            Text("備份時間：\(Fmt.date(file.exportedAt))\n交易 \(file.entries.count) 筆、收據 \(file.receipts.count) 張。\n目前手機上的資料將被完全取代。")
        }
        .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("好") { message = nil }
        }
    }

    private func info(_ title: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.subheadline.bold())
            Text(body).font(.footnote).foregroundStyle(.secondary)
        }
    }

    private func export() {
        isWorking = true
        defer { isWorking = false }
        do {
            exportDoc = BackupDocument(data: try BackupService.makeBackup(context: context))
            showExporter = true
        } catch {
            message = "建立備份失敗：\(error.localizedDescription)"
        }
    }

    private func handleImport(_ result: Result<URL, Error>) {
        switch result {
        case .failure(let error):
            message = "無法開啟檔案：\(error.localizedDescription)"
        case .success(let url):
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            do {
                let data = try Data(contentsOf: url)
                pendingImport = try BackupService.decode(data)
            } catch {
                message = error.localizedDescription
            }
        }
    }

    private func restore(_ file: BackupFile) {
        isWorking = true
        defer { isWorking = false }
        do {
            try BackupService.restore(file, context: context)
            pendingImport = nil
            message = "還原完成：共 \(file.entries.count) 筆交易。"
        } catch {
            message = "還原失敗：\(error.localizedDescription)"
        }
    }
}
