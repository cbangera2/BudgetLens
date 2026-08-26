import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { DemoBanner } from "@/features/demo/demo-banner"

function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => ui,
  })
  const importsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/imports",
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, importsRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return render(<RouterProvider router={router} />)
}

afterEach(cleanup)

describe("DemoBanner", () => {
  it("explains demo data and links to the imports page when visible", async () => {
    renderWithRouter(<DemoBanner visible />)

    const banner = await screen.findByTestId("demo-banner")
    expect(banner).toHaveTextContent(/sample demo data/i)
    const link = await screen.findByRole("link", { name: "Imports page" })
    expect(link).toHaveAttribute("href", "/imports")
  })

  it("renders nothing when hidden", () => {
    renderWithRouter(<DemoBanner visible={false} />)

    expect(screen.queryByTestId("demo-banner")).not.toBeInTheDocument()
  })
})
