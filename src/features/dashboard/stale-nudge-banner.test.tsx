import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"

import type { ImportBatch } from "@/domain/models"

import { StaleDataNudge, StaleNudgeBanner } from "./stale-nudge-banner"
import { STALE_NUDGE_STORAGE_KEY, getStaleNudgeFreshness } from "./stale-nudge-freshness"

const NOW = new Date("2026-09-07T12:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000

function batch(importedAt: string, id = `batch-${importedAt}`): ImportBatch {
  return {
    id,
    kind: "transactions",
    sourceName: "synthetic-transactions.csv",
    sourceHash: `hash-${id}`,
    rowCount: 2,
    importedCount: 2,
    skippedCount: 0,
    replacedCount: 0,
    importedAt,
  }
}

function memoryStorage() {
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

function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <>
        <div data-testid="router-ready" />
        {ui}
      </>
    ),
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

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe("StaleNudgeBanner", () => {
  it("announces the stale variant politely with a day count and imports link", async () => {
    const freshness = getStaleNudgeFreshness(
      [batch(new Date(NOW.getTime() - 45 * DAY_MS).toISOString())],
      NOW,
    )
    if (freshness.variant !== "stale") throw new Error("synthetic stale freshness expected")
    renderWithRouter(<StaleNudgeBanner freshness={freshness} onDismiss={() => undefined} />)

    const banner = await screen.findByTestId("stale-nudge-banner")
    expect(banner.tagName).toBe("OUTPUT")
    expect(banner).toHaveAttribute("aria-live", "polite")
    expect(screen.getByRole("status")).toBe(banner)
    expect(banner).toHaveAttribute("data-variant", "stale")
    expect(banner).toHaveAttribute("data-days-since", "45")
    expect(banner).toHaveTextContent(/45 days since your last import/i)
    const link = screen.getByRole("link", { name: "Import fresh data" })
    expect(link).toHaveAttribute("href", "/imports")
  })

  it("uses reduced-motion-safe styling hooks and no animation", async () => {
    const freshness = getStaleNudgeFreshness(
      [batch(new Date(NOW.getTime() - 45 * DAY_MS).toISOString())],
      NOW,
    )
    if (freshness.variant !== "stale") throw new Error("synthetic stale freshness expected")
    renderWithRouter(<StaleNudgeBanner freshness={freshness} onDismiss={() => undefined} />)

    const banner = await screen.findByTestId("stale-nudge-banner")
    expect(banner.className).toContain("motion-reduce:animate-none")
    expect(banner.className).toContain("motion-reduce:transition-none")
    const tokens = banner.className.split(/\s+/)
    expect(tokens.filter((token) => token.startsWith("animate-"))).toEqual([])
  })

  it("renders the onboarding variant without a day count", async () => {
    const freshness = getStaleNudgeFreshness([], NOW)
    if (freshness.variant !== "empty") throw new Error("synthetic empty freshness expected")
    renderWithRouter(<StaleNudgeBanner freshness={freshness} onDismiss={() => undefined} />)

    const banner = await screen.findByTestId("stale-nudge-banner")
    expect(banner).toHaveAttribute("data-variant", "empty")
    expect(banner).not.toHaveAttribute("data-days-since")
    expect(banner).toHaveTextContent(/no imports yet/i)
    expect(banner).not.toHaveTextContent(/days since your last import/i)
    expect(screen.getByRole("link", { name: "Import fresh data" })).toHaveAttribute(
      "href",
      "/imports",
    )
  })
})

describe("StaleDataNudge", () => {
  it("hides fresh imports and shows stale ones", async () => {
    const storage = memoryStorage()
    const freshAt = new Date(NOW.getTime() - 5 * DAY_MS).toISOString()
    const { unmount } = renderWithRouter(
      <StaleDataNudge batches={[batch(freshAt)]} now={NOW} storage={storage} />,
    )
    await screen.findByTestId("router-ready")
    expect(screen.queryByTestId("stale-nudge-banner")).not.toBeInTheDocument()
    unmount()
    cleanup()

    renderWithRouter(
      <StaleDataNudge
        batches={[batch(new Date(NOW.getTime() - 45 * DAY_MS).toISOString())]}
        now={NOW}
        storage={memoryStorage()}
      />,
    )
    expect(await screen.findByTestId("stale-nudge-banner")).toBeInTheDocument()
  })

  it("persists dismissal and reappears for a new stale window", async () => {
    const user = userEvent.setup()
    const storage = memoryStorage()
    const firstAt = new Date(NOW.getTime() - 45 * DAY_MS).toISOString()
    const { unmount } = renderWithRouter(
      <StaleDataNudge batches={[batch(firstAt, "first")]} now={NOW} storage={storage} />,
    )
    expect(await screen.findByTestId("stale-nudge-banner")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /dismiss/i }))
    expect(screen.queryByTestId("stale-nudge-banner")).not.toBeInTheDocument()
    expect(storage.getItem(STALE_NUDGE_STORAGE_KEY)).toContain(firstAt)
    unmount()
    cleanup()

    renderWithRouter(
      <StaleDataNudge batches={[batch(firstAt, "first")]} now={NOW} storage={storage} />,
    )
    await screen.findByTestId("router-ready")
    expect(screen.queryByTestId("stale-nudge-banner")).not.toBeInTheDocument()
    cleanup()

    renderWithRouter(
      <StaleDataNudge
        batches={[batch(new Date(NOW.getTime() - 60 * DAY_MS).toISOString(), "second")]}
        now={NOW}
        storage={storage}
      />,
    )
    expect(await screen.findByTestId("stale-nudge-banner")).toBeInTheDocument()
  })

  it("shows the empty variant separately from the stale variant", async () => {
    const storage = memoryStorage()
    renderWithRouter(<StaleDataNudge batches={[]} now={NOW} storage={storage} />)
    const banner = await screen.findByTestId("stale-nudge-banner")
    expect(banner).toHaveAttribute("data-variant", "empty")
    expect(banner).toHaveTextContent(/no imports yet/i)
  })
})
