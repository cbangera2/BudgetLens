import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => path.resolve(directory, "../fixtures", name)

async function importCsv(page: Page, name: string, expectedRows: number) {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture(name))
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await expect(page.getByText("Preview ready. Review the counts before importing.")).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText(new RegExp(`Imported ${expectedRows} .*rows?\\.`))).toBeVisible()
}

test("deleting a transaction toasts Undo and restores the row", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)

  await page.getByRole("link", { name: "Transactions", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  const row = page.getByRole("rowheader", { name: "Example Market, North" })
  await expect(row).toBeVisible()

  await page.getByRole("button", { name: "Delete Example Market, North" }).click()
  const dialog = page.getByRole("alertdialog", { name: "Delete transaction?" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Delete" }).click()

  await expect(row).toHaveCount(0)
  const toast = page.locator("[data-sonner-toast]", { hasText: "Transaction deleted" })
  await expect(toast).toBeVisible()
  await expect(toast.getByRole("button", { name: "Undo" })).toBeVisible()

  await toast.getByRole("button", { name: "Undo" }).click()
  await expect(row).toBeVisible()
  await expect(
    page.locator("[data-sonner-toast]", { hasText: "Transaction restored" }),
  ).toBeVisible()
})
