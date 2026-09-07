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

test("budget templates generate mapped goals once and skip on reapply", async ({ page }) => {
  await importCsv(page, "budget-templates.csv", 7)

  await page.goto("/budgets")
  await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible()

  // Pin the reporting period so the monthly prefix is deterministic.
  await page.getByLabel("Date").fill("2026-09-15")

  // Prefill monthly income from the detected three-month average ($3,000).
  await page.getByRole("button", { name: /Use average/ }).click()
  await expect(page.getByLabel("Monthly income")).toHaveValue("3000")

  // Pick the 50/30/20 preset and check the mapped preview.
  await page.getByRole("radio", { name: /Balanced 50\/30\/20/ }).check()
  const preview = page.getByRole("list", { name: "Template preview" })
  await expect(preview.getByText("Groceries")).toBeVisible()
  await expect(preview.getByText("Dining")).toBeVisible()
  await expect(preview.getByText("Everything else")).toBeVisible()
  await expect(preview.getByText("Savings")).toBeVisible()

  // Confirm: the generated goals are listed as budgets.
  await page.getByRole("button", { name: /Apply template/ }).click()
  await expect(page.getByText("Created 4 goals.")).toBeVisible()
  await expect(
    page.getByRole("link", { name: "View Groceries transactions for 2026-09" }),
  ).toHaveCount(1)
  await expect(
    page.getByRole("link", { name: "View Savings transactions for 2026-09" }),
  ).toHaveCount(1)

  // Reapply: everything is skipped, nothing is duplicated.
  await page.getByRole("button", { name: /Apply template/ }).click()
  await expect(page.getByText(/Created 0 goals\./)).toBeVisible()
  await expect(page.getByText(/Skipped 4/)).toBeVisible()
  await expect(
    page.getByRole("link", { name: "View Groceries transactions for 2026-09" }),
  ).toHaveCount(1)
  await expect(
    page.getByRole("link", { name: "View Savings transactions for 2026-09" }),
  ).toHaveCount(1)
})

test("custom template ratios must sum to 100", async ({ page }) => {
  await page.goto("/budgets")
  await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible()

  await page.getByLabel("Monthly income").fill("2000")
  await page.getByRole("radio", { name: /Custom ratio/ }).check()
  await page.getByLabel("Savings %").fill("10")
  await expect(page.getByRole("alert")).toContainText("must add up to 100")
})
