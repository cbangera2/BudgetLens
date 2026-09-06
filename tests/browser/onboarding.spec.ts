import { expect, test } from "@playwright/test"

// Each test gets a fresh browser context (empty localStorage and IndexedDB),
// which models a first launch. The shared storageState preset is disabled here
// so the welcome screen appears.
test.use({ storageState: { cookies: [], origins: [] } })

test("demo choice seeds the sample budget once, then never shows welcome again", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.getByTestId("onboarding-screen")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Welcome to BudgetLens" })).toBeVisible()

  await page.getByRole("button", { name: "Explore demo data" }).click()

  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByTestId("demo-banner")).toBeVisible()
  await expect(page.getByTestId("onboarding-screen")).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
  await expect(page.getByTestId("onboarding-screen")).toHaveCount(0)
  await expect(page.getByTestId("demo-banner")).toBeVisible()
})

test("empty choice proceeds with a clean store and no demo banner", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("onboarding-screen")).toBeVisible()

  await page.getByRole("button", { name: "Start empty" }).click()

  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
  await expect(page.getByTestId("demo-banner")).toHaveCount(0)
  await expect(page.getByTestId("onboarding-screen")).toHaveCount(0)

  await page.getByRole("link", { name: "Transactions", exact: true }).click()
  await expect(page.getByText("Showing 0 of 0 matching transactions.")).toBeVisible()
  await expect(page.getByText("No matching transactions")).toBeVisible()

  await page.reload()
  await expect(page.getByTestId("onboarding-screen")).toHaveCount(0)
  await expect(page.getByTestId("demo-banner")).toHaveCount(0)
})

test("import choice routes to the imports page and remembers the decision", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("onboarding-screen")).toBeVisible()

  await page.getByRole("button", { name: "Import my files" }).click()

  await expect(page).toHaveURL(/\/imports/)
  await expect(page.getByRole("heading", { name: "Import Credit Karma data" })).toBeVisible()
  await expect(page.getByTestId("demo-banner")).toHaveCount(0)

  await page.reload()
  await expect(page.getByTestId("onboarding-screen")).toHaveCount(0)
  await expect(page).toHaveURL(/\/imports/)
})
