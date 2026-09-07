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
