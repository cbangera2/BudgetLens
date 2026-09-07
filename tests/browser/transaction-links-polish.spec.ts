import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test, type Locator, type Page } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => path.resolve(directory, "../fixtures", name)

// Keyboard activation instead of coordinate clicks for transactions-table
// targets: on narrow viewports scrolled rows can sit underneath sticky
// overlays and pointer hit-testing flakes (same pattern as receipts.spec.ts).
async function activate(target: Locator) {
  await target.press("Enter")
}

async function importCsv(page: Page, name: string, expectedRows: number) {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture(name))
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText(new RegExp(`Imported ${expectedRows} .*rows?\\.`))).toBeVisible()
}

test("opens transaction detail directly by URL and handles unknown ids", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)

  await page.goto("/transactions")
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()

  const detailLink = page.getByRole("link", { name: "Example Market, North" })
  await expect(detailLink).toBeVisible()
  await activate(detailLink)
  await expect(page).toHaveURL(/\/transactions\/.+/)
  await expect(page.getByRole("heading", { name: "Example Market, North" })).toBeVisible()
  await expect(page.getByText("Full fields for this transaction.")).toBeVisible()
  await expect(page.getByText("Receipt photos")).toBeVisible()

  const detailUrl = page.url()
  await page.reload()
  await expect(page.getByRole("heading", { name: "Example Market, North" })).toBeVisible()

  expect(detailUrl).toMatch(/\/transactions\/.+/)

  await page.goto("/transactions/does-not-exist")
  await expect(page.getByRole("heading", { name: "Transaction not found" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Back to transactions" })).toBeVisible()
})

test("links merchant and category facets to a pre-filtered transactions view", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)

  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()

  const recent = page.getByText("Latest activity by date.").locator("..").locator("..")
  await expect(recent.getByRole("link", { name: "Example Market, North" })).toBeVisible()

  await recent.getByRole("link", { name: "Groceries" }).click()
  await expect(page).toHaveURL(/\/transactions\?.*category=Groceries/)
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()

  await page.goto("/transactions")
  const merchantLink = page.getByRole("link", { name: "Example Market, North" })
  await activate(merchantLink)
  await expect(page).toHaveURL(/\/transactions\/.+/)
  await page.getByRole("link", { name: "Same merchant" }).click()
  await expect(page).toHaveURL(/\/transactions\?.*merchant=Example/)
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()
})

test("clearing a URL-backed merchant filter stops filtering", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)

  await page.goto(`/transactions?merchant=${encodeURIComponent("Example Market, North")}`)
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: 'Quoted "Merchant"' })).toBeHidden()

  await page.getByRole("button", { name: "Merchant", exact: true }).click()
  await page.getByRole("button", { name: "Clear merchant" }).click()
  await expect(page.getByRole("rowheader", { name: 'Quoted "Merchant"' })).toBeVisible()
  await expect(page).not.toHaveURL(/merchant=/)
})

test("budgets category combobox suggests existing categories but accepts custom text", async ({
  page,
}) => {
  await importCsv(page, "current-transactions.csv", 2)

  await page.goto("/budgets")
  await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible()
  await page.getByRole("button", { name: "Add goal" }).click()

  const categoryInput = page.getByLabel("Category", { exact: true })
  await expect(categoryInput).toBeVisible()
  await expect(categoryInput).toHaveAttribute("list", "goal-category-options")

  const options = page.locator("#goal-category-options option")
  await expect(page.locator('#goal-category-options option[value="Groceries"]')).toHaveCount(1)
  await expect(page.locator('#goal-category-options option[value="Income"]')).toHaveCount(1)
  await expect(options).toHaveCount(2)

  await categoryInput.fill("Neighborhood Custom")
  await page.getByLabel("Goal amount").fill("123.45")
  await page.getByRole("button", { name: "Save goal", exact: true }).click()
  await expect(page.getByText("Neighborhood Custom")).toBeVisible()
})
