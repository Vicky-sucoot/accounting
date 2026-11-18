import SwiftUI
import PhotosUI
import SwiftData

// MARK: - 交易列

struct EntryRow: View {
    let entry: LedgerEntry

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: entry.categoryIcon)
                .font(.title3)
                .foregroundStyle(iconColor)
                .frame(width: 36, height: 36)
                .background(iconColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(entry.displayTitle).font(.body).lineLimit(1)
                    if entry.receiptFileName != nil {
                        Image(systemName: "paperclip").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                Text(primaryAmount)
                    .font(.body.monospacedDigit().weight(.semibold))
                    .foregroundStyle(amountColor)
                if entry.isForeign || entry.feeTWD != 0 {
                    Text(secondaryAmount)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private var subtitle: String {
        var parts: [String] = []
        if entry.type != .cardPayment {
            parts.append(RegionCatalog.flag(entry.countryCode))
            parts.append(entry.card?.name ?? entry.paymentMethod.title)
        }
        if entry.type == .refund { parts.append("退款") }
        if entry.rateSource == .manual && entry.isForeign { parts.append("手動匯率") }
        return parts.joined(separator: " · ")
    }

    private var sign: String {
        switch entry.type {
        case .expense: return "-"
        case .income, .refund: return "+"
        case .cardPayment: return ""
        }
    }

    private var primaryAmount: String { sign + Fmt.money(entry.amount, entry.currency) }

    private var secondaryAmount: String {
        var s = entry.isForeign ? "≈ \(Fmt.twd(entry.amountTWD))" : ""
        if entry.feeTWD != 0 { s += (s.isEmpty ? "" : " ") + "＋費 \(Fmt.twd(entry.feeTWD))" }
        return s
    }

    private var amountColor: Color {
        switch entry.type {
        case .expense: return .primary
        case .income, .refund: return .green
        case .cardPayment: return .secondary
        }
    }

    private var iconColor: Color {
        switch entry.type {
        case .expense: return .orange
        case .income: return .green
        case .refund: return .teal
        case .cardPayment: return .indigo
        }
    }
}

// MARK: - 摘要卡

struct StatTile: View {
    let title: String
    let value: String
    var tint: Color = .primary
    var footnote: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value)
                .font(.headline.monospacedDigit())
                .foregroundStyle(tint)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            if let footnote {
                Text(footnote).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

/// 各幣別原始金額（不跨幣別加總）
struct CurrencyBreakdownView: View {
    let items: [CurrencyBreakdown]

    var body: some View {
        if items.isEmpty {
            Text("尚無資料").foregroundStyle(.secondary)
        } else {
            ForEach(items) { c in
                HStack {
                    Text(c.currency).font(.subheadline.bold()).frame(width: 48, alignment: .leading)
                    Text(CurrencyCatalog.name(c.currency)).font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        if c.expense != 0 || c.refund != 0 {
                            Text("支出 \(Fmt.money(c.netExpense, c.currency))").font(.subheadline.monospacedDigit())
                        }
                        if c.income != 0 {
                            Text("收入 \(Fmt.money(c.income, c.currency))").font(.caption.monospacedDigit()).foregroundStyle(.green)
                        }
                    }
                }
            }
        }
    }
}

// MARK: - 預算進度條

struct BudgetProgressRow: View {
    let usage: BudgetUsage
    var warningPercent: Int = 80

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Label(usage.name, systemImage: usage.icon).font(usage.isTotal ? .headline : .subheadline)
                Spacer()
                Text("\(usage.percent)%").font(.subheadline.monospacedDigit().bold()).foregroundStyle(color)
            }
            ProgressView(value: min(usage.ratio, 1))
                .tint(color)
            HStack {
                Text("已用 \(Fmt.twd(usage.spent))")
                Spacer()
                if usage.remaining >= 0 {
                    Text("剩餘 \(Fmt.twd(usage.remaining))")
                } else {
                    Text("超支 \(Fmt.twd(-usage.remaining))").foregroundStyle(.red)
                }
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
            Text("預算 \(Fmt.twd(usage.budget))").font(.caption2).foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }

    private var color: Color {
        if usage.percent >= 100 { return .red }
        if usage.percent >= warningPercent { return .orange }
        return .accentColor
    }
}

// MARK: - 收據

struct ReceiptEditor: View {
    @Binding var newImage: UIImage?
    @Binding var existingFileName: String?
    @State private var photoItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var showViewer = false

    private var currentImage: UIImage? {
        newImage ?? existingFileName.flatMap(ReceiptStore.loadImage)
    }

    var body: some View {
        Section("收據照片（選填）") {
            if let img = currentImage {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 220)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .onTapGesture { showViewer = true }
                Button("移除收據", role: .destructive) {
                    newImage = nil
                    existingFileName = nil
                    photoItem = nil
                }
            }
            HStack {
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button { showCamera = true } label: {
                        Label(currentImage == nil ? "拍攝收據" : "重新拍攝", systemImage: "camera")
                    }
                    .buttonStyle(.borderless)
                    Spacer()
                }
                PhotosPicker(selection: $photoItem, matching: .images) {
                    Label(currentImage == nil ? "從相簿選取" : "更換照片", systemImage: "photo.on.rectangle")
                }
                .buttonStyle(.borderless)
            }
        }
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) {
                    newImage = img
                }
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker(image: $newImage).ignoresSafeArea()
        }
        .fullScreenCover(isPresented: $showViewer) {
            if let img = currentImage { ReceiptViewer(image: img) }
        }
    }
}

