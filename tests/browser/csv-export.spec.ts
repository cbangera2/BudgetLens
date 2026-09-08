import { readFile } from "node:fs/promises"
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

test("filter to a category exports the filtered view with a slugged filename", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)
  await page.goto("/transactions?category=Groceries")
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: 'Quoted "Merchant"' })).toHaveCount(0)

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export CSV" }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/^transactions-groceries-.*\.csv$/)

  const filePath = await download.path()
  expect(filePath).toBeTruthy()
  const content = await readFile(filePath!, "utf8")
  const [header] = content.split("\n")
  expect(header).toBe(
    "Date,Description,Amount,Category,Transaction Type,Account Name,Account Type,Provider,Labels,Notes",
  )
  expect(content).toContain("Example Market, North")
  expect(content).toContain("Groceries")
  expect(content).not.toContain('Quoted "Merchant"')
})
