import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { fireEvent, render, screen } from "@testing-library/react"

import { buildTransaction } from "@/test/factories"

import { INSIGHTS_DISMISSAL_STORAGE_KEY } from "./dismissal"
import { InsightsSection } from "./insights-section"

function memoryStorage(): Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "clear" | "key" | "length"
> {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  }
}

function expense(
  id: string,
  date: string,
  description: string,
  amountMinor: number,
  category: string | null = "Dining",
) {
  return buildTransaction({
    id,
    date,
    description,
    amountMinor,
    category,
    transactionType: "Debit",
  })
}

const twoMonths = [
  expense("aug-groceries", "2026-08-05", "Neighborhood Market", -10_000, "Groceries"),
  expense("aug-deli", "2026-08-06", "Corner Deli", -4_000, "Dining"),
  expense("sep-groceries", "2026-09-05", "Neighborhood Market", -15_000, "Groceries"),
  expense("sep-deli", "2026-09-06", "Corner Deli", -4_000, "Dining"),
  expense("sep-new", "2026-09-07", "Juniper Outfitters", -8_000, "Shopping"),
]

function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => ui,
  })
  const transactionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/transactions",
    component: () => null,
  })
  const importsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/imports",
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, transactionsRoute, importsRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return render(<RouterProvider router={router} />)
}

describe("InsightsSection", () => {
  it("shows movers with cited figures and links to the filtered view", async () => {
    const storage = memoryStorage()
    renderWithRouter(<InsightsSection transactions={twoMonths} storage={storage} />)

    expect(await screen.findByRole("region", { name: "Insights" })).toBeInTheDocument()
    // Groceries rose $100.00 -> $150.00 (+$50.00, +50.0%).
    expect(screen.getByText(/\$100\.00 → \$150\.00/)).toBeInTheDocument()
    expect(screen.getByText(/\+\$50\.00, \+50\.0%/)).toBeInTheDocument()

    const moverLink = screen.getByRole("link", {
      name: "View Groceries transactions for the current month",
    })
    const href = moverLink.getAttribute("href") ?? ""
    expect(href).toContain("/transactions")
    expect(href).toContain("category=Groceries")
    expect(href).toContain("from=2026-09-01")
    expect(href).toContain("to=2026-09-30")
  })

  it("dismisses a single insight and persists the dismissal", async () => {
    const storage = memoryStorage()
    renderWithRouter(<InsightsSection transactions={twoMonths} storage={storage} />)

    fireEvent.click(await screen.findByRole("button", { name: "Dismiss insight: Groceries" }))
    expect(screen.queryByRole("button", { name: "Dismiss insight: Groceries" })).toBeNull()
    expect(storage.getItem(INSIGHTS_DISMISSAL_STORAGE_KEY)).toContain("mover-up|groceries")

    fireEvent.click(await screen.findByRole("button", { name: /Restore .* dismissed/ }))
    expect(
      await screen.findByRole("button", { name: "Dismiss insight: Groceries" }),
    ).toBeInTheDocument()
  })

  it("dismisses and restores the whole card", async () => {
    const storage = memoryStorage()
    renderWithRouter(<InsightsSection transactions={twoMonths} storage={storage} />)

    fireEvent.click(await screen.findByRole("button", { name: "Dismiss insights card" }))
    expect(await screen.findByText(/dismissed/)).toBeInTheDocument()
    expect(storage.getItem(INSIGHTS_DISMISSAL_STORAGE_KEY)).toContain("2026-08>2026-09")

    fireEvent.click(await screen.findByRole("button", { name: "Show insights again" }))
    expect(await screen.findByRole("button", { name: "Dismiss insights card" })).toBeInTheDocument()
  })

  it("shows guidance when history is too thin", async () => {
    const storage = memoryStorage()
    renderWithRouter(
      <InsightsSection
        transactions={[expense("only", "2026-09-05", "Corner Deli", -4_000)]}
        storage={storage}
      />,
    )

    expect(await screen.findByText(/Not enough history yet/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Import another month of data" })).toBeInTheDocument()
  })
})