struct ReceiptViewer: View {
    let image: UIImage
    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1

    var body: some View {
        NavigationStack {
            ScrollView([.horizontal, .vertical]) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(width: UIScreen.main.bounds.width * scale)
            }
            .gesture(MagnificationGesture().onChanged { scale = min(max($0, 1), 5) })
            .background(Color.black)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("關閉") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: Image(uiImage: image), preview: SharePreview("收據", image: Image(uiImage: image)))
                }
            }
        }
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    @Binding var image: UIImage?
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            parent.image = info[.originalImage] as? UIImage
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

// MARK: - 選擇器

struct CurrencyPickerView: View {
    @Binding var selection: String
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    var favorites: [String] = []

    private var filtered: [String] {
        let all = CurrencyCatalog.allCodes
        guard !search.isEmpty else { return all }
        return all.filter { $0.localizedCaseInsensitiveContains(search) || CurrencyCatalog.name($0).contains(search) }
    }

    var body: some View {
        List {
            if search.isEmpty && !favorites.isEmpty {
                Section("常用幣別") { ForEach(favorites, id: \.self, content: row) }
            }
            Section("所有幣別") { ForEach(filtered, id: \.self, content: row) }
        }
        .searchable(text: $search, prompt: "搜尋幣別代碼或名稱")
        .navigationTitle("選擇幣別")
    }

    private func row(_ code: String) -> some View {
        Button {
            selection = code
            dismiss()
        } label: {
            HStack {
                Text(code).bold().frame(width: 52, alignment: .leading)
                Text(CurrencyCatalog.name(code)).foregroundStyle(.secondary)
                Spacer()
                if code == selection { Image(systemName: "checkmark").foregroundStyle(.tint) }
            }
        }
        .foregroundStyle(.primary)
    }
}

struct RegionPickerView: View {
    @Binding var selection: String
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""

    private var filtered: [String] {
        let all = RegionCatalog.all
        guard !search.isEmpty else { return all }
        return all.filter { RegionCatalog.name($0).contains(search) || $0.localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        List {
            if search.isEmpty {
                Section("常用") { ForEach(RegionCatalog.common, id: \.self, content: row) }
            }
            Section("全部國家／地區") { ForEach(filtered, id: \.self, content: row) }
        }
        .searchable(text: $search, prompt: "搜尋國家／地區")
        .navigationTitle("國家／地區")
    }

    private func row(_ code: String) -> some View {
        Button {
            selection = code
            dismiss()
        } label: {
            HStack {
                Text(RegionCatalog.label(code))
                Spacer()
                if code == selection { Image(systemName: "checkmark").foregroundStyle(.tint) }
            }
        }
        .foregroundStyle(.primary)
    }
}

/// 金額輸入框（數字鍵盤）
struct AmountField: View {
    let title: String
    @Binding var text: String
    var prefix: String = "NT$"

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text(prefix).foregroundStyle(.secondary)
            TextField("0", text: $text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 140)
        }
    }
}
