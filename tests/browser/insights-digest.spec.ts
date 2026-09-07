import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(directory, "../fixtures/insights-movers.csv")

test("insights digest surfaces a clear mover with figures and links to the filtered view", async ({
  page,
}) => {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture)
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText("Imported 9 transactions rows.")).toBeVisible()

  await page.goto("/")
  const section = page.getByRole("region", { name: "Insights" })
  await expect(section).toBeVisible()

  // Groceries rose $80.00 (Aug) -> $200.00 (Sep): +$120.00, +150.0%.
  await expect(section.getByText("$80.00 → $200.00")).toBeVisible()
  await expect(section.getByText("+$120.00, +150.0%")).toBeVisible()
  // New merchant and possibly-ended subscription from the same two months.
  await expect(section.getByText("Insight Juniper Outfitters")).toBeVisible()
  await expect(section.getByText("Insight Iron Gym")).toBeVisible()

  await section
    .getByRole("link", { name: "View Groceries transactions for the current month" })
    .click()

  await expect(page).toHaveURL(/\/transactions\?.*category=Groceries/)
  await expect(page).toHaveURL(/from=2026-09-01/)
  await expect(page).toHaveURL(/to=2026-09-30/)
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Insight Neighborhood Market" })).toHaveCount(2)
  await expect(page.getByText("Showing 2 of 2 matching transactions.")).toBeVisible()
})
