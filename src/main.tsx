import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "@/app/app"
import { setupAutoBackupOnSuspend } from "@/features/settings/auto-backup"

import "@/styles.css"

const root = document.getElementById("root")

if (!root) {
  throw new Error("BudgetLens root element was not found")
}

// Best-effort: ask the browser/WebView to exclude IndexedDB from automatic
// storage eviction (matters on WKWebView/WebKitGTK). Never blocks render;
// Settings JSON backup stays the supported migration path.
if (typeof navigator !== "undefined" && typeof navigator.storage?.persist === "function") {
  void navigator.storage.persist().catch(() => undefined)
}

// Native-only daily auto-backup on suspend; best-effort and never blocks render.
setupAutoBackupOnSuspend()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
