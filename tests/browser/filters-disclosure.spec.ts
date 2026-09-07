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

test("filter bar collapses by default, expands, and still narrows results", async ({ page }) => {
  await importSearchViews(page)
  await openTransactions(page)

  // Collapsed by default: essentials visible, advanced controls hidden.
  await expect(page.getByLabel("Search")).toBeVisible()
  await expect(page.getByRole("button", { name: "Last 30 days" })).toBeVisible()
  await expect(page.getByRole("button", { name: "YTD" })).toBeVisible()
  await expect(page.getByRole("button", { name: "All" })).toBeVisible()
  const toggle = page.getByRole("button", { name: "More filters" })
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await expect(page.getByLabel("Saved views")).toBeHidden()
  await expect(page.getByRole("button", { name: "Merchant", exact: true })).toBeHidden()
  await expect(page.getByRole("button", { name: "Category", exact: true })).toBeHidden()
  await expect(page.getByRole("button", { name: "Clear filters" })).toBeHidden()
  await expect(page.getByText(/Tip: use amount/)).toBeHidden()

  // Expand: every control becomes reachable.
  await toggle.click()
  const collapseToggle = page.getByRole("button", { name: "Fewer filters" })
  await expect(collapseToggle).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByLabel("Saved views")).toBeVisible()
  await expect(page.getByRole("button", { name: "Merchant", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Category", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Account", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Clear filters" })).toBeVisible()
  await expect(page.getByText(/Tip: use amount/)).toBeVisible()

  // Apply a filter while expanded: results narrow and disclosure stays open.
  await page.getByLabel("Search").fill("Corner Deli")
  await expect(page).toHaveURL(/q=Corner/)
  await expect(page.getByRole("rowheader", { name: "Corner Deli", exact: true })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Old Corner Deli", exact: true })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Big Box Mart" })).toBeHidden()
  await expect(collapseToggle).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByLabel("Saved views")).toBeVisible()

  // Clearing from behind the disclosure restores every row.
  await page.getByRole("button", { name: "Clear filters" }).click()
  await expect(page.getByLabel("Search")).toHaveValue("")
  await expect(page.getByRole("rowheader", { name: "Big Box Mart" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Payroll ACME" })).toBeVisible()
})
