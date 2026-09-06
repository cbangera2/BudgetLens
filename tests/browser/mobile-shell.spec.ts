import { expect, test, type Page } from "@playwright/test"

/**
 * Mobile shell pass: bottom tab bar (5 tabs + More), bottom sheets for the
 * overflow menu / assistant / filters. Viewport-branched so the same spec
 * stays green on the desktop project (sidebar, no tab bar) and the mobile
 * project (tab bar, sheets).
 */

function isMobileLayout(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 1024
}

/**
 * Start past the first-run onboarding gate (fresh contexts land on it since
 * the sibling onboarding feature). Chooses "Start empty" for a clean store,
 * then navigates to the target route. Idempotent when the gate is absent
 * (e.g. CI's returning-user storage state).
 */
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

test("primary navigation adapts to the viewport", async ({ page }) => {
  await startBeyondOnboarding(page, "/")
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible()

  if (isMobileLayout(page)) {
    await expect(page.getByRole("button", { name: "More" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Overview" })).toBeVisible()
  } else {
    await expect(page.getByRole("button", { name: "More" })).toBeHidden()
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible()
  }
})

test("tab bar navigates tabs and More-sheet destinations", async ({ page }) => {
  test.skip(!isMobileLayout(page), "mobile layout only")
  await startBeyondOnboarding(page, "/")

  await page.getByRole("link", { name: "Transactions" }).click()
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()

  await page.getByRole("link", { name: "Budgets" }).click()
  await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible()

  await page.getByRole("button", { name: "More" }).click()
  const sheet = page.getByRole("dialog", { name: "More destinations" })
  await expect(sheet).toBeVisible()
  await sheet.getByRole("link", { name: "Groups" }).click()
  await expect(page.getByRole("heading", { name: "Groups" })).toBeVisible()
  await expect(sheet).toBeHidden()

  await page.getByRole("button", { name: "More" }).click()
  await expect(page.getByRole("dialog", { name: "More destinations" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "More destinations" })).toBeHidden()
})

test("assistant panel docks as a bottom sheet on small viewports", async ({ page }) => {
  test.skip(!isMobileLayout(page), "mobile layout only")
  await startBeyondOnboarding(page, "/")

  // The mobile project emulates a touch-first device.
  expect(await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)).toBe(true)

  await page.locator("button[title='Ask about your finances']").click()
  const panel = page.locator("section[aria-label='BudgetLens assistant']")
  await expect(panel).toBeVisible()

  const box = await panel.boundingBox()
  const viewport = page.viewportSize()
  expect(box).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (box && viewport) {
    // Bottom-anchored, full-bleed sheet rather than a floating card.
    expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 2)
    expect(box.x).toBeLessThanOrEqual(2)
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 4)
  }

  await panel.getByRole("button", { name: "Close assistant" }).click()
  await expect(panel).toBeHidden()
})

test("transaction filters dock above the tab bar on small viewports", async ({ page }) => {
  test.skip(!isMobileLayout(page), "mobile layout only")
  await startBeyondOnboarding(page, "/transactions")

  const search = page.getByLabel("Search")
  await expect(search).toBeVisible()
  const card = page.locator("#main-content section", { has: search })
  await expect(card).toHaveCount(1)
  await expect(card).toHaveCSS("position", "sticky")
})
