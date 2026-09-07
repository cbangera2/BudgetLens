import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(directory, "../fixtures/cashflow-forecast.csv")

test("cash-flow forecast projects recurring charges and cushion warnings", async ({ page }) => {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture)
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await expect(page.getByText("Preview ready. Review the counts before importing.")).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText("Imported 4 transactions rows.")).toBeVisible()

  await page.goto("/")
  const section = page.getByRole("region", { name: "Cash-flow forecast" })
  await expect(section).toBeVisible()
  await expect(
    section.getByRole("figure", { name: "Balance history and 90-day projection" }),
  ).toBeVisible()
  await expect(section.getByText("Projected balance", { exact: true }).first()).toBeVisible()
  await expect(section.locator(".recharts-line-curve")).toHaveCount(2)
  await expect(section.getByText("What this assumes")).toBeVisible()

  const breach = section.getByRole("alert")
  await expect(breach).toHaveText(/dip below \$200\.00/)
  await expect(section.getByText("recurring charge", { exact: false }).first()).toBeVisible()

  await section.getByLabel(/Low-balance cushion/).fill("10")
  await expect(section.getByText(/stay above \$10\.00/)).toBeVisible()
  const stored = await page.evaluate(() =>
    window.localStorage.getItem("budgetlens.cashflow.cushion.v1"),
  )
  expect(stored).toBe("1000")

  await section.getByLabel(/Low-balance cushion/).fill("5000")
  await expect(section.getByRole("alert")).toHaveText(/dip below \$5,000\.00/)
})
