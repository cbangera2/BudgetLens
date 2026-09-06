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

test("shares the year-in-review card as a PNG download", async ({ page }) => {
  await importCsv(page, "year-review-2025.csv", 5)
  await importCsv(page, "year-review-net-worth.csv", 2)

  // Web Share and clipboard are neutered so the download fallback fires
  // deterministically; the share and clipboard rungs are covered by unit tests.
  await page.addInitScript(() => {
    for (const key of ["share", "canShare", "clipboard"] as const) {
      try {
        Object.defineProperty(window.navigator, key, { value: undefined, configurable: true })
      } catch {
        // Non-configurable in this engine: the download fallback still applies.
      }
    }
  })

  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Year in review" })).toBeVisible()

  const card = page.getByTestId("year-review-card")
  await expect(card).toBeVisible()
  await expect(card).toContainText("2025")
  await expect(card).toContainText("Top categories")
  await card.screenshot({ path: "test-results/year-review-card.png" })

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Share year in review" }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("budgetlens-year-review-2025.png")
})
