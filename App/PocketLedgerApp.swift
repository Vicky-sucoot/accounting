import SwiftUI
import SwiftData

@main
@MainActor
struct PocketLedgerApp: App {
    let container: ModelContainer
    @StateObject private var lock = LockManager()

    init() {
        do {
            // SwiftData 資料庫存於 App 沙盒的 Application Support（僅本機，不啟用 CloudKit）
            let config = ModelConfiguration(isStoredInMemoryOnly: false, cloudKitDatabase: .none)
            container = try ModelContainer(for: Schema(AppSchema.models), configurations: config)
        } catch {
            fatalError("無法開啟本機資料庫：\(error)")
        }
        NotificationService.shared.configure()
        SeedData.seedIfNeeded(container.mainContext)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(lock)
                .environment(\.locale, Locale(identifier: "zh-Hant-TW"))
        }
        .modelContainer(container)
    }
}

struct RootView: View {
    @EnvironmentObject private var lock: LockManager
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.modelContext) private var context

    var body: some View {
        ZStack {
            MainTabView()
            if lock.isLocked {
                LockScreenView()
                    .transition(.opacity)
                    .zIndex(2)
            } else if scenePhase != .active && lock.mode != .off {
                PrivacyCover().zIndex(1)   // 多工切換畫面不顯示帳目
            }
        }
        .animation(.easeInOut(duration: 0.2), value: lock.isLocked)
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background: lock.lockIfEnabled()
            case .active: BudgetMonitor.evaluate(context: context)
            default: break
            }
        }
        .task {
            await NotificationService.shared.requestAuthorization()
            BudgetMonitor.evaluate(context: context)
        }
    }
}

struct PrivacyCover: View {
    var body: some View {
        ZStack {
            Rectangle().fill(.regularMaterial).ignoresSafeArea()
            Image(systemName: "lock.fill").font(.largeTitle).foregroundStyle(.secondary)
        }
    }
}

enum AppTab: Hashable { case home, list, reports, budget, settings }

struct MainTabView: View {
    @State private var tab: AppTab = .home

    var body: some View {
        TabView(selection: $tab) {
            HomeView(selectedTab: $tab)
                .tabItem { Label("總覽", systemImage: "house.fill") }.tag(AppTab.home)
            TransactionListView()
                .tabItem { Label("紀錄", systemImage: "list.bullet.rectangle") }.tag(AppTab.list)
            ReportsView()
                .tabItem { Label("報表", systemImage: "chart.pie.fill") }.tag(AppTab.reports)
            BudgetView()
                .tabItem { Label("預算", systemImage: "target") }.tag(AppTab.budget)
            SettingsView()
                .tabItem { Label("設定", systemImage: "gearshape.fill") }.tag(AppTab.settings)
        }
    }
}
