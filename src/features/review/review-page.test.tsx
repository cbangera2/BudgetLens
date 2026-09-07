import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { render, screen } from "@testing-library/react"

import { ReviewQueueCards } from "./review-page"
import type { ReviewQueueCounts } from "./summary"

const populated: ReviewQueueCounts = {
  transfersQueue: 1,
  subscriptionsFound: 2,
  rulesActive: 3,
  uncategorized: 4,
}

const empty: ReviewQueueCounts = {
  transfersQueue: 0,
  subscriptionsFound: 0,
  rulesActive: 0,
  uncategorized: 0,
}

function renderCards(counts: ReviewQueueCounts, initialPath = "/review") {
  const rootRoute = createRootRoute({ component: () => <ReviewQueueCards counts={counts} /> })
  const reviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/review",
    component: () => <ReviewQueueCards counts={counts} />,
  })
  const stub = (path: string) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <h1>{`${path} stub`}</h1>,
    })
  const routeTree = rootRoute.addChildren([reviewRoute, stub("/transactions"), stub("/imports")])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  return render(<RouterProvider router={router} />)
}

describe("ReviewQueueCards", () => {
  it("shows every queue count with links into the owning managers", async () => {
    renderCards(populated)

    expect(await screen.findByTestId("review-count-transfers")).toHaveTextContent("1")
    expect(screen.getByTestId("review-count-subscriptions")).toHaveTextContent("2")
    expect(screen.getByTestId("review-count-rules")).toHaveTextContent("3")
    expect(screen.getByTestId("review-count-uncategorized")).toHaveTextContent("4")

    expect(screen.getByRole("link", { name: "Open transfers queue" })).toHaveAttribute(
      "href",
      "#review-transfers",
    )
    expect(screen.getByRole("link", { name: "View subscriptions" })).toHaveAttribute(
      "href",
      "#review-subscriptions",
    )
    expect(screen.getByRole("link", { name: "Manage rules" })).toHaveAttribute("href", "/imports")
    expect(screen.getByRole("link", { name: "Triage uncategorized" })).toHaveAttribute(
      "href",
      "/transactions",
    )
    expect(screen.queryByRole("heading", { name: "You are all caught up" })).not.toBeInTheDocument()
  })

  it("shows guidance links when every queue is empty", async () => {
    renderCards(empty)

    expect(await screen.findByRole("heading", { name: "You are all caught up" })).toBeVisible()
    expect(screen.getByRole("link", { name: "Import transactions" })).toHaveAttribute(
      "href",
      "/imports",
    )
    expect(screen.getByRole("link", { name: "Browse transactions" })).toHaveAttribute(
      "href",
      "/transactions",
    )
  })
})
