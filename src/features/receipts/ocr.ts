// Receipt OCR orchestration: image Blob -> on-device text -> draft candidates.
//
// The image is downscaled first (same pipeline as receipt attach: strips
// EXIF/GPS, shrinks the Vision payload), then recognized on-device, then
// parsed into merchant/total/date candidates. The result is a DRAFT proposal
// only: the caller shows the candidates with their confidence + source spans
// (see ocr-section.tsx) and the user confirms by applying them to the
// transaction form. Nothing is stored here.

import { downscaleToThumbnail } from "@/features/receipts/downscale"
import { parseReceiptOcr, type ReceiptOcrCandidates } from "@/features/receipts/ocr-parse"
import { detectReceiptTextLines, isReceiptOcrSupported } from "@/lib/native"

export type { ReceiptOcrCandidates }

export interface ReceiptOcrScan {
  candidates: ReceiptOcrCandidates
  /** Raw recognized lines in engine order (for debugging/show-your-work). */
  lines: readonly string[]
}

function blobToPureBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ""
    const chunkSize = 0x8000
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
    }
    return btoa(binary)
  })
}

/**
 * Scan a receipt image into draft candidates. Rejects for non-images;
 * resolves with (possibly empty) candidates otherwise — an empty result is
 * a normal "nothing recognized" outcome, not an error.
 */
export async function scanReceiptImage(source: Blob): Promise<ReceiptOcrScan> {
  if (source.type !== "" && !source.type.startsWith("image/")) {
    throw new Error("Only image files can be scanned for receipt text.")
  }
  if (!isReceiptOcrSupported()) {
    return {
      candidates: parseReceiptOcr([]),
      lines: [],
    }
  }
  const downscaled = await downscaleToThumbnail(source)
  const lines = await detectReceiptTextLines(await blobToPureBase64(downscaled.blob))
  return { candidates: parseReceiptOcr(lines), lines }
}

/**
 * Map candidates onto transaction-form string values. Missing fields map to
 * "" so the user fills them in; amounts render as negative expenses.
 */
export function ocrCandidatesToFormPatch(candidates: ReceiptOcrCandidates): {
  date: string
  description: string
  amount: string
} {
  const amountMinor = candidates.amountMinor.value
  return {
    date: candidates.date.value ?? "",
    description: candidates.merchant.value ?? "",
    amount: amountMinor === null ? "" : String(amountMinor / 100),
  }
}
