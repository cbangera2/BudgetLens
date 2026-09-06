import Foundation

// Shared snapshot reader for the BudgetLens widget + Siri intent.
//
// The web bridge (src/features/widget-bridge/) writes a SMALL versioned JSON
// payload into the shared App Group container; this file decodes it. Unknown
// or future schema versions decode to nil so the widget falls back to its
// placeholder UI instead of showing stale numbers.
//
// NOTE: __APP_GROUP_ID__ is stamped by scripts/ios-patcher.mjs at install
// time. Never hand-edit the substituted value inside ios/ (generated).

enum WidgetConfig {
  static let appGroupId = "__APP_GROUP_ID__"
  static let snapshotFilename = "budgetlens-widget-snapshot.json"
  static let supportedVersion = 1
}

struct WidgetNetWorthSummary: Codable {
  var date: String?
  var latestMinor: Int?
  var latest: String?
  var deltaMinor: Int?
  var delta: String?
}

struct WidgetMonthSummary: Codable {
  var month: String
  var spentMinor: Int
  var spent: String
  var budgetMinor: Int
  var budget: String
  var remainingMinor: Int
  var remaining: String
  var over: Bool
}

struct WidgetCategorySlice: Codable {
  var category: String
  var count: Int
  var totalMinor: Int
  var total: String
}

struct WidgetBudgetSlice: Codable {
  var category: String
  var period: String
  var spentMinor: Int
  var spent: String
  var goalMinor: Int
  var goal: String
  var remainingMinor: Int
  var remaining: String
  var over: Bool
}

struct WidgetSnapshot: Codable {
  var version: Int
  var generatedAt: String
  var transactionCount: Int
  var netWorth: WidgetNetWorthSummary
  var month: WidgetMonthSummary
  var topCategories: [WidgetCategorySlice]
  var budgets: [WidgetBudgetSlice]
}

enum WidgetSnapshotStore {
  /// Decode + version-gate raw bytes. Returns nil for unknown versions.
  static func decode(_ data: Data) -> WidgetSnapshot? {
    guard
      let raw = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      let version = raw["version"] as? Int,
      version == WidgetConfig.supportedVersion,
      let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    else { return nil }
    return snapshot
  }

  /// Load the latest snapshot from the shared App Group container.
  static func load(appGroupId: String = WidgetConfig.appGroupId) -> WidgetSnapshot? {
    guard
      let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: appGroupId
      )
    else { return nil }
    let url = container.appendingPathComponent(WidgetConfig.snapshotFilename)
    guard let data = try? Data(contentsOf: url) else { return nil }
    return decode(data)
  }
}
