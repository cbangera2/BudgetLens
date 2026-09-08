// Tests for the receipt OCR draft UI (synthetic candidates only, no photos).

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ocrCandidatesToFormPatch, scanReceiptImage } from "@/features/receipts/ocr"
import { RECEIPT_OCR_WEB_NOTE } from "@/features/receipts/ocr-capability"
import { parseReceiptOcr } from "@/features/receipts/ocr-parse"
import { OcrCandidatesCard, OcrDraftSection } from "@/features/receipts/ocr-section"
import { syntheticImageFile } from "@/features/receipts/synthetic-image"

function syntheticCandidates() {
  return parseReceiptOcr(["Sunny Grocers", "2026-08-15", "TOTAL $7.00"])
}

describe("OcrDraftSection on web", () => {
  it("shows the one-line explanation with no scan controls", () => {
    render(<OcrDraftSection onApply={() => undefined} />)
    expect(screen.getByText(RECEIPT_OCR_WEB_NOTE)).toBeVisible()
    expect(screen.queryByLabelText(/scan receipt photo/i)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /scan receipt/i })).not.toBeInTheDocument()
  })
})

describe("OcrCandidatesCard", () => {
  it("shows each field with confidence and source spans", () => {
    render(
      <OcrCandidatesCard
        candidates={syntheticCandidates()}
        applied={false}
        onApply={() => undefined}
        onDismiss={() => undefined}
      />,
    )
    expect(screen.getByRole("group", { name: "Receipt scan proposal" })).toBeVisible()
    // Show-your-work: the exact OCR spans behind each candidate are quoted.
    expect(screen.getByText(/"Sunny Grocers"/)).toBeVisible()
    expect(screen.getByText(/"TOTAL \$7\.00"/)).toBeVisible()
    expect(screen.getByText(/"2026-08-15"/)).toBeVisible()
    expect(screen.getAllByText(/high confidence/)).toHaveLength(3)
  })

  it("flags low-confidence proposals for review", () => {
    const low = parseReceiptOcr(["Sunny Grocers", "Milk 2.99"])
    expect(low.lowConfidence).toBe(true)
    render(
      <OcrCandidatesCard
        candidates={low}
        applied={false}
        onApply={() => undefined}
        onDismiss={() => undefined}
      />,
    )
    expect(screen.getAllByText(/low confidence/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/review each field/)).toBeVisible()
  })

  it("approves and dismisses through the draft/approval buttons", async () => {
    const user = userEvent.setup()
    const onApply = vi.fn<() => void>()
    const onDismiss = vi.fn<() => void>()
    render(
      <OcrCandidatesCard
        candidates={syntheticCandidates()}
        applied={false}
        onApply={onApply}
        onDismiss={onDismiss}
      />,
    )
    await user.click(screen.getByRole("button", { name: /approve/i }))
    expect(onApply).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole("button", { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("marks applied proposals without approval buttons", () => {
    render(
      <OcrCandidatesCard
        candidates={syntheticCandidates()}
        applied
        onApply={() => undefined}
        onDismiss={() => undefined}
      />,
    )
    expect(screen.getByText(/applied/)).toBeVisible()
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument()
  })
})

describe("scanReceiptImage on web", () => {
  it("resolves empty candidates without touching the native bridge", async () => {
    const result = await scanReceiptImage(syntheticImageFile("ocr-web"))
    expect(result.lines).toEqual([])
    expect(result.candidates.lowConfidence).toBe(true)
    expect(result.candidates.merchant.value).toBeNull()
  })

  it("rejects non-image files", async () => {
    const file = new File(["not an image"], "note.txt", { type: "text/plain" })
    await expect(scanReceiptImage(file)).rejects.toThrow(/only image files/i)
  })
})

describe("ocrCandidatesToFormPatch", () => {
  it("maps candidates onto form strings as a negative expense", () => {
    expect(ocrCandidatesToFormPatch(syntheticCandidates())).toEqual({
      date: "2026-08-15",
      description: "Sunny Grocers",
      amount: "-7",
    })
  })

  it("maps missing fields to blanks for the user to complete", () => {
    expect(ocrCandidatesToFormPatch(parseReceiptOcr([]))).toEqual({
      date: "",
      description: "",
      amount: "",
    })
  })
})
