import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

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

  it("exports a PNG download when sharing from the web fallback", async () => {
    vi.stubGlobal("navigator", {})
    vi.stubGlobal("ClipboardItem", undefined)
    const created: Blob[] = []
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob): string => {
        created.push(blob)
        return "blob:mock"
      },
      revokeObjectURL: (): void => {},
    })
    const clicked: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        clicked.push(this.download)
      },
    )

    render(<YearReviewSection transactions={transactions} wealth={wealth} />)
    fireEvent.click(screen.getByRole("button", { name: "Share year in review" }))

    await waitFor(() => {
      expect(clicked).toEqual(["budgetlens-year-review-2025.png"])
    })
    expect(created).toHaveLength(1)
    expect(created[0]?.type).toBe("image/png")
  })
})
