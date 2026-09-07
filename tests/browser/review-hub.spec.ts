import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(directory, "../fixtures/review-hub.csv")

async function importReviewFixture(page: Page) {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture)
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await expect(page.getByText("Preview ready. Review the counts before importing.")).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText("Imported 7 transactions rows.")).toBeVisible()
}

test("review hub aggregates detection queues and links into each manager", async ({ page }) => {
  await importReviewFixture(page)

  await page.goto("/review")
  await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible()

  await expect(page.getByTestId("review-count-transfers")).toHaveText("1")
  await expect(page.getByTestId("review-count-subscriptions")).toHaveText("1")
  await expect(page.getByTestId("review-count-uncategorized")).toHaveText("2")

  const subscriptions = page.getByRole("region", { name: "Subscriptions" })
  await expect(subscriptions.getByText("Synthetic Review Stream")).toBeVisible()

  await page.getByRole("link", { name: "Open transfers queue" }).click()
  await expect(page).toHaveURL(/\/review#review-transfers/)
  await expect(
    page
      .getByRole("region", { name: "Transfers" })
      .getByRole("heading", { name: "Transfers", exact: true }),
  ).toBeVisible()

  await page.goto("/review")
  await page.getByRole("link", { name: "View subscriptions" }).click()
  await expect(page).toHaveURL(/\/review#review-subscriptions/)
  await expect(page.getByRole("region", { name: "Subscriptions" })).toBeVisible()

  await page.getByRole("link", { name: "Manage rules" }).click()
  await expect(page).toHaveURL(/\/imports/)
  await expect(page.getByRole("heading", { name: "Transaction rules" })).toBeVisible()

  await page.goto("/review")
  await page.getByRole("link", { name: "Triage uncategorized" }).click()
  await expect(page).toHaveURL(/\/transactions/)
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible()
})

test("review hub counts a newly added transaction rule", async ({ page }) => {
  await importReviewFixture(page)

  await page.goto("/review")
  await expect(page.getByTestId("review-count-rules")).toHaveText("0")

  await page.goto("/imports")
  await page.getByRole("button", { name: "Add rule" }).click()
  await page.getByLabel("Merchant contains").fill("corner bakery")
  await page.getByLabel("Rule category").fill("Dining")
  await page
    .getByRole("form", { name: "Add transaction rule" })
    .getByRole("button", { name: "Add rule" })
    .click()
  await expect(page.getByText('merchant contains "corner bakery" → Dining')).toBeVisible()

  await page.goto("/review")
  await expect(page.getByTestId("review-count-rules")).toHaveText("1")
})

test("review hub shows guidance links when every queue is empty", async ({ page }) => {
  await page.goto("/review")
  await expect(page.getByRole("heading", { name: "You are all caught up" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Import transactions" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Browse transactions" })).toBeVisible()
  await expect(page.getByTestId("review-count-transfers")).toHaveText("0")
  await expect(page.getByTestId("review-count-subscriptions")).toHaveText("0")
})
