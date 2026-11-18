import Foundation
import LocalAuthentication
import CryptoKit
import Security

enum LockMode: String, CaseIterable, Identifiable {
    case off, passcode, biometric
    var id: String { rawValue }
}

/// App 鎖定：Face ID（以 App 密碼作為備援）或 6 位數 App 密碼。
/// 密碼只以「加鹽 SHA-256 雜湊」存於鑰匙圈（僅限本機、不隨備份轉移）。
@MainActor
final class LockManager: ObservableObject {
    static let passcodeLength = 6

    @Published private(set) var mode: LockMode
    @Published var isLocked: Bool

    private let modeKey = "appLock.mode"
    private let hashAccount = "passcode.hash"
    private let saltAccount = "passcode.salt"

    init() {
        let stored = LockMode(rawValue: UserDefaults.standard.string(forKey: modeKey) ?? "") ?? .off
        mode = stored
        isLocked = stored != .off
    }

    // MARK: 生物辨識

    var canUseBiometrics: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
    }

    var biometryName: String {
        let ctx = LAContext()
        _ = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch ctx.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        default: return "Face ID"
        }
    }

    func title(for mode: LockMode) -> String {
        switch mode {
        case .off: return "不鎖定"
        case .passcode: return "App 密碼"
        case .biometric: return "\(biometryName)（以 App 密碼備援）"
        }
    }

    @discardableResult
    func authenticateWithBiometrics(reason: String = "解鎖記帳資料") async -> Bool {
        let ctx = LAContext()
        ctx.localizedFallbackTitle = "輸入 App 密碼"
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else { return false }
        do {
            return try await ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason)
        } catch {
            return false
        }
    }

    func unlockWithBiometrics() async {
        if await authenticateWithBiometrics() { isLocked = false }
    }

    // MARK: 密碼

    var hasPasscode: Bool { KeychainStore.get(hashAccount) != nil }

    func verify(_ code: String) -> Bool {
        guard let stored = KeychainStore.get(hashAccount), let salt = KeychainStore.get(saltAccount) else { return false }
        return Self.hash(code, salt: salt) == stored
    }

    func unlock(with code: String) -> Bool {
        guard verify(code) else { return false }
        isLocked = false
        return true
    }

    func setPasscode(_ code: String) {
        var bytes = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let salt = Data(bytes)
        KeychainStore.set(salt, for: saltAccount)
        KeychainStore.set(Self.hash(code, salt: salt), for: hashAccount)
    }

    // MARK: 模式

    func setMode(_ newMode: LockMode) {
        mode = newMode
        UserDefaults.standard.set(newMode.rawValue, forKey: modeKey)
        if newMode == .off {
            KeychainStore.delete(hashAccount)
            KeychainStore.delete(saltAccount)
            isLocked = false
        }
    }

    /// App 進入背景時上鎖
    func lockIfEnabled() {
        if mode != .off { isLocked = true }
    }

    private static func hash(_ code: String, salt: Data) -> Data {
        Data(SHA256.hash(data: salt + Data(code.utf8)))
    }
}

enum KeychainStore {
    private static let service = "PocketLedger.AppLock"

    static func set(_ data: Data, for account: String) {
        delete(account)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    static func get(_ account: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else { return nil }
        return item as? Data
    }

    static func delete(_ account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
