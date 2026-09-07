import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(directory, "../fixtures/search-views.csv")

async function importSearchViews(page: Page) {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture)
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText("Imported 4 transactions rows.")).toBeVisible()
}

async function openTransactions(page: Page) {
  await page.getByRole("link", { name: "Transactions", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Big Box Mart" })).toBeVisible()
}

test("operator search narrows transaction rows", async ({ page }) => {
  await importSearchViews(page)
  await openTransactions(page)
  await page.getByRole("button", { name: "More filters" }).click()

  await page.getByRole("searchbox", { name: "Search" }).fill("amount:>100")
  await expect(page).toHaveURL(/q=amount/)
  await expect(page.getByText("Amount > 100")).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Big Box Mart" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Payroll ACME" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Corner Deli", exact: true })).toBeHidden()

  await page.getByRole("searchbox", { name: "Search" }).fill("merchant:Corner")
  await expect(page.getByRole("rowheader", { name: "Corner Deli", exact: true })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Old Corner Deli", exact: true })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Big Box Mart" })).toBeHidden()

  // Unknown operators fall back to plain text: an empty state, never an error.
  await page.getByRole("searchbox", { name: "Search" }).fill("frobnicate:xyz")
  await expect(page.getByText("No matching transactions")).toBeVisible()
})

test("date presets drive the from/to filters", async ({ page }) => {
  await importSearchViews(page)
  await openTransactions(page)

  await page.getByRole("button", { name: "YTD" }).click()
  const year = (await page.getByLabel("To date").inputValue()).slice(0, 4)
  await expect(page).toHaveURL(new RegExp(`from=${year}-01-01`))
  await expect(page.getByRole("rowheader", { name: "Old Corner Deli", exact: true })).toBeHidden()

  await page.getByRole("button", { name: "Last 30 days" }).click()
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/)

  await page.getByRole("button", { name: "All" }).click()
  await expect(page).not.toHaveURL(/from=/)
  await expect(page.getByRole("rowheader", { name: "Old Corner Deli", exact: true })).toBeVisible()
})

test("saved views persist across reloads until deleted", async ({ page }) => {
  await importSearchViews(page)
  await openTransactions(page)
  await page.getByRole("button", { name: "More filters" }).click()

  await page.getByRole("searchbox", { name: "Search" }).fill("amount:>100")
  await page.getByLabel("Saved views").fill("Big spend")
  await page.getByRole("button", { name: "Save view" }).click()
  await expect(page.getByRole("button", { name: "Apply Big spend view" })).toBeVisible()

  await page.getByRole("button", { name: "Clear filters" }).click()
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("")
  await expect(page.getByRole("rowheader", { name: "Corner Deli", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Apply Big spend view" }).click()
  await expect(page.getByRole("searchbox", { name: "Search" })).toHaveValue("amount:>100")
  await expect(page.getByRole("rowheader", { name: "Corner Deli", exact: true })).toBeHidden()

  await page.getByRole("button", { name: "Rename Big spend view" }).click()
  await page.getByLabel("New name for Big spend").fill("Huge spend")
  await page.getByRole("button", { name: "Confirm rename" }).click()
  await expect(page.getByRole("button", { name: "Apply Huge spend view" })).toBeVisible()

  await page.reload()
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await page.getByRole("button", { name: "More filters" }).click()
  await expect(page.getByRole("button", { name: "Apply Huge spend view" })).toBeVisible()

  await page.getByRole("button", { name: "Delete Huge spend view" }).click()
  await expect(page.getByRole("button", { name: "Apply Huge spend view" })).toHaveCount(0)
})
