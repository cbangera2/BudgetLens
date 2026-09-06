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

test("sets a net-worth goal and shows the target line with pace projection", async ({ page }) => {
  await importCsv(page, "net-worth.csv", 2)
  await importCsv(page, "investments.csv", 2)

  await page.getByRole("link", { name: "Net worth" }).click()
  await expect(page.getByRole("heading", { name: "Net worth" })).toBeVisible()
  await page.getByRole("button", { name: "All" }).click()
  await expect(page.getByRole("heading", { name: "Net-worth goal" })).toBeVisible()
  await expect(page.locator(".recharts-area-curve")).toHaveCount(2)

  await page.getByLabel("Target amount").fill("20000")
  await page.getByLabel("Target date").fill("2030-12-31")
  await page.getByRole("button", { name: "Save goal" }).click()

  await expect(page.locator(".recharts-area-curve")).toHaveCount(3)
  await expect(page.getByText("Target", { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/Current pace/)).toBeVisible()
  await expect(page.getByText(/Projected to reach the target/)).toBeVisible()
  await expect(page.getByText(/Required pace/)).toBeVisible()

  await page.reload()
  await expect(page.getByRole("heading", { name: "Net-worth goal" })).toBeVisible()
  await expect(page.locator(".recharts-area-curve")).toHaveCount(3)
  await expect(page.getByText(/Current pace/)).toBeVisible()

  await page.getByRole("button", { name: "Delete goal" }).click()
  await expect(page.locator(".recharts-area-curve")).toHaveCount(2)
  await expect(page.getByText(/Current pace/)).toHaveCount(0)
})
