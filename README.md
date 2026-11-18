# 多幣記帳 PocketLedger（iPhone）

個人用多幣別記帳 App：新台幣與外幣收支、交易日匯率自動換算、刷卡手續費、每月預算提醒、收據照片、Face ID／密碼鎖，資料只存在 iPhone 本機。

- 產品規劃、介面設計、資料欄位與計算邏輯：[`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md)（網頁版：https://vicky-sucoot.github.io/accounting/）

## 版本說明：以網頁版為主

| 版本 | 位置 | 狀態 |
|------|------|------|
| **網頁版（PWA）** | `docs/app/` | **主要版本**，持續維護；新功能只加在這裡 |
| iOS 原生版 | `App/`、`Tests/`、`project.yml` | **暫停維護**；保留程式碼，尚未在 Xcode 編譯驗證，需要 Mac 才能安裝 |

原因：網頁版不需要 Mac 即可安裝到 iPhone、可離線使用，且只維護一套程式比較不容易出錯。兩個版本的備份檔格式相同，日後若改用原生版，可以直接匯入網頁版的備份。

網頁版新增、原生版沒有的功能：首頁備份提醒、返回手勢、再記一筆、旅程標籤、商家名稱建議（1.1）；信用卡結帳日／繳款日與繳款提醒、月趨勢圖、CSV 匯出（1.2）；外幣現金錢包與換匯、依帳單對帳、代墊／分帳、旅程預算（1.3）；交易紀錄月曆檢視（1.4）；新圖示與 App 圖示、頁面滑入動畫、金額千分位、精簡表單、左滑刪除、首頁近 7 天圖（1.5）；刪除可復原（1.6）。這些資料都會寫進備份檔，但原生版還原時會略過這些欄位；原生版也不認得「換匯」類型，請勿把 1.3 的備份還原到原生版。

## 網頁版（PWA，可離線、不需要 Mac）

`docs/app/` 透過 GitHub Pages 發佈：**https://vicky-sucoot.github.io/accounting/app/**

技術：純 HTML／CSS／JavaScript，沒有第三方套件；資料存在 IndexedDB，Service Worker 提供離線快取。

1. 用 iPhone 的 Safari 開啟上面網址
2. 點「分享」→「加入主畫面」
3. 之後從主畫面圖示開啟，就像 App 一樣，沒有網路也能使用（查匯率除外）

與 iOS 原生版的差異：
- 資料存在瀏覽器本機資料庫（IndexedDB）；請從主畫面圖示使用，並定期匯出備份。
- 匯率只使用 Currency API（臺灣銀行網站不允許其他網頁讀取），查不到或離線時手動輸入。
- Face ID 透過瀏覽器的通行金鑰（WebAuthn）驗證；預算通知需先加入主畫面（iOS 16.4+），且只在開啟 App 時檢查。
- 備份檔格式與原生版相同，可以互相還原。

## 自動測試

`docs/app/tests/` 有兩組測試，每次推送到 GitHub 時會由 GitHub Actions（`.github/workflows/test.yml`）自動執行：

- `logic.test.js`：計算邏輯（手續費、匯率換算、預算、帳單週期、外幣錢包、代墊、CSV）
- `e2e.test.js`：用模擬的 iPhone 瀏覽器實際操作 App（日期固定為 2026-11-18，匯率 API 用假資料，不需要網路）

在自己的電腦執行（需要 Node.js 22 以上）：

```bash
npm ci
```

```bash
npx playwright install chromium
```

```bash
npm test
```

只跑計算邏輯（不需要安裝任何東西）：

```bash
npm run test:unit
```

本機預覽：

```bash
cd docs && python3 -m http.server 8000
```

然後用瀏覽器開啟 http://localhost:8000/app/

## iOS 原生版（暫停維護）

技術：Swift 5、SwiftUI、SwiftData、Swift Charts、LocalAuthentication、UserNotifications，沒有第三方套件。

### 環境需求

- macOS + **Xcode 16 以上**（iOS 17 SDK 以上）
- [XcodeGen](https://github.com/yonaskolb/XcodeGen)（用 `project.yml` 產生 Xcode 專案）
- iPhone（iOS 17+）或 iOS 模擬器

### 啟動方式

1. 安裝 XcodeGen：

```bash
brew install xcodegen
```

2. 在專案根目錄產生 Xcode 專案：

```bash
xcodegen generate
```

3. 開啟專案：

```bash
open PocketLedger.xcodeproj
```

4. 在 Xcode 選擇 `PocketLedger` scheme 與模擬器（例如 iPhone 16），按 ⌘R 執行。
5. 安裝到自己的 iPhone：Xcode → 專案 → Target `PocketLedger` → *Signing & Capabilities* → Team 選你的 Apple ID（免費帳號即可，App 每 7 天需重新安裝；付費開發者帳號為 1 年），並把 Bundle Identifier 改成唯一值（例如 `com.你的名字.pocketledger`）。iPhone 需開啟「設定 → 隱私權與安全性 → 開發者模式」。
6. 執行單元測試：Xcode 按 ⌘U，或：

```bash
xcodebuild test -scheme PocketLedger -destination 'platform=iOS Simulator,name=iPhone 16'
```

> 模擬器沒有相機與 Face ID：拍照按鈕會自動隱藏；Face ID 可用 *Features → Face ID → Enrolled / Matching Face* 模擬。

### 檔案結構

```
.
├── project.yml                      # XcodeGen 專案設定（Info.plist 權限說明也在這裡）
├── docs/PRODUCT_PLAN.md             # 產品規劃與設計文件
├── App/
│   ├── PocketLedgerApp.swift        # App 進入點、鎖定畫面切換、分頁
│   ├── Assets.xcassets
│   ├── Core/                        # 純邏輯（可單元測試）
│   │   ├── Enums.swift              # 交易類型、付款方式、匯率來源…
│   │   ├── Formatting.swift         # Decimal、金額／日期格式、幣別與國家清單
│   │   ├── FeeCalculator.swift      # 匯率換算與手續費
│   │   ├── BudgetLogic.swift        # 預算週期、使用量、提醒門檻
│   │   ├── Statistics.swift         # 收支統計、各幣別統計、卡片帳務
│   │   └── RateParsers.swift        # 臺銀 CSV、Currency API JSON 解析
│   ├── Models/
│   │   ├── Models.swift             # SwiftData 模型
│   │   └── SeedData.swift           # 預設分類與設定
│   ├── Services/
│   │   ├── ExchangeRateService.swift
│   │   ├── ReceiptStore.swift       # 收據照片本機儲存
│   │   ├── NotificationService.swift
│   │   ├── BudgetMonitor.swift      # 預算評估與通知
│   │   ├── BackupService.swift      # JSON 備份匯出／還原
│   │   └── LockManager.swift        # Face ID／App 密碼、Keychain
│   └── Views/
│       ├── Home/HomeView.swift
│       ├── Transactions/            # 新增／編輯、列表與篩選、明細
│       ├── Reports/ReportsView.swift
│       ├── Budget/BudgetView.swift
│       ├── Settings/                # 幣別、分類、卡片、手續費、匯率說明、預算、鎖定、備份
│       ├── Lock/LockScreenView.swift
│       └── Components/Components.swift
└── Tests/CoreLogicTests.swift       # 手續費、匯率解析、預算週期與提醒、統計
```

### 重點設計摘要

- **匯率**：臺灣銀行牌告（歷史 CSV，支出取即期賣出、收入取即期買入）→ Currency API 備援 → 手動輸入。每筆交易存檔時保存匯率、日期與來源，之後不再變動。
- **手續費**：預設 3%（設定可改；卡片可個別設定），`round(新台幣金額 × 費率)`，可手動調整；現金不計。
- **信用卡**：刷卡記支出；「繳卡費」是轉帳，不計支出，卡片頁顯示估計未繳金額。
- **預算**：新台幣計算、含手續費、扣退款；80%／100% 本機通知，同一週期每門檻只通知一次。
- **備份**：設定 → 備份與還原，單一 JSON 檔（含收據照片），不加密；刪除 App 會刪除所有本機資料，請定期匯出。
