// Receipt OCR trigger + candidates UI for the new-transaction form.
//
// Native: a "Scan receipt" file input runs on-device Vision OCR over the
// picked photo and proposes merchant/total/date candidates with explicit
// confidence plus the source spans behind each field. Approving prefills the
// surrounding form as a DRAFT; the user still submits the form, so nothing
// is stored without confirmation (same draft/approval contract as
// ProposalCard and the import preview). Web: a one-line explanation only,
// no scan controls (the plugin has no web implementation; no fake UI).

import { useId, useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ProposalCard } from "@/features/assistant/proposal-card"
import {
  ocrCandidatesToFormPatch,
  scanReceiptImage,
  type ReceiptOcrCandidates,
} from "@/features/receipts/ocr"
import { isReceiptOcrAvailable, RECEIPT_OCR_WEB_NOTE } from "@/features/receipts/ocr-capability"
import type { OcrConfidenceLevel } from "@/features/receipts/ocr-parse"

export interface OcrFormPatch {
  date: string
  description: string
  amount: string
}

function confidenceLabel(level: OcrConfidenceLevel): string {
  if (level === "high") return "high confidence"
  if (level === "medium") return "medium confidence"
  if (level === "low") return "low confidence"
  return "not found"
}

function candidateLine(
  label: string,
  display: string,
  candidate: { level: OcrConfidenceLevel; spans: readonly string[]; note: string },
): string {
  const quoted = candidate.spans.map((span) => `"${span}"`).join(", ")
  const evidence = quoted ? ` From ${quoted}.` : ""
  return `${label}: ${display} (${confidenceLabel(candidate.level)}).${evidence} ${candidate.note}`
}

function formatAmountMinor(minor: number): string {
  const sign = minor < 0 ? "-" : ""
  const absolute = Math.abs(minor)
  const dollars = Math.floor(absolute / 100).toLocaleString("en-US")
  const cents = (absolute % 100).toString().padStart(2, "0")
  return `${sign}$${dollars}.${cents}`
}

/** Pure candidates card: confidence + source spans per field, approve/dismiss. */
export function OcrCandidatesCard({
  candidates,
  applied,
  onApply,
  onDismiss,
}: {
  candidates: ReceiptOcrCandidates
  applied: boolean
  onApply: () => void
  onDismiss: () => void
}) {
  const amountDisplay =
    candidates.amountMinor.value === null ? "—" : formatAmountMinor(candidates.amountMinor.value)
  const lines = [
    candidateLine("Merchant", candidates.merchant.value ?? "—", candidates.merchant),
    candidateLine("Total", amountDisplay, candidates.amountMinor),
    candidateLine("Date", candidates.date.value ?? "—", candidates.date),
  ]
  if (candidates.lowConfidence) {
    lines.push("Low confidence: review each field before using these values.")
  }
  return (
    <ProposalCard
      title="Receipt scan proposal"
      lines={lines}
      status={applied ? "applied" : "idle"}
      onApprove={onApply}
      onDismiss={onDismiss}
    />
  )
}

/**
 * Scan trigger + proposal, rendered at the top of the new-transaction form.
 * onApply receives a form patch (date/description/amount strings); the form
 * owns the values from there and the user submits as usual.
 */
export function OcrDraftSection({ onApply }: { onApply: (patch: OcrFormPatch) => void }) {
  const fieldId = useId()
  const [available] = useState(isReceiptOcrAvailable)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState("")
  const [candidates, setCandidates] = useState<ReceiptOcrCandidates | null>(null)
  const [applied, setApplied] = useState(false)

  if (!available) {
    return <p className="text-xs text-muted-foreground">{RECEIPT_OCR_WEB_NOTE}</p>
  }

  async function scan(file: File | undefined) {
    if (!file || scanning) return
    setScanning(true)
    setError("")
    setApplied(false)
    try {
      const result = await scanReceiptImage(file)
      if (result.lines.length === 0) {
        setCandidates(null)
        setError("No text was recognized in that photo. Try a sharper image.")
        return
      }
      setCandidates(result.candidates)
    } catch {
      setCandidates(null)
      setError("That photo could not be scanned. Try another image file.")
    } finally {
      setScanning(false)
    }
  }

  return (
    <section aria-labelledby={`${fieldId}-ocr-title`} className="grid gap-2">
      <h3 id={`${fieldId}-ocr-title`} className="text-sm font-medium">
        Scan receipt
      </h3>
      <p className="text-xs text-muted-foreground">
        Text is recognized on this device and proposed below. Nothing is saved until you submit the
        form.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={`${fieldId}-ocr-file`}>Scan receipt photo</Label>
        <Input
          id={`${fieldId}-ocr-file`}
          type="file"
          accept="image/*"
          disabled={scanning}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ""
            void scan(file)
          }}
        />
      </div>
      {scanning && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Reading receipt text on this device…
        </p>
      )}
      {candidates && !scanning && (
        <OcrCandidatesCard
          candidates={candidates}
          applied={applied}
          onApply={() => {
            onApply(ocrCandidatesToFormPatch(candidates))
            setApplied(true)
          }}
          onDismiss={() => {
            setCandidates(null)
            setApplied(false)
          }}
        />
      )}
    </section>
  )
}
