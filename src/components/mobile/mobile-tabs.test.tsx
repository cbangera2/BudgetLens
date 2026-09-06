import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BarChart3, Landmark, Layers, ReceiptText, Settings, Target, Upload } from "lucide-react"
import { act } from "react"

import { MobileTabs } from "@/components/mobile/mobile-tabs"
import { MOBILE_LAYOUT_QUERY } from "@/components/mobile/use-media-query"

const TEST_NAVIGATION = [
  { to: "/", label: "Overview", icon: BarChart3 },
  { to: "/net-worth", label: "Net worth", icon: Landmark },
  { to: "/transactions", label: "Transactions", icon: ReceiptText },
  { to: "/groups", label: "Groups", icon: Layers },
  { to: "/budgets", label: "Budgets", icon: Target },
  { to: "/imports", label: "Imports", icon: Upload },
  { to: "/settings", label: "Settings", icon: Settings },
] as const

/**
 * jsdom does not apply Tailwind, so hidden surfaces still count as visible
 * here; queries are scoped with `within()` to the surface under test. Real
 * browsers hide the inactive surface with `hidden`/`lg:` rules, and the
 * Playwright spec covers navigation against the real pages.
 */
function mockViewport(initialMobile: boolean) {
  const previous = window.matchMedia
  let matchesMobile = initialMobile
  const listeners = new Set<(event: { matches: boolean }) => void>()
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: matchesMobile && query === MOBILE_LAYOUT_QUERY,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
        listeners.add(listener)
      },
      removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
        listeners.delete(listener)
      },
      dispatchEvent: () => false,
    }),
  })
  return {
    restore() {
      Object.defineProperty(window, "matchMedia", { configurable: true, value: previous })
    },
    setMobile(next: boolean) {
      matchesMobile = next
      for (const listener of listeners) listener({ matches: next })
    },
  }
}

function expectSheetFocus(sheet: HTMLElement) {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) throw new Error("expected focus inside the sheet")
  expect(sheet).toContainElement(active)
}

function renderTabs(initialPath = "/") {
  const rootRoute = createRootRoute({
    component: () => (
      <nav aria-label="Primary">
        <MobileTabs navigation={TEST_NAVIGATION} />
        <Outlet />
      </nav>
    ),
  })
  const stub = (heading: string) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: heading === "Overview" ? "/" : `/${heading.toLowerCase().replace(/ /g, "-")}`,
      component: () => <h1>{`${heading} stub`}</h1>,
    })
  const routeTree = rootRoute.addChildren(
    ["Overview", "Net worth", "Transactions", "Groups", "Budgets", "Imports", "Settings"].map(stub),
  )
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  return { router, ...render(<RouterProvider router={router} />) }
}

describe("mobile tab bar", () => {
  it("renders five tabs plus More on narrow viewports and navigates", async () => {
    const viewport = mockViewport(true)
    try {
      const user = userEvent.setup()
      const { router } = renderTabs()

      const tabs = await screen.findByRole("list", { name: "Primary destinations" })
      for (const label of ["Overview", "Transactions", "Budgets", "Net worth", "Settings"]) {
        expect(within(tabs).getByRole("link", { name: label })).toBeInTheDocument()
      }
      expect(screen.getByRole("button", { name: "More" })).toBeInTheDocument()
      // Overflow destinations are not tabs.
      expect(within(tabs).queryByRole("link", { name: "Groups" })).not.toBeInTheDocument()
      expect(within(tabs).queryByRole("link", { name: "Imports" })).not.toBeInTheDocument()

      await user.click(within(tabs).getByRole("link", { name: "Transactions" }))
      expect(await screen.findByRole("heading", { name: "Transactions stub" })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe("/transactions")
    } finally {
      viewport.restore()
    }
  })

  it("opens the More sheet, navigates to overflow destinations, and closes", async () => {
    const viewport = mockViewport(true)
    try {
      const user = userEvent.setup()
      const { router } = renderTabs()

      await user.click(await screen.findByRole("button", { name: "More" }))
      const sheet = await screen.findByRole("dialog", { name: "More destinations" })
      expect(within(sheet).getByRole("link", { name: "Groups" })).toBeInTheDocument()
      expect(within(sheet).getByRole("link", { name: "Imports" })).toBeInTheDocument()

      await user.click(within(sheet).getByRole("link", { name: "Imports" }))
      expect(await screen.findByRole("heading", { name: "Imports stub" })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe("/imports")
      expect(screen.queryByRole("dialog", { name: "More destinations" })).not.toBeInTheDocument()
    } finally {
      viewport.restore()
    }
  })

  it("closes the More sheet with Escape", async () => {
    const viewport = mockViewport(true)
    try {
      const user = userEvent.setup()
      renderTabs()

      await user.click(await screen.findByRole("button", { name: "More" }))
      expect(await screen.findByRole("dialog", { name: "More destinations" })).toBeInTheDocument()
      await user.keyboard("{Escape}")
      expect(screen.queryByRole("dialog", { name: "More destinations" })).not.toBeInTheDocument()
    } finally {
      viewport.restore()
    }
  })

  it("closes the More sheet and unlocks scroll when leaving the mobile layout", async () => {
    const viewport = mockViewport(true)
    try {
      const user = userEvent.setup()
      renderTabs()

      await user.click(await screen.findByRole("button", { name: "More" }))
      expect(await screen.findByRole("dialog", { name: "More destinations" })).toBeInTheDocument()
      expect(document.body.style.overflow).toBe("hidden")

      act(() => viewport.setMobile(false))
      expect(screen.queryByRole("dialog", { name: "More destinations" })).not.toBeInTheDocument()
      expect(document.body.style.overflow).toBe("")

      // Resizing back starts from a closed sheet, not a stale open one.
      act(() => viewport.setMobile(true))
      expect(screen.queryByRole("dialog", { name: "More destinations" })).not.toBeInTheDocument()
    } finally {
      viewport.restore()
    }
  })

  it("traps Tab focus inside the More sheet", async () => {
    const viewport = mockViewport(true)
    try {
      const user = userEvent.setup()
      renderTabs()

      await user.click(await screen.findByRole("button", { name: "More" }))
      const sheet = await screen.findByRole("dialog", { name: "More destinations" })
      expectSheetFocus(sheet)

      // Close -> Groups -> Imports -> wraps to Close.
      await user.tab()
      expect(document.activeElement).toHaveAccessibleName("Groups")
      await user.tab()
      expect(document.activeElement).toHaveAccessibleName("Imports")
      await user.tab()
      expect(document.activeElement).toHaveAccessibleName("Close")
      expectSheetFocus(sheet)

      await user.tab({ shift: true })
      expect(document.activeElement).toHaveAccessibleName("Imports")
      expectSheetFocus(sheet)
    } finally {
      viewport.restore()
    }
  })

  it("renders no tab bar on wide viewports", () => {
    const viewport = mockViewport(false)
    try {
      renderTabs()
      expect(screen.queryByRole("list", { name: "Primary destinations" })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument()
    } finally {
      viewport.restore()
    }
  })
})
