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
  await expect(page.getByText("Preview ready. Review the counts before importing.")).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText(new RegExp(`Imported ${expectedRows} .*rows?\\.`))).toBeVisible()
}

test("flag two categories, review the rollup, and export the tax CSV", async ({ page }) => {
  await importCsv(page, "tax-summary-2025.csv", 5)

  await page.goto("/tax-summary")
  await expect(page.getByRole("heading", { name: "Tax summary" })).toBeVisible()

  // Empty state guides toward flagging categories.
  await expect(
    page.getByText("No categories are flagged yet. Flag a category as a deductible expense"),
  ).toBeVisible()
  await page.screenshot({ path: "test-results/tax-summary-before.png" })

  // Flag two categories; charitable giving auto-matches by name.
  await page.getByLabel("Tax flag for Office Supplies").selectOption("deductible")
  await page.getByLabel("Tax flag for Freelance Income").selectOption("taxable")
  await page.getByLabel("Tax year").selectOption("2025")

  const report = page.getByRole("heading", { name: "Yearly report" }).locator("..").locator("..")
  await expect(report.getByText("Office Supplies")).toBeVisible()
  // $200.00 appears twice: the category row and the total-deductible row.
  await expect(report.getByText("$200.00").first()).toBeVisible()
  await expect(report.getByText("Total deductible")).toBeVisible()
  await expect(report.getByText("Charitable Donations")).toBeVisible()
  await expect(report.getByText("$150.00")).toBeVisible()
  await expect(report.getByText("$2,500.00")).toBeVisible()
  await expect(report.getByText("$2,150.00")).toBeVisible()
  // The unflagged bistro visit and the prior-year boundary row stay out.
  await expect(report.getByText("Dining")).toHaveCount(0)
  await expect(
    page.getByText("This is an informational summary only, not tax advice."),
  ).toBeVisible()
  await page.screenshot({ path: "test-results/tax-summary-after.png", fullPage: true })

  const downloadPromise = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export tax CSV" }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toBe("tax-summary-2025.csv")

  const filePath = await download.path()
  expect(filePath).toBeTruthy()
  const content = await readFile(filePath!, "utf8")
  const lines = content.trim().split("\n")
  expect(lines[0]).toBe("Section,Category,Amount")
  expect(content).toContain("Deductible,Office Supplies,200.00")
  expect(content).toContain("Charitable giving,Charitable Donations,150.00")
  expect(content).toContain("Taxable income,Freelance Income,2500.00")
  expect(content).toContain("Net,Taxable income minus deductions,2150.00")
  expect(lines).toHaveLength(5)
})
