import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import type { Transaction } from "@/domain/models"
import { buildTransaction } from "@/test/factories"

import { BillCalendarPageContent } from "./bill-calendar-page"
import type { MonthKey } from "./calendar"

function expense(id: string, date: string, description: string, amountMinor = -1299) {
  return buildTransaction({ id, date, description, amountMinor, transactionType: "Debit" })
}

interface PageProps {
  transactions?: readonly Transaction[]
  today?: string
  initialMonthKey?: MonthKey
}

function renderPage(props: PageProps = {}) {
  const rootRoute = createRootRoute({
    component: () => (
      <BillCalendarPageContent
        transactions={props.transactions}
        today={props.today}
        initialMonthKey={props.initialMonthKey}
      />
    ),
  })
  const billsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/bills",
    component: () => (
      <BillCalendarPageContent
        transactions={props.transactions}
        today={props.today}
        initialMonthKey={props.initialMonthKey}
      />
    ),
  })
  const importsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/imports",
    component: () => <h1>Imports stub</h1>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([billsRoute, importsRoute]),
    history: createMemoryHistory({ initialEntries: ["/bills"] }),
  })
  return render(<RouterProvider router={router} />)
}

const streamingTransactions = [
  expense("s1", "2026-01-15", "Beacon Streaming"),
  expense("s2", "2026-02-14", "Beacon Streaming"),
  expense("s3", "2026-03-16", "Beacon Streaming"),
  expense("s4", "2026-04-15", "Beacon Streaming"),
]

