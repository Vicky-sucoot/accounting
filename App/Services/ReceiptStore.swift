import UIKit

/// 收據照片存放於 App 的 Application Support/Receipts（僅本機，啟用檔案保護）
enum ReceiptStore {
    static var directory: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Receipts", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    static func url(for fileName: String) -> URL {
        directory.appendingPathComponent((fileName as NSString).lastPathComponent)
    }

    /// 壓縮後儲存（長邊 2000px、JPEG 品質 0.75），回傳檔名
    static func save(_ image: UIImage) throws -> String {
        let resized = image.resized(maxDimension: 2000)
        guard let data = resized.jpegData(compressionQuality: 0.75) else {
            throw CocoaError(.fileWriteUnknown)
        }
        let name = UUID().uuidString + ".jpg"
        try write(data, fileName: name)
        return name
    }

    static func write(_ data: Data, fileName: String) throws {
        try data.write(to: url(for: fileName), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    static func loadData(_ fileName: String) -> Data? {
        try? Data(contentsOf: url(for: fileName))
    }

    static func loadImage(_ fileName: String) -> UIImage? {
        loadData(fileName).flatMap(UIImage.init(data:))
    }

    static func delete(_ fileName: String) {
        try? FileManager.default.removeItem(at: url(for: fileName))
    }

    static func deleteAll() {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        files.forEach { try? FileManager.default.removeItem(at: $0) }
    }

    /// 清除沒有任何交易引用的照片
    static func removeOrphans(keeping referenced: Set<String>) {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        for f in files where !referenced.contains(f.lastPathComponent) {
            try? FileManager.default.removeItem(at: f)
        }
    }

    static func totalSize() -> Int64 {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.fileSizeKey])) ?? []
        return files.reduce(0) { sum, url in
            sum + Int64((try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
    }
}

extension UIImage {
    func resized(maxDimension: CGFloat) -> UIImage {
        let longest = max(size.width, size.height)
        guard longest > maxDimension else { return self }
        let scale = maxDimension / longest
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
    }
}
