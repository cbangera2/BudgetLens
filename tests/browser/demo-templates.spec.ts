import { expect, test } from "@playwright/test"

// Fresh profile (empty localStorage and IndexedDB) models a first launch.
// The shared storageState preset is disabled here so the welcome screen appears.
test.use({ storageState: { cookies: [], origins: [] } })

test("freelancer template seeds its dataset once, then never shows welcome again", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.getByTestId("onboarding-screen")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Welcome to BudgetLens" })).toBeVisible()

  // Template picker lists every persona with a one-line description.
  await expect(page.getByTestId("demo-template-golden")).toBeChecked()
  await expect(
    page.getByText("Balanced sample with paychecks, bills, and a summer trip."),
  ).toBeVisible()
  await expect(
    page.getByText("Tight budget with part-time pay and lots of subscriptions."),
  ).toBeVisible()
  await expect(
    page.getByText("Irregular client income with quarterly tax set-asides."),
  ).toBeVisible()
  await expect(page.getByText("Groceries-heavy household with shared group costs.")).toBeVisible()

  await page.getByLabel(/Freelancer/).check()
  await expect(page.getByTestId("demo-template-freelancer")).toBeChecked()

  await page.getByRole("button", { name: "Explore demo data" }).click()

  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByTestId("demo-banner")).toBeVisible()
  await expect(page.getByTestId("onboarding-screen")).toHaveCount(0)

  // Freelancer dataset made it to the store.
  await page.getByRole("link", { name: "Transactions", exact: true }).click()
  await expect(
    page.getByRole("rowheader", { name: "Bluebird Design Invoice" }).first(),
  ).toBeVisible({ timeout: 30_000 })

  await page.reload()
  await expect(page.getByTestId("onboarding-screen")).toHaveCount(0)
  await expect(page.getByTestId("demo-banner")).toBeVisible()
})
