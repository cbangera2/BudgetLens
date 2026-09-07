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

test("clicking a donut slice opens transactions filtered to that category", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)

  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Spending by category" })).toBeVisible()

  // The fixture has a single expense category, so the donut renders one slice.
  // A full-ring slice's bounding-box center falls in the donut hole, so click
  // the sector path directly instead of its (empty) center.
  const sectors = page.locator(".recharts-pie-sector")
  await expect(sectors).toHaveCount(1)
  await sectors.first().locator("path").first().dispatchEvent("click")

  await expect(page).toHaveURL(/\/transactions\?.*category=Groceries/)
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: 'Quoted "Merchant"' })).toBeHidden()
})

test("donut drilldown links are keyboard operable", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)

  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
  const nav = page.getByRole("navigation", { name: "View transactions for Spending by category" })
  await expect(nav).toBeVisible()

  const link = nav.getByRole("link", { name: "Groceries" })
  await link.focus()
  await expect(link).toBeFocused()
  await page.keyboard.press("Enter")

  await expect(page).toHaveURL(/\/transactions\?.*category=Groceries/)
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: 'Quoted "Merchant"' })).toBeHidden()
})
