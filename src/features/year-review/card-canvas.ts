import type { YearReviewStats } from "./stats"

export const YEAR_REVIEW_CARD_WIDTH = 1080
export const YEAR_REVIEW_CARD_HEIGHT = 1350

export const YEAR_REVIEW_CARD_MIME_TYPE = "image/png"

export function yearReviewFilename(year: number): string {
  return `budgetlens-year-review-${year}.png`
}

function formatCardMoney(amountMinor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountMinor / 100)
}

function formatSignedCardMoney(amountMinor: number): string {
  const formatted = formatCardMoney(Math.abs(amountMinor))
  if (amountMinor > 0) return `+${formatted}`
  if (amountMinor < 0) return `-${formatted}`
  return formatted
}

export interface YearReviewDrawGradient {
  addColorStop: (offset: number, color: string) => void
}

/**
 * Minimal surface of CanvasRenderingContext2D used by the card renderer. A
 * structural subset keeps unit tests free of DOM canvas fixtures while the
 * real 2D context satisfies it in browsers.
 */
export interface YearReviewDrawContext {
  fillStyle: unknown
  strokeStyle: unknown
  font: string
  textBaseline: string
  lineWidth: number
  fillRect: (x: number, y: number, width: number, height: number) => void
  fillText: (text: string, x: number, y: number) => void
  beginPath: () => void
  arc: (x: number, y: number, radius: number, startAngle: number, endAngle: number) => void
  stroke: () => void
  measureText: (text: string) => { readonly width: number }
  createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => YearReviewDrawGradient
}

export interface YearReviewCardCanvas {
  width: number
  height: number
  getContext(contextId: "2d"): YearReviewDrawContext | null
  toBlob(callback: (blob: Blob | null) => void, type?: string): void
}

export interface YearReviewPngDependencies {
  createCanvas: () => YearReviewCardCanvas
}

/**
 * Draw the share card offscreen with plain Canvas 2D only: a portrait card
 * with the year, headline income/spent/saved numbers, top-three categories
 * with share bars, the biggest month, and the net-worth start-to-end delta.
 * System fonts only; no external assets so the export works offline.
 */
