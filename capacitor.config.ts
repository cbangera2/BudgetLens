import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  // Same identifier string as the Tauri desktop shell
  // (src-tauri/tauri.conf.json) for brand consistency. This does NOT share
  // Keychain items across platforms: iOS Keychain sharing additionally needs
  // a shared Team ID plus keychain-access-groups entitlements, which are not
  // configured. iOS keys are written fresh via SecureStorage and never read
  // Tauri-created items.
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
