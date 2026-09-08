import { render, screen } from "@testing-library/react"

import { buildTransaction } from "@/test/factories"

import { MonthlyCloseSection } from "./monthly-close-section"
import { MONTHLY_CLOSE_STORAGE_KEY } from "./store"

function storageWith(value: unknown): Storage {
  const backing = new Map<string, string>()
  if (value !== undefined) {
    backing.set(MONTHLY_CLOSE_STORAGE_KEY, JSON.stringify(value))
  }
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, content: string) => void backing.set(key, content),
    removeItem: (key: string) => void backing.delete(key),
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size
    },
  } satisfies Storage
}

function closingFixtures() {
  return [
    buildTransaction({
      id: "close-income",
      date: "2026-08-01",
      description: "Synthetic Paycheck",
      amountMinor: 200_000,
      category: "Income",
      transactionType: "Credit",
    }),
    buildTransaction({
      id: "close-uncategorized",
      date: "2026-08-06",
      description: "Synthetic Corner Bakery",
      amountMinor: -850,
      category: null,
      transactionType: "Debit",
    }),
    buildTransaction({
      id: "close-stream-august",
      date: "2026-08-15",
      description: "Synthetic Monthly Stream",
      amountMinor: -1200,
      category: "Entertainment",
      transactionType: "Debit",
    }),
    buildTransaction({
      id: "close-stream-june",
      date: "2026-06-15",
      description: "Synthetic Monthly Stream",
      amountMinor: -1200,
      category: "Entertainment",
      transactionType: "Debit",
    }),
    buildTransaction({
      id: "close-stream-july",
      date: "2026-07-15",
      description: "Synthetic Monthly Stream",
      amountMinor: -1200,
      category: "Entertainment",
      transactionType: "Debit",
    }),
  ]
}

describe("MonthlyCloseSection", () => {
  it("shows the banner and hub entry for an unclosed month with activity", async () => {
    render(
      <MonthlyCloseSection
        transactions={closingFixtures()}
        storage={storageWith(undefined)}
        now={new Date(2026, 8, 8)}
      />,
    )

    expect(await screen.findByTestId("monthly-close-banner")).toBeVisible()
    expect(screen.getByTestId("monthly-close-hub")).toBeVisible()
    expect(screen.getByRole("button", { name: "Start monthly close" })).toBeVisible()
  })

  it("hides the banner when there is no activity but keeps the hub", async () => {
    render(
      <MonthlyCloseSection
        transactions={[
          buildTransaction({ id: "other", date: "2026-07-01", category: "Groceries" }),
        ]}
        storage={storageWith(undefined)}
        now={new Date(2026, 8, 8)}
      />,
    )

    expect(await screen.findByTestId("monthly-close-hub")).toBeVisible()
    expect(screen.queryByTestId("monthly-close-banner")).not.toBeInTheDocument()
  })

  it("renders the calm closed state after the month is closed", async () => {
    render(
      <MonthlyCloseSection
        transactions={closingFixtures()}
        storage={storageWith({
          version: 1,
          months: {
            "2026-08": {
              month: "2026-08",
              step: 3,
              started: true,
              triageSkipped: false,
              recurringSkipped: false,
              confirmed: {},
              bannerDismissed: false,
              skippedMonth: false,
              closedAt: "2026-09-02T00:00:00.000Z",
              updatedAt: "2026-09-02T00:00:00.000Z",
            },
          },
        })}
        now={new Date(2026, 8, 8)}
      />,
    )

    expect(await screen.findByTestId("monthly-close-closed")).toBeVisible()
    expect(screen.getByTestId("monthly-close-verdict")).toBeVisible()
  })
})