export function drawYearReviewCard(context: YearReviewDrawContext, stats: YearReviewStats): void {
  const width = YEAR_REVIEW_CARD_WIDTH
  const height = YEAR_REVIEW_CARD_HEIGHT
  const margin = 88

  const background = context.createLinearGradient(0, 0, 0, height)
  background.addColorStop(0, "#0a2e23")
  background.addColorStop(0.55, "#0e3d2e")
  background.addColorStop(1, "#071f18")
  context.fillStyle = background
  context.fillRect(0, 0, width, height)

  context.strokeStyle = "rgba(110, 231, 183, 0.35)"
  context.lineWidth = 3
  context.beginPath()
  context.arc(width - 90, 150, 210, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(width - 90, 150, 150, 0, Math.PI * 2)
  context.strokeStyle = "rgba(110, 231, 183, 0.18)"
  context.stroke()

  context.fillStyle = "#6ee7b7"
  context.font = "600 34px system-ui, -apple-system, sans-serif"
  context.textBaseline = "alphabetic"
  context.fillText("BUDGETLENS", margin, 150)

  context.fillStyle = "#ffffff"
  context.font = "800 150px system-ui, -apple-system, sans-serif"
  context.fillText(String(stats.year), margin, 300)

  context.fillStyle = "rgba(255, 255, 255, 0.72)"
  context.font = "400 40px system-ui, -apple-system, sans-serif"
  context.fillText("Year in review", margin, 360)

  const headlineY = 520
  const columnWidth = (width - margin * 2) / 3
  const headlines = [
    { label: "Income", value: formatCardMoney(stats.incomeMinor) },
    { label: "Spent", value: formatCardMoney(stats.expenseMinor) },
    {
      label:
        stats.savingsRate === null ? "Saved" : `Saved (${Math.round(stats.savingsRate * 100)}%)`,
      value: formatCardMoney(stats.savingsMinor),
    },
  ]
  headlines.forEach((headline, index) => {
    const x = margin + columnWidth * index
    context.fillStyle = "#ffffff"
    context.font = "700 56px system-ui, -apple-system, sans-serif"
    context.fillText(headline.value, x, headlineY)
    context.fillStyle = "rgba(255, 255, 255, 0.65)"
    context.font = "400 32px system-ui, -apple-system, sans-serif"
    context.fillText(headline.label, x, headlineY + 52)
  })

  let cursorY = 700
  context.fillStyle = "#ffffff"
  context.font = "700 44px system-ui, -apple-system, sans-serif"
  context.fillText("Top categories", margin, cursorY)
  cursorY += 56

  if (stats.topCategories.length === 0) {
    context.fillStyle = "rgba(255, 255, 255, 0.65)"
    context.font = "400 34px system-ui, -apple-system, sans-serif"
    context.fillText("No spending this year", margin, cursorY)
    cursorY += 60
  }

  for (const entry of stats.topCategories) {
    context.fillStyle = "#ffffff"
    context.font = "600 36px system-ui, -apple-system, sans-serif"
    context.fillText(entry.category.slice(0, 26), margin, cursorY)
    const amount = formatCardMoney(entry.amountMinor)
    const amountWidth = context.measureText(amount).width
    context.font = "700 36px system-ui, -apple-system, sans-serif"
    context.fillText(amount, width - margin - amountWidth, cursorY)

    cursorY += 22
    const barWidth = width - margin * 2
    context.fillStyle = "rgba(255, 255, 255, 0.18)"
    context.fillRect(margin, cursorY, barWidth, 16)
    context.fillStyle = "#34d399"
    context.fillRect(margin, cursorY, Math.max(8, Math.round(barWidth * entry.share)), 16)
    cursorY += 72
  }

  cursorY += 8
  context.fillStyle = "rgba(255, 255, 255, 0.65)"
  context.font = "400 34px system-ui, -apple-system, sans-serif"
  const biggest =
    stats.biggestMonth === null
      ? "Biggest month: —"
      : `Biggest month: ${stats.biggestMonth.month} (${formatCardMoney(stats.biggestMonth.expenseMinor)})`
  context.fillText(biggest.slice(0, 48), margin, cursorY)

  cursorY += 60
  const delta =
    stats.netWorthDeltaMinor === null
      ? "Net worth: no movement tracked"
      : `Net worth ${formatSignedCardMoney(stats.netWorthDeltaMinor)} this year`
  context.fillStyle = "#ffffff"
  context.font = "600 38px system-ui, -apple-system, sans-serif"
  context.fillText(delta.slice(0, 48), margin, cursorY)

  context.fillStyle = "rgba(255, 255, 255, 0.55)"
  context.font = "400 30px system-ui, -apple-system, sans-serif"
  context.fillText("BudgetLens · your data stays on your device", margin, height - 72)
}

function defaultDependencies(): YearReviewPngDependencies {
  return {
    createCanvas: () => document.createElement("canvas"),
  }
}

/**
 * Render the card offscreen and resolve a non-empty PNG blob. Rejects when
 * the 2D context or the encoder is unavailable so callers can surface an
 * export error instead of sharing an empty file.
 */
export async function exportYearReviewPng(
  stats: YearReviewStats,
  dependencies: YearReviewPngDependencies = defaultDependencies(),
): Promise<Blob> {
  const canvas = dependencies.createCanvas()
  canvas.width = YEAR_REVIEW_CARD_WIDTH
  canvas.height = YEAR_REVIEW_CARD_HEIGHT
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Year-in-review export needs a 2D canvas context.")

  drawYearReviewCard(context, stats)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), YEAR_REVIEW_CARD_MIME_TYPE)
  })
  if (!blob || blob.size === 0) throw new Error("Year-in-review export produced an empty image.")
  return blob
}
