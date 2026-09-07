import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"

const STALE_NUDGE_STORAGE_KEY = "budgetlens.stale-nudge.v1"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => path.resolve(directory, "../fixtures", name)

const DAY_MS = 24 * 60 * 60 * 1000
const STALE_DAYS = 45

async function importCsv(page: Page, name: string, expectedRows: number) {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture(name))
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await expect(page.getByText("Preview ready. Review the counts before importing.")).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText(new RegExp(`Imported ${expectedRows} .*rows?\\.`))).toBeVisible()
}

async function backdateImports(page: Page, daysAgo: number) {
  const oldIso = new Date(Date.now() - daysAgo * DAY_MS).toISOString()
  const updated = await page.evaluate(async (importedAt: string) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("budgetlens")
      request.addEventListener("success", () => resolve(request.result))
      request.addEventListener("error", () => reject(request.error))
    })
    try {
      const rows = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const transaction = database.transaction("imports", "readonly")
        const store = transaction.objectStore("imports")
        const request = store.getAll()
        request.addEventListener("success", () =>
          resolve(request.result as Array<Record<string, unknown>>),
        )
        request.addEventListener("error", () => reject(request.error))
      })
      if (rows.length === 0) return 0
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("imports", "readwrite")
        transaction.addEventListener("complete", () => resolve())
        transaction.addEventListener("error", () => reject(transaction.error))
        transaction.addEventListener("abort", () => reject(transaction.error))
        const store = transaction.objectStore("imports")
        for (const row of rows) store.put({ ...row, importedAt })
      })
      return rows.length
    } finally {
      database.close()
    }
  }, oldIso)
  expect(updated).toBeGreaterThan(0)
  return oldIso
}

test("stale import shows the nudge with day count, dismisses, and stays dismissed", async ({
  page,
}) => {
  await importCsv(page, "current-transactions.csv", 2)
  await page.evaluate((key: string) => window.localStorage.removeItem(key), STALE_NUDGE_STORAGE_KEY)
  await backdateImports(page, STALE_DAYS)

  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
  const banner = page.getByTestId("stale-nudge-banner")
  await expect(banner).toBeVisible()
  await expect(banner).toHaveAttribute("data-variant", "stale")
  await expect(banner).toContainText(new RegExp(`${STALE_DAYS} days since your last import`))
  await expect(banner.getByRole("link", { name: "Import fresh data" })).toHaveAttribute(
    "href",
    "/imports",
  )
  await expect(banner).toHaveAttribute("aria-live", "polite")

  await banner.getByRole("button", { name: /dismiss/i }).click()
  await expect(banner).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
  await expect(page.getByTestId("stale-nudge-banner")).toHaveCount(0)
})

test("fresh import hides the nudge", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)
  await page.evaluate((key: string) => window.localStorage.removeItem(key), STALE_NUDGE_STORAGE_KEY)

  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
  await expect(page.getByTestId("stale-nudge-banner")).toHaveCount(0)
})

test("empty store shows the onboarding variant pointing at imports", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
  await page.evaluate((key: string) => window.localStorage.removeItem(key), STALE_NUDGE_STORAGE_KEY)
  await page.reload()
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()

  const banner = page.getByTestId("stale-nudge-banner")
  await expect(banner).toBeVisible()
  await expect(banner).toHaveAttribute("data-variant", "empty")
  await expect(banner).toContainText(/no imports yet/i)
  await expect(banner).not.toContainText(/days since your last import/i)
  await expect(banner.getByRole("link", { name: "Import fresh data" })).toHaveAttribute(
    "href",
    "/imports",
  )
})
