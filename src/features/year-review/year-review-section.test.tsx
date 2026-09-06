import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buildTransaction, buildWealthSnapshot } from "@/test/factories"

import type { YearReviewStats } from "./stats"
import { YearReviewSection } from "./year-review-section"

vi.mock("./card-canvas", async (importOriginal) => {
  const original = await importOriginal<typeof import("./card-canvas")>()
  return {
    ...original,
    exportYearReviewPng: vi.fn<(stats: YearReviewStats) => Promise<Blob>>(
      async () => new Blob(["synthetic-png-bytes"], { type: "image/png" }),
    ),
  }
})

vi.mock("@/lib/native", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/native")>()
  return {
    ...original,
    isNative: vi.fn<() => boolean>(() => false),
    shareFile: vi.fn<(filename: string, blob: Blob, title?: string) => Promise<"downloaded">>(
      async () => "downloaded",
    ),
    downloadFile: vi.fn<(filename: string, blob: Blob) => void>(() => undefined),
  }
})

async function nativeMocks() {
  const native = await import("@/lib/native")
  return {
    shareFile: vi.mocked(native.shareFile),
    downloadFile: vi.mocked(native.downloadFile),
  }
}

const transactions = [
  buildTransaction({ id: "prior", date: "2024-11-02", amountMinor: -8_000, category: "Rent" }),
  buildTransaction({
    id: "income",
    date: "2025-01-05",
    amountMinor: 200_000,
    category: "Income",
    transactionType: "Credit",
  }),
  buildTransaction({ id: "rent", date: "2025-02-01", amountMinor: -60_000, category: "Rent" }),
  buildTransaction({ id: "food", date: "2025-02-02", amountMinor: -12_000, category: "Groceries" }),
]

const wealth = [
  buildWealthSnapshot({ id: "start", date: "2025-01-31", valueMinor: 10_000_00 }),
  buildWealthSnapshot({ id: "end", date: "2025-12-31", valueMinor: 12_000_00 }),
]

describe("YearReviewSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("renders the card with a year picker derived from data", () => {
    render(<YearReviewSection transactions={transactions} wealth={wealth} />)

    expect(screen.getByRole("heading", { name: "Year in review" })).toBeInTheDocument()
    expect(screen.getByTestId("year-review-card")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("2025"),
    )
    expect(screen.getByRole("button", { name: "Share year in review" })).toBeInTheDocument()
  })

  it("shares through the share sheet without downloading", async () => {
    const { shareFile, downloadFile } = await nativeMocks()

    render(<YearReviewSection transactions={transactions} wealth={wealth} />)
    fireEvent.click(screen.getByRole("button", { name: "Share year in review" }))

    await waitFor(() => {
      expect(shareFile).toHaveBeenCalledTimes(1)
    })
    expect(shareFile.mock.calls[0]?.[0]).toBe("budgetlens-year-review-2025.png")
    expect(downloadFile).not.toHaveBeenCalled()
  })

  it("downloads directly without the share flow", async () => {
    const { shareFile, downloadFile } = await nativeMocks()

    render(<YearReviewSection transactions={transactions} wealth={wealth} />)
    fireEvent.click(screen.getByRole("button", { name: "Download PNG" }))

    await waitFor(() => {
      expect(downloadFile).toHaveBeenCalledTimes(1)
    })
    expect(downloadFile.mock.calls[0]?.[0]).toBe("budgetlens-year-review-2025.png")
    expect(shareFile).not.toHaveBeenCalled()
  })
})
