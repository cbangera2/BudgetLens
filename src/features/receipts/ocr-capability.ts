// Capability detection for receipt OCR.
//
// Text recognition runs ONLY through the native plugin (Apple Vision on
// iOS, on-device, no server). The plugin has no web implementation, so the
// whole scan flow hides behind this gate: web builds render a one-line
// explanation instead of scan UI (see OcrDraftSection).

import { isNativeCapacitorSync } from "@/lib/isNative"

/** True only inside the native shell where the OCR plugin can run. */
export function isReceiptOcrAvailable(): boolean {
  try {
    return isNativeCapacitorSync()
  } catch {
    return false
  }
}

/** One-line web explanation. No scan controls accompany it (no fake UI). */
export const RECEIPT_OCR_WEB_NOTE =
  "Receipt text scan runs on-device in the native app; nothing is uploaded."
