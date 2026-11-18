import SwiftUI

struct LockSettingsView: View {
    @EnvironmentObject private var lock: LockManager

    private enum Flow: Identifiable {
        case setup(target: LockMode)        // 設定新密碼後啟用 target 模式
        case verify(then: Action)           // 驗證目前密碼後執行
        case change                         // 變更密碼
        var id: String {
            switch self {
            case .setup(let m): return "setup-\(m.rawValue)"
            case .verify(let a): return "verify-\(a.id)"
            case .change: return "change"
            }
        }
    }

    private enum Action {
        case switchTo(LockMode)
        var id: String { if case .switchTo(let m) = self { return m.rawValue }; return "" }
    }

    @State private var flow: Flow?

    var body: some View {
        Form {
            Section {
                ForEach(LockMode.allCases) { mode in
                    Button { select(mode) } label: {
                        HStack {
                            Text(lock.title(for: mode)).foregroundStyle(isDisabled(mode) ? .secondary : .primary)
                            Spacer()
                            if lock.mode == mode { Image(systemName: "checkmark").foregroundStyle(.tint) }
                        }
                    }
                    .disabled(isDisabled(mode))
                }
            } header: {
                Text("鎖定方式")
            } footer: {
                if !lock.canUseBiometrics {
                    Text("此裝置目前無法使用 \(lock.biometryName)（未支援、未設定或已停用），請改用 App 密碼。")
                } else {
                    Text("啟用 \(lock.biometryName) 時需同時設定 6 位數 App 密碼，作為辨識失敗時的備援。App 進入背景後會自動上鎖。")
                }
            }

            if lock.mode != .off {
                Section {
                    Button("變更 App 密碼") { flow = .change }
                } footer: {
                    Text("App 密碼只存在這支 iPhone 的鑰匙圈中，不會包含在備份檔。忘記密碼且無法使用 \(lock.biometryName) 時，只能刪除 App 重裝（本機資料會一併刪除），請務必定期備份。")
                }
            }
        }
        .navigationTitle("App 鎖定")
        .sheet(item: $flow) { f in
            switch f {
            case .setup(let target):
                PasscodeSetupView(requireCurrent: false) { code in
                    lock.setPasscode(code)
                    lock.setMode(target)
                }
            case .change:
                PasscodeSetupView(requireCurrent: true) { code in
                    lock.setPasscode(code)
                }
            case .verify(let action):
                PasscodeVerifyView {
                    if case .switchTo(let m) = action { lock.setMode(m) }
                }
            }
        }
    }

    private func isDisabled(_ mode: LockMode) -> Bool {
        mode == .biometric && !lock.canUseBiometrics
    }

    private func select(_ mode: LockMode) {
        guard mode != lock.mode else { return }
        switch (lock.mode, mode) {
        case (.off, _):
            flow = .setup(target: mode)                 // 首次啟用：設定密碼
        case (_, .off):
            flow = .verify(then: .switchTo(.off))       // 關閉鎖定需驗證
        default:
            if lock.hasPasscode {
                flow = .verify(then: .switchTo(mode))   // 在密碼／Face ID 之間切換
            } else {
                flow = .setup(target: mode)
            }
        }
    }
}

/// 輸入新密碼兩次（必要時先驗證目前密碼）
struct PasscodeSetupView: View {
    let requireCurrent: Bool
    let onFinish: (String) -> Void
    @EnvironmentObject private var lock: LockManager
    @Environment(\.dismiss) private var dismiss

    private enum Step { case current, new, confirm }
    @State private var step: Step = .new
    @State private var firstCode = ""

    var body: some View {
        NavigationStack {
            VStack {
                Spacer(minLength: 20)
                switch step {
                case .current:
                    PasscodePad(title: "輸入目前的 App 密碼") { code in
                        guard lock.verify(code) else { return false }
                        step = .new
                        return true
                    }
                case .new:
                    PasscodePad(title: "設定 6 位數 App 密碼") { code in
                        firstCode = code
                        step = .confirm
                        return true
                    }
                    .id("new")
                case .confirm:
                    PasscodePad(title: "再次輸入以確認", errorMessage: "兩次輸入不一致，請重新設定") { code in
                        guard code == firstCode else {
                            step = .new
                            return false
                        }
                        onFinish(code)
                        dismiss()
                        return true
                    }
                    .id("confirm")
                }
                Spacer()
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } } }
            .onAppear { step = requireCurrent ? .current : .new }
        }
    }
}

/// 驗證目前身分（Face ID 或 App 密碼）
struct PasscodeVerifyView: View {
    let onSuccess: () -> Void
    @EnvironmentObject private var lock: LockManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Spacer(minLength: 20)
                PasscodePad(title: "輸入目前的 App 密碼") { code in
                    guard lock.verify(code) else { return false }
                    finish()
                    return true
                }
                if lock.mode == .biometric && lock.canUseBiometrics {
                    Button("使用 \(lock.biometryName) 驗證") {
                        Task { if await lock.authenticateWithBiometrics(reason: "驗證身分以變更鎖定設定") { finish() } }
                    }
                    .buttonStyle(.bordered)
                }
                Spacer()
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } } }
        }
    }

    private func finish() {
        onSuccess()
        dismiss()
    }
}
