import { expect, test, type Page } from "@playwright/test"

/**
 * Sidebar space reclaim: narrower desktop sidebar, wider content grid,
 * tighter sidebar↔content gap, denser nav spacing. Desktop-only by
 * construction (lg: prefixes / lg-hidden containers); mobile is a no-op.
 *
 * Baselines measured on origin/main at 1440x900, expanded sidebar:
 *   grid max-width 1280px, sidebar 208px, gap 32px → #main-content 992px.
 * After:
 *   grid max-width 1408px, sidebar 176px, gap 24px → #main-content 1160px.
 * Collapsed: 1144px → 1288px at the same viewport.
 */

const BASELINE_EXPANDED_MAIN_WIDTH = 992
const BASELINE_COLLAPSED_MAIN_WIDTH = 1144

function isMobileLayout(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 1024
}

async function startBeyondOnboarding(page: Page, url: string): Promise<void> {
  await page.goto("/")
  const gate = page.getByTestId("onboarding-screen")
  const shell = page.getByRole("navigation", { name: "Primary" })
  await expect(gate.or(shell)).toBeVisible()
  if (await gate.isVisible()) {
    await page.getByRole("button", { name: "Start empty" }).click()
    await expect(shell).toBeVisible()
  }
  if (url !== "/") await page.goto(url)
}

async function mainContentWidth(page: Page): Promise<number> {
  const box = await page.locator("#main-content").boundingBox()
  expect(box).not.toBeNull()
  return box?.width ?? 0
}

test("desktop reclaims sidebar space without breaking collapse or focus", async ({ page }) => {
  test.skip(isMobileLayout(page), "desktop layout only")
  await page.setViewportSize({ width: 1440, height: 900 })
  await startBeyondOnboarding(page, "/")
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()

  // Normalize to expanded: returning-user storage has no sidebar pref, but a
  // prior run in the same worker could have persisted a collapsed state.
  if (await page.getByRole("button", { name: "Expand navigation" }).count()) {
    await page.getByRole("button", { name: "Expand navigation" }).click()
    await expect(page.getByRole("button", { name: "Collapse navigation" })).toBeVisible()
  }

  const expandedWidth = await mainContentWidth(page)
  expect(expandedWidth).toBeGreaterThan(BASELINE_EXPANDED_MAIN_WIDTH)
  // Locks the full reclaim (max-width 1408 + 176px sidebar + 24px gap).
  expect(expandedWidth).toBeGreaterThanOrEqual(1150)

  // Sidebar itself narrowed (was 208px on baseline).
  const navBox = await page.getByRole("navigation", { name: "Primary" }).boundingBox()
  expect(navBox).not.toBeNull()
  expect(navBox?.width ?? 0).toBeLessThan(208)

  // Collapse toggle still works and still reclaims more space.
  await page.getByRole("button", { name: "Collapse navigation" }).click()
  await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible()
  const collapsedWidth = await mainContentWidth(page)
  expect(collapsedWidth).toBeGreaterThan(BASELINE_COLLAPSED_MAIN_WIDTH)
  expect(collapsedWidth).toBeGreaterThan(expandedWidth)

  // Focus states intact: nav links remain keyboard-focusable.
  const overview = page.getByRole("link", { name: "Overview" })
  await overview.focus()
  await expect(overview).toBeFocused()

  // Toggle back to expanded.
  await page.getByRole("button", { name: "Expand navigation" }).click()
  await expect(page.getByRole("button", { name: "Collapse navigation" })).toBeVisible()
})

test("mobile tab bar is unchanged below the desktop breakpoint", async ({ page }) => {
  test.skip(!isMobileLayout(page), "mobile layout only")
  await startBeyondOnboarding(page, "/")

  // Tab bar still renders (5 tabs + More sheet entry).
  await expect(page.getByRole("button", { name: "More" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Overview" })).toBeVisible()
  await expect(page.locator("#main-content")).toBeVisible()

  // Desktop widening is a no-op here: grid cap stays at max-w-7xl (1280px)
  // and the primary nav stays bottom-pinned.
  const cap = await page.evaluate(() => {
    const main = document.querySelector("#main-content")
    const grid = main?.parentElement
    return {
      maxWidth: grid ? getComputedStyle(grid).maxWidth : null,
      navPosition: getComputedStyle(document.querySelector('nav[aria-label="Primary"]') as Element)
        .position,
    }
  })
  expect(cap.maxWidth).toBe("1280px")
  expect(cap.navPosition).toBe("fixed")
})
