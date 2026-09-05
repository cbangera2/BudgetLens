import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  // Shared with the Tauri desktop shell (src-tauri/tauri.conf.json).
  // Same bundle id across platforms enables shared Keychain access.
  appId: "com.cbangera2.budgetlens",
  appName: "BudgetLens",
  webDir: "dist",
  server: {
    // Pinned: the WebView origin is capacitor://localhost. Changing any of
    // these orphans all IndexedDB storage, exactly like changing a web
    // origin would (see docs/ios/capacitor-plan.md Spike 3). Frozen after
    // the first TestFlight; changing them wipes user data.
    hostname: "localhost",
    iosScheme: "capacitor",
  },
}

export default config