describe("BillCalendarPageContent", () => {
  it("renders bill chips on the projected day with the month total", async () => {
    const { container } = renderPage({
      transactions: streamingTransactions,
      today: "2026-05-01",
      initialMonthKey: "2026-05",
    })
    await screen.findByRole("heading", { name: "Bills" })

    expect(screen.getByRole("heading", { name: "Bills" })).toBeInTheDocument()
    const day = container.querySelector('[data-date="2026-05-15"]')
    expect(day).not.toBeNull()
    expect(day).toHaveTextContent("Beacon Streaming")
    expect(day).toHaveTextContent("$12.99")
    expect(screen.getByText(/Month total \$12\.99 across 1 bill/)).toBeInTheDocument()
  })

  it("highlights expected-but-unseen charges as overdue past the tolerance", async () => {
    renderPage({
      transactions: streamingTransactions,
      today: "2026-05-19",
      initialMonthKey: "2026-05",
    })
    await screen.findByRole("heading", { name: "Bills" })

    const chip = screen.getByRole("listitem", {
      name: /Beacon Streaming \$12\.99 overdue, expected 2026-05-15/,
    })
    expect(chip).toHaveAttribute("data-status", "overdue")
    expect(chip).toHaveTextContent("Overdue")
    expect(screen.getByText(/1 overdue/)).toBeInTheDocument()
  })

  it("keeps bills within the tolerance window as upcoming", async () => {
    renderPage({
      transactions: streamingTransactions,
      today: "2026-05-18",
      initialMonthKey: "2026-05",
    })
    await screen.findByRole("heading", { name: "Bills" })

    const chip = screen.getByRole("listitem", {
      name: /Beacon Streaming \$12\.99 on 2026-05-15/,
    })
    expect(chip).toHaveAttribute("data-status", "upcoming")
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument()
  })

  it("navigates months and returns to the current month", async () => {
    const user = userEvent.setup()
    const { container } = renderPage({
      transactions: streamingTransactions,
      today: "2026-05-01",
      initialMonthKey: "2026-05",
    })
    await screen.findByRole("heading", { name: "Bills" })

    await user.click(screen.getByRole("button", { name: "Next month" }))
    expect(screen.getByRole("heading", { name: "June 2026" })).toBeInTheDocument()
    expect(container.querySelector('[data-date="2026-06-14"]')).toHaveTextContent(
      "Beacon Streaming",
    )

    await user.click(screen.getByRole("button", { name: "Previous month" }))
    expect(screen.getByRole("heading", { name: "May 2026" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Next month" }))
    await user.click(screen.getByRole("button", { name: "Today" }))
    expect(screen.getByRole("heading", { name: "May 2026" })).toBeInTheDocument()
  })

  it("disables navigation at the bounds", async () => {
    renderPage({
      transactions: streamingTransactions,
      today: "2026-09-07",
      initialMonthKey: "2027-09",
    })
    await screen.findByRole("heading", { name: "Bills" })

    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Previous month" })).toBeEnabled()
  })

  it("shows an empty-month message when nothing is projected", async () => {
    renderPage({
      transactions: streamingTransactions,
      today: "2026-05-01",
      initialMonthKey: "2026-02",
    })
    await screen.findByRole("heading", { name: "Bills" })

    expect(screen.getByText(/No bills expected between/)).toBeInTheDocument()
  })

  it("shows a no-detection empty state with an import link", async () => {
    renderPage({ transactions: [], today: "2026-05-01" })
    await screen.findByRole("heading", { name: "Bills" })

    expect(screen.getByText("No recurring bills detected yet")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Import transactions" })).toBeInTheDocument()
  })

  it("resolves the live transaction query without changing hook order", async () => {
    // No injected transactions: the first render shows the loading state while
    // Dexie resolves, then the calendar. Every hook must run on both renders.
    renderPage({ today: "2026-05-01" })

    expect(await screen.findByRole("heading", { name: "Bills" })).toBeInTheDocument()
    expect(screen.getByText("No recurring bills detected yet")).toBeInTheDocument()
  })
})

const crowdedDates = ["2026-01-12", "2026-02-11", "2026-03-13", "2026-04-12"]
const crowdedMerchants: [string, number][] = [
  ["Civic Power", -4500],
  ["Harbor Internet", -8999],
  ["Beacon Mobile", -3250],
  ["Cedar Gym", -2500],
  ["Elm Storage", -6000],
  ["Maple Insurance", -12000],
  ["Birch Market", -999],
]
const crowdedTransactions = crowdedMerchants.flatMap(([name, amount], merchantIndex) =>
  crowdedDates.map((date, dateIndex) =>
    buildTransaction({
      id: `crowded-${merchantIndex}-${dateIndex}`,
      date,
      description: name,
      amountMinor: amount,
      transactionType: "Debit",
    }),
  ),
)

function transferPair(month: string, day: string, index: number) {
  const out = buildTransaction({
    id: `sweep-out-${index}`,
    date: `2026-${month}-${day}`,
    description: "Transfer to High-Yield Savings",
    amountMinor: -50_000,
    transactionType: "Debit",
    accountName: "Everyday Checking",
  })
  const outDay = Number(day)
  const inDate =
    outDay < 28 ? `2026-${month}-${String(outDay + 1).padStart(2, "0")}` : `2026-${month}-${day}`
  const incoming = buildTransaction({
    id: `sweep-in-${index}`,
    date: inDate,
    description: "Transfer from Everyday Checking",
    amountMinor: 50_000,
    transactionType: "Credit",
    accountName: "High-Yield Savings",
  })
  return [out, incoming]
}

const sweepTransactions = [
  ...transferPair("01", "15", 1),
  ...transferPair("02", "15", 2),
  ...transferPair("03", "15", 3),
  ...transferPair("04", "15", 4),
  ...streamingTransactions,
]

describe("bill chip containment", () => {
  it("constrains a crowded overdue day inside its cell", async () => {
    const { container } = renderPage({
      transactions: crowdedTransactions,
      today: "2026-09-07",
      initialMonthKey: "2026-05",
    })
    await screen.findByRole("heading", { name: "Bills" })

    // Layout contract: fixed columns so cells cannot grow, grid items that
    // can shrink, clipped cell content, ellipsized names. The section itself
    // carries min-w-0 so the wide table cannot blow out the page grid and
    // push the month navigation off narrow viewports.
    expect(container.querySelector("table")?.className).toContain("table-fixed")
    expect(screen.getByRole("region", { name: "Bill calendar" }).className).toContain("min-w-0")
    const cell = container.querySelector('[data-date="2026-05-12"]')
    expect(cell).not.toBeNull()
    const chips = cell?.querySelectorAll("li") ?? []
    expect(chips).toHaveLength(7)
    for (const chip of chips) {
      expect(chip.className).toContain("min-w-0")
      expect(chip.querySelector("span.truncate")).not.toBeNull()
    }
    expect(cell?.querySelector(":scope > div")?.className).toContain("overflow-hidden")
  })
})

describe("bill overrides", () => {
  it("edits a bill amount and updates the month total", async () => {
    const user = userEvent.setup()
    renderPage({
      transactions: streamingTransactions,
      today: "2026-05-01",
      initialMonthKey: "2026-05",
    })
    await screen.findByRole("heading", { name: "Bills" })

    await user.click(screen.getByRole("button", { name: "Edit Beacon Streaming bill" }))
    const amount = screen.getByLabelText("Expected amount (USD)")
    await user.clear(amount)
    await user.type(amount, "20")
    await user.click(screen.getByRole("button", { name: "Save bill" }))

    expect(screen.getByText(/Month total \$20\.00 across 1 bill/)).toBeInTheDocument()
    const day = document.querySelector('[data-date="2026-05-15"]')
    expect(day).toHaveTextContent("$20.00")
  })

  it("persists overrides across remounts and resets to detected", async () => {
    const user = userEvent.setup()
    const first = renderPage({
      transactions: streamingTransactions,
      today: "2026-05-01",
      initialMonthKey: "2026-05",
    })
    await screen.findByRole("heading", { name: "Bills" })

    await user.click(screen.getByRole("button", { name: "Edit Beacon Streaming bill" }))
    const amount = screen.getByLabelText("Expected amount (USD)")
    await user.clear(amount)
    await user.type(amount, "20")
    await user.click(screen.getByRole("button", { name: "Save bill" }))
    expect(screen.getByText(/Month total \$20\.00/)).toBeInTheDocument()
    first.unmount()

    renderPage({
      transactions: streamingTransactions,
      today: "2026-05-01",
      initialMonthKey: "2026-05",
    })
    await screen.findByRole("heading", { name: "Bills" })
    expect(screen.getByText(/Month total \$20\.00/)).toBeInTheDocument()

    // Clearing both fields and saving removes the stored override.
    await user.click(screen.getByRole("button", { name: "Edit Beacon Streaming bill" }))
    await user.clear(screen.getByLabelText("Expected amount (USD)"))
    await user.clear(screen.getByLabelText("Expected day of month"))
    await user.click(screen.getByRole("button", { name: "Save bill" }))
    expect(screen.getByText(/Month total \$12\.99/)).toBeInTheDocument()
  })

  it("rejects invalid override input without saving", async () => {
    const user = userEvent.setup()
    renderPage({
      transactions: streamingTransactions,
      today: "2026-05-01",
      initialMonthKey: "2026-05",
    })
    await screen.findByRole("heading", { name: "Bills" })

    await user.click(screen.getByRole("button", { name: "Edit Beacon Streaming bill" }))
    const amount = screen.getByLabelText("Expected amount (USD)")
    await user.clear(amount)
    // Number inputs accept zero keystrokes; the dialog must reject it.
    await user.type(amount, "0")
    await user.click(screen.getByRole("button", { name: "Save bill" }))

    expect(screen.getByRole("alert")).toHaveTextContent(/greater than \$0/)
    // Dialog stays open and the projection is untouched.
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByText(/Month total \$12\.99/)).toBeInTheDocument()
  })

  it("dismisses a merchant everywhere", async () => {
    const user = userEvent.setup()
    renderPage({
      transactions: streamingTransactions,
      today: "2026-05-01",
      initialMonthKey: "2026-05",
    })
    await screen.findByRole("heading", { name: "Bills" })

    await user.click(screen.getByRole("button", { name: "Edit Beacon Streaming bill" }))
    await user.click(screen.getByLabelText(/Not a bill/))
    await user.click(screen.getByRole("button", { name: "Save bill" }))

    expect(document.querySelector('[data-date="2026-05-15"] li')).toBeNull()
    expect(screen.getByText(/No bills expected between/)).toBeInTheDocument()
    expect(screen.getByText(/1 dismissed/)).toBeInTheDocument()
  })
})

describe("transfer exclusion", () => {
  it("hides fully-paired savings sweeps but keeps genuine bills", async () => {
    renderPage({
      transactions: sweepTransactions,
      today: "2026-05-01",
      initialMonthKey: "2026-05",
    })
    await screen.findByRole("heading", { name: "Bills" })

    expect(screen.queryByText("Transfer to High-Yield Savings")).not.toBeInTheDocument()
    const day = document.querySelector('[data-date="2026-05-15"]')
    expect(day).toHaveTextContent("Beacon Streaming")
    expect(screen.getByText(/1 hidden as transfer/)).toBeInTheDocument()
    expect(screen.getByText(/Month total \$12\.99 across 1 bill/)).toBeInTheDocument()
  })
})

describe("dismissed bill restoration", () => {
  it("restores a dismissed merchant from the hidden bills list", async () => {
    const user = userEvent.setup()
    renderPage({
      transactions: streamingTransactions,
      today: "2026-05-01",
      initialMonthKey: "2026-05",
    })
    await screen.findByRole("heading", { name: "Bills" })

    await user.click(screen.getByRole("button", { name: "Edit Beacon Streaming bill" }))
    await user.click(screen.getByLabelText(/Not a bill/))
    await user.click(screen.getByRole("button", { name: "Save bill" }))
    expect(document.querySelector('[data-date="2026-05-15"] li')).toBeNull()

    expect(screen.getByRole("heading", { name: "Hidden bills" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Restore Beacon Streaming bill" }))

    expect(document.querySelector('[data-date="2026-05-15"]')).toHaveTextContent("Beacon Streaming")
    expect(screen.getByText(/Month total \$12\.99/)).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Hidden bills" })).not.toBeInTheDocument()
  })
})

describe("bill edit dialog keyboard behavior", () => {
  it("closes on Escape and returns focus to the invoking edit button", async () => {
    const user = userEvent.setup()
    renderPage({
      transactions: streamingTransactions,
      today: "2026-05-01",
      initialMonthKey: "2026-05",
    })
    await screen.findByRole("heading", { name: "Bills" })

    const edit = screen.getByRole("button", { name: "Edit Beacon Streaming bill" })
    await user.click(edit)
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(edit).toHaveFocus()
  })

  it("traps Tab inside the dialog", async () => {
    const user = userEvent.setup()
    renderPage({
      transactions: streamingTransactions,
      today: "2026-05-01",
      initialMonthKey: "2026-05",
    })
    await screen.findByRole("heading", { name: "Bills" })

    await user.click(screen.getByRole("button", { name: "Edit Beacon Streaming bill" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    // Reverse-tab from the first field wraps to the last control.
    expect(screen.getByLabelText("Expected amount (USD)")).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole("button", { name: "Save bill" })).toHaveFocus()
  })
})
