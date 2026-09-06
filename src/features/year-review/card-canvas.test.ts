import { buildTransaction, buildWealthSnapshot } from "@/test/factories"

import {
  YEAR_REVIEW_CARD_HEIGHT,
  YEAR_REVIEW_CARD_WIDTH,
  drawYearReviewCard,
  exportYearReviewPng,
  yearReviewFilename,
  type YearReviewCardCanvas,
  type YearReviewDrawContext,
} from "./card-canvas"
import { buildYearReviewStats } from "./stats"

function createContextStub(): YearReviewDrawContext {
  return {
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textBaseline: "alphabetic",
    lineWidth: 1,
    fillRect: () => undefined,
    fillText: () => undefined,
    beginPath: () => undefined,
    arc: () => undefined,
    stroke: () => undefined,
    measureText: () => ({ width: 42 }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
  }
}

function createCanvasStub(context: YearReviewDrawContext | null): YearReviewCardCanvas {
  return {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback) => {
      callback(new Blob(["synthetic-png-bytes"], { type: "image/png" }))
    },
  }
}

const stats = buildYearReviewStats(
  2025,
  [
    buildTransaction({
      id: "income",
      date: "2025-02-01",
      amountMinor: 200_000,
      category: "Income",
      transactionType: "Credit",
    }),
    buildTransaction({ id: "rent", date: "2025-03-01", amountMinor: -60_000, category: "Rent" }),
    buildTransaction({
      id: "food",
      date: "2025-03-02",
      amountMinor: -12_000,
      category: "Groceries",
    }),
  ],
  [
    buildWealthSnapshot({ id: "start", date: "2025-01-31", valueMinor: 10_000_00 }),
    buildWealthSnapshot({ id: "end", date: "2025-12-31", valueMinor: 12_000_00 }),
  ],
)

describe("year-review canvas export", () => {
  it("produces a non-empty PNG blob at portrait dimensions", async () => {
    const canvas = createCanvasStub(createContextStub())

    const blob = await exportYearReviewPng(stats, { createCanvas: () => canvas })

    expect(canvas.width).toBe(YEAR_REVIEW_CARD_WIDTH)
    expect(canvas.height).toBe(YEAR_REVIEW_CARD_HEIGHT)
    expect(blob.type).toBe("image/png")
    expect(blob.size).toBeGreaterThan(0)
  })

  it("rejects when no 2D context is available", async () => {
    await expect(
      exportYearReviewPng(stats, { createCanvas: () => createCanvasStub(null) }),
    ).rejects.toThrow("2D canvas context")
  })

  it("rejects an empty encoder result instead of sharing an empty file", async () => {
    const canvas: YearReviewCardCanvas = {
      width: 0,
      height: 0,
      getContext: () => createContextStub(),
      toBlob: (callback) => callback(null),
    }

    await expect(exportYearReviewPng(stats, { createCanvas: () => canvas })).rejects.toThrow(
      "empty image",
    )
  })

  it("draws headline text with plain canvas calls only", () => {
    const context = createContextStub()
    const fillTextCalls: string[] = []
    context.fillText = (text: string) => {
      fillTextCalls.push(text)
    }

    drawYearReviewCard(context, stats)

    expect(fillTextCalls).toContain("2025")
    expect(fillTextCalls.some((text) => text.includes("Top categories"))).toBe(true)
    expect(fillTextCalls.some((text) => text.includes("Net worth"))).toBe(true)
  })

  it("draws an empty-year card without throwing", () => {
    const context = createContextStub()

    expect(() => drawYearReviewCard(context, buildYearReviewStats(2025, [], []))).not.toThrow()
  })

  it("builds a stable per-year filename", () => {
    expect(yearReviewFilename(2025)).toBe("budgetlens-year-review-2025.png")
  })
})
