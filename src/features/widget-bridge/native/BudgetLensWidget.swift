import SwiftUI
import WidgetKit

// BudgetLens WidgetKit widget. Reads the versioned snapshot written by the
// web bridge (see WidgetSnapshot.swift); shows a placeholder until the first
// successful refresh. Device-validation pass (deferred): timeline reload
// policy, Dynamic Type at largest sizes, and dark-mode contrast on device.
//
// App Group id: __APP_GROUP_ID__ (stamped by scripts/ios-patcher.mjs).

struct WidgetSnapshotEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
}

struct BudgetLensSnapshotProvider: TimelineProvider {
  func placeholder(in context: Context) -> WidgetSnapshotEntry {
    WidgetSnapshotEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (WidgetSnapshotEntry) -> Void) {
    completion(WidgetSnapshotEntry(date: Date(), snapshot: WidgetSnapshotStore.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<WidgetSnapshotEntry>) -> Void) {
    let entry = WidgetSnapshotEntry(date: Date(), snapshot: WidgetSnapshotStore.load())
    // Hourly cadence: a single now-dated entry with .atEnd can spin reloads,
    // while snapshot writes trigger WidgetCenter reloads for fresh data.
    let nextRefresh = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date(timeIntervalSinceNow: 3600)
    completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
  }
}

struct BudgetLensWidgetEntryView: View {
  var entry: WidgetSnapshotEntry

  var body: some View {
    if let snapshot = entry.snapshot {
      VStack(alignment: .leading, spacing: 6) {
        Text(snapshot.netWorth.latest ?? "--")
          .font(.headline)
          .accessibilityLabel("Net worth \(snapshot.netWorth.latest ?? "--")")
        Text(monthLine(for: snapshot))
          .font(.caption)
          .foregroundStyle(snapshot.month.over ? .red : .secondary)
        Divider()
        ForEach(snapshot.topCategories.prefix(3), id: \.category) { slice in
          HStack {
            Text(slice.category)
              .font(.caption)
              .lineLimit(1)
            Spacer()
            Text(slice.total)
              .font(.caption)
              .monospacedDigit()
          }
        }
        Spacer(minLength: 0)
      }
      .padding()
    } else {
      VStack(alignment: .leading, spacing: 6) {
        Text("BudgetLens")
          .font(.headline)
        Text("Open the app to refresh your snapshot.")
          .font(.caption)
          .foregroundStyle(.secondary)
        Spacer(minLength: 0)
      }
      .padding()
    }
  }

  private func monthLine(for snapshot: WidgetSnapshot) -> String {
    "\(snapshot.month.month): \(snapshot.month.spent) of \(snapshot.month.budget)"
  }
}

@main
struct BudgetLensWidget: Widget {
  let kind = "BudgetLensWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: BudgetLensSnapshotProvider()) { entry in
      BudgetLensWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("BudgetLens")
    .description("Net worth and month spend at a glance.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
