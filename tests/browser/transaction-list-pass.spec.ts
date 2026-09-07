import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => path.resolve(directory, "../fixtures", name)
const SIDECAR_KEY = "budgetlens.receipts.sidecar.v1"

async function importCsv(page: Page, name: string, expectedRows: number) {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture(name))
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText(new RegExp(`Imported ${expectedRows} .*rows?\\.`))).toBeVisible()
}

async function merchantOrder(page: Page): Promise<string[]> {
  return page.locator("tbody tr th[scope='row'] a").allTextContents()
}

test("bulk recategorize updates every selected transaction", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)
  await page.goto("/transactions")
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()

  await page.getByLabel("Select all on page").check()
  await expect(page.getByLabel("Bulk actions")).toBeVisible()
  await expect(page.getByText("2 of 2 selected")).toBeVisible()

  await page.getByLabel("Recategorize").click()
  await page.getByRole("option", { name: "Income", exact: true }).click()
  await expect(page.getByLabel("Bulk actions")).toHaveCount(0)

  await page.goto("/transactions?category=Income")
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: 'Quoted "Merchant"' })).toBeVisible()

  await page.goto("/transactions?category=Groceries")
  await expect(page.getByText("No matching transactions")).toBeVisible()
})

test("column headers toggle date and merchant sort order", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)
  await page.goto("/transactions")
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()

  // Default base sort is newest first: Quoted Merchant (01-04) before Example (01-03).
  // Order reads are polled: locator.click() returns after dispatch, not after
  // React commits the re-render.
  await expect
    .poll(async () => merchantOrder(page))
    .toEqual(['Quoted "Merchant"', "Example Market, North"])

  await page.getByRole("button", { name: "Sort by date" }).click()
  await expect
    .poll(async () => merchantOrder(page))
    .toEqual(["Example Market, North", 'Quoted "Merchant"'])
  await expect(page.locator("thead th").filter({ hasText: "Date" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  )

  await page.getByRole("button", { name: /Sort by date/ }).click()
  await expect
    .poll(async () => merchantOrder(page))
    .toEqual(['Quoted "Merchant"', "Example Market, North"])

  await page.getByRole("button", { name: /Sort by date/ }).click()
  await expect(page.locator("thead th").filter({ hasText: "Date" })).toHaveAttribute(
    "aria-sort",
    "none",
  )
  await expect
    .poll(async () => merchantOrder(page))
    .toEqual(['Quoted "Merchant"', "Example Market, North"])

  await page.getByRole("button", { name: "Sort by merchant" }).click()
  await expect
    .poll(async () => merchantOrder(page))
    .toEqual(["Example Market, North", 'Quoted "Merchant"'])

  await page.getByRole("button", { name: /Sort by merchant/ }).click()
  await expect
    .poll(async () => merchantOrder(page))
    .toEqual(['Quoted "Merchant"', "Example Market, North"])
})

test("rows show relative dates, running balances, and receipt badges", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)
  await page.goto("/transactions")
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()

  // Relative date beside the absolute value.
  await expect(
    page.getByText(
      /^(today|yesterday|tomorrow|\d+ days? ago|in \d+ days?|\d+ months? ago|in \d+ months?|\d+ years? ago)$/,
    ),
  ).not.toHaveCount(0)

  // Per-account running balance: Everyday Checking holds -42.50 then +1250.00,
  // so the newer row carries 1207.50 regardless of viewport (cell may be
  // responsive-hidden on mobile, so assert DOM presence, not visibility).
  await expect(page.locator("th", { hasText: "Balance" })).toHaveCount(1)
  await expect(page.locator("span[title^='Running balance']")).toHaveCount(2)
  await expect(
    page.locator("span[title^='Running balance']", { hasText: "$1,207.50" }),
  ).toHaveCount(1)

  // Seed one receipt reference for the first transaction, then reload.
  const href = await page.locator("tbody tr th[scope='row'] a").first().getAttribute("href")
  const transactionId = href?.split("/").pop()
  expect(transactionId).toBeTruthy()
  await page.evaluate(
    ([key, id]) =>
      window.localStorage.setItem(
        key,
        JSON.stringify({
          [id as string]: [
            {
              hash: "a".repeat(64),
              mimeType: "image/png",
              sizeBytes: 1,
              width: 1,
              height: 1,
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
      ),
    [SIDECAR_KEY, transactionId],
  )
  await page.reload()
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()

  const badge = page.getByRole("link", { name: /View receipt for/ })
  await expect(badge).toBeVisible()
  await expect(badge.getByText(/Receipt/)).toBeVisible()
  await badge.click()
  await expect(page).toHaveURL(/\/transactions\/.+/)
  await expect(page.getByText("Photos attached to this transaction.")).toBeVisible()
})
