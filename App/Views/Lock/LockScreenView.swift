import SwiftUI

struct LockScreenView: View {
    @EnvironmentObject private var lock: LockManager
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            VStack(spacing: 24) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(.tint)
                    .padding(.top, 40)
                Text("多幣記帳已鎖定").font(.title3.bold())

                PasscodePad(title: "輸入 App 密碼") { code in
                    lock.unlock(with: code)
                }

                if lock.mode == .biometric && lock.canUseBiometrics {
                    Button {
                        Task { await lock.unlockWithBiometrics() }
                    } label: {
                        Label("使用 \(lock.biometryName) 解鎖", systemImage: "faceid")
                    }
                    .buttonStyle(.bordered)
                }
                Spacer()
            }
        }
        .onAppear { tryBiometricsIfActive() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { tryBiometricsIfActive() }
        }
    }

    private func tryBiometricsIfActive() {
        guard scenePhase == .active, lock.mode == .biometric, lock.canUseBiometrics else { return }
        Task { await lock.unlockWithBiometrics() }
    }
}

/// 6 位數密碼鍵盤；onComplete 回傳 false 代表錯誤，會清空並提示
struct PasscodePad: View {
    let title: String
    var errorMessage: String = "密碼錯誤，請再試一次"
    let onComplete: (String) -> Bool

    @State private var code = ""
    @State private var showError = false

    private let keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"]

    var body: some View {
        VStack(spacing: 20) {
            Text(title).font(.headline)
            HStack(spacing: 16) {
                ForEach(0..<LockManager.passcodeLength, id: \.self) { i in
                    Circle()
                        .strokeBorder(Color.primary, lineWidth: 1)
                        .background(Circle().fill(i < code.count ? Color.primary : .clear))
                        .frame(width: 14, height: 14)
                }
            }
            Text(showError ? errorMessage : " ")
                .font(.footnote)
                .foregroundStyle(.red)
            LazyVGrid(columns: Array(repeating: GridItem(.fixed(80), spacing: 20), count: 3), spacing: 16) {
                ForEach(keys, id: \.self) { key in
                    if key.isEmpty {
                        Color.clear.frame(width: 72, height: 72)
                    } else {
                        Button { tap(key) } label: {
                            Text(key)
                                .font(.title)
                                .frame(width: 72, height: 72)
                                .background(key == "⌫" ? Color.clear : Color(.secondarySystemBackground), in: Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(key == "⌫" ? "刪除" : key)
                    }
                }
            }
        }
    }

    private func tap(_ key: String) {
        if key == "⌫" {
            if !code.isEmpty { code.removeLast() }
            return
        }
        guard code.count < LockManager.passcodeLength else { return }
        showError = false
        code.append(key)
        if code.count == LockManager.passcodeLength {
            let entered = code
            if !onComplete(entered) {
                showError = true
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            }
            code = ""
        }
    }
}
