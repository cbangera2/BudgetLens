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

test("detail back link preserves list filters", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)

  await page.goto(`/transactions?category=${encodeURIComponent("Groceries")}`)
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: 'Quoted "Merchant"' })).toBeHidden()

  await page.getByRole("link", { name: "Example Market, North" }).click()
  await expect(page).toHaveURL(/\/transactions\/.+/)
  await expect(page.getByRole("heading", { name: "Example Market, North" })).toBeVisible()
  await expect(page.getByRole("link", { name: "View import batch" })).toBeVisible()

  await page.locator("#main-content").getByRole("link", { name: "Transactions" }).click()
  await expect(page).toHaveURL(/\/transactions\?.*category=Groceries/)
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: 'Quoted "Merchant"' })).toBeHidden()
})

test("import results link to their filtered transaction batch", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)

  const statusView = page.getByRole("link", { name: "View current-transactions.csv", exact: true })
  await expect(statusView).toBeVisible()
  const statusHref = await statusView.getAttribute("href")
  expect(statusHref).toMatch(/\/transactions\?.*importBatch=.+/)

  await statusView.click()
  await expect(page).toHaveURL(/\/transactions\?.*importBatch=.+/)
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: 'Quoted "Merchant"' })).toBeVisible()

  await page.goto("/imports")
  const historyView = page.getByRole("link", {
    name: "View current-transactions.csv transactions",
    exact: true,
  })
  await expect(historyView).toBeVisible()
  const historyHref = await historyView.getAttribute("href")
  expect(historyHref).toMatch(/\/transactions\?.*importBatch=.+/)

  await historyView.click()
  await expect(page).toHaveURL(/\/transactions\?.*importBatch=.+/)
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()
})

test("import batch filter isolates rows from other imports", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)

  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture("transactions-page-one.json"))
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText(/Imported 2 .*rows?\./)).toBeVisible()

  await page.goto("/imports")
  const csvView = page.getByRole("link", {
    name: "View current-transactions.csv transactions",
  })
  await expect(csvView).toBeVisible()
  await csvView.click()
  await expect(page).toHaveURL(/\/transactions\?.*importBatch=.+/)
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Invented Corner Shop" })).toBeHidden()
})

test("representative empty states show guidance", async ({ page }) => {
  await page.goto("/imports")
  await expect(page.getByRole("heading", { name: "Import Credit Karma data" })).toBeVisible()
  await expect(
    page.getByText("Select CSV or JSON files above to preview your first import."),
  ).toBeVisible()

  await page.goto("/transactions")
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByText("No matching transactions")).toBeVisible()
  await expect(page.getByRole("link", { name: "upload a CSV file" })).toBeVisible()

  await page.goto("/transactions/does-not-exist")
  await expect(page.getByRole("heading", { name: "Transaction not found" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Back to transactions" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Open imports" })).toBeVisible()
})

test("edit dialog cancel returns focus to its trigger", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)

  await page.goto("/transactions")
  const editTrigger = page.getByRole("button", { name: "Edit Example Market, North" })
  await editTrigger.click()
  await expect(page.getByRole("dialog", { name: "Edit Example Market, North" })).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByRole("dialog", { name: "Edit Example Market, North" })).toHaveCount(0)
  await expect(editTrigger).toBeFocused()
})
