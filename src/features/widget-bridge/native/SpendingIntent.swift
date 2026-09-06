import AppIntents
import Foundation

// Siri / Apple Intelligence entry point: "How much did I spend on X?"
//
// Answers from the latest widget snapshot (see WidgetSnapshot.swift), so this
// intent works offline and never touches finance tables directly. The snapshot
// carries 3-month category totals plus the current-period budget spend, and
// the reply names its window explicitly so Siri never over-claims precision.
// Device-validation pass (deferred): spoken-dialog wording on device, category
// synonym handling ("food" -> "Dining"), and multi-month disambiguation.
//
// App Group id: __APP_GROUP_ID__ (stamped by scripts/ios-patcher.mjs).

struct SpendingQueryIntent: AppIntent {
  static var title: LocalizedStringResource = "How much did I spend?"
  static var description = IntentDescription(
    "Answer spending questions from the latest BudgetLens snapshot."
  )
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Category", description: "Spending category, e.g. Groceries.")
  var category: String

  @Parameter(
    title: "Month",
    description: "Budget month as YYYY-MM. Defaults to the snapshot month."
  )
  var month: String?

  static var parameterSummary: some ParameterSummary {
    Summary("How much did I spend on \(\.$category)?")
  }

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard let snapshot = WidgetSnapshotStore.load() else {
      return .result(dialog: "I couldn't find your BudgetLens snapshot. Open the app once to refresh it.")
    }
    if let month, month != snapshot.month.month {
      return .result(
        dialog: "I only have BudgetLens data for \(snapshot.month.month). Open the app to refresh for \(month)."
      )
    }
    let wanted = category.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if let slice = snapshot.topCategories.first(where: { $0.category.lowercased() == wanted }) {
      return .result(
        dialog: "You spent \(slice.total) on \(slice.category) in the last 3 months across \(slice.count) transactions."
      )
    }
    if let budget = snapshot.budgets.first(where: { $0.category.lowercased() == wanted }) {
      return .result(
        dialog: "You spent \(budget.spent) of your \(budget.goal) \(budget.category) budget for \(snapshot.month.month)."
      )
    }
    let known = snapshot.topCategories.map(\.category).prefix(5).joined(separator: ", ")
    return .result(
      dialog: "I don't see a \(category) category in your recent snapshot. Recent categories include \(known)."
    )
  }
}
