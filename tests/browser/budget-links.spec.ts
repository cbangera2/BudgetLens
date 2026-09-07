import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => path.resolve(directory, "../fixtures", name)

async function importCsv(page: Page, name: string, expectedRows: number) {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture(name))
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText(new RegExp(`Imported ${expectedRows} .*rows?\\.`))).toBeVisible()
}

test("budget progress links to backing transactions for the current period", async ({ page }) => {
  await importCsv(page, "budget-links.csv", 4)

  await page.goto("/budgets")
  await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible()

  // Pin the reporting period to September 2026 so the monthly prefix is deterministic.
  await page.getByLabel("Date").fill("2026-09-15")

  await page.getByRole("button", { name: "Add goal" }).click()
  await page.getByLabel("Category", { exact: true }).fill("Groceries")
  await page.getByLabel("Goal amount").fill("500")
  await page.getByRole("button", { name: "Save goal", exact: true }).click()
  await expect(page.getByText("2026-09 · monthly")).toBeVisible()

  // Progress counts the two September Groceries expenses ($50 + $30 = $80).
  await expect(page.getByText("$80.00 spent")).toBeVisible()

  // Click the progress bar/row link (real link, keyboard-accessible).
  const progressLink = page.getByRole("link", {
    name: "View Groceries transactions for 2026-09",
  })
  await expect(progressLink).toBeVisible()
  await progressLink.click()

  // Filtered to the budget's category + current period via existing params.
  await expect(page).toHaveURL(/\/transactions\?.*category=Groceries/)
  await expect(page).toHaveURL(/q=2026-09/)
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()

  // Exactly the counted rows: the two September Groceries expenses.
  // Notes carry the period prefix so the existing `q` search filters to the
  // period (search covers notes); out-of-period and other-category rows hide.
  await expect(page.getByRole("rowheader", { name: "Budgetlink Sep Groceries One" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Budgetlink Sep Groceries Two" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Budgetlink Aug Groceries Out" })).toBeHidden()
  await expect(page.getByRole("rowheader", { name: "Budgetlink Sep Dining Other" })).toBeHidden()
  await expect(page.getByText("Showing 2 of 2 matching transactions.")).toBeVisible()
})
