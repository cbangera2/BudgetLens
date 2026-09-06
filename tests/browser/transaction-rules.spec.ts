import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => path.resolve(directory, "../fixtures", name)

test("transaction rules apply at import with per-row override", async ({ page }) => {
  await page.goto("/imports")
  await expect(page.getByRole("heading", { name: "Transaction rules" })).toBeVisible()

  await page.getByRole("button", { name: "Add rule" }).click()
  await page.getByLabel("Merchant contains").fill("coffee")
  await page.getByLabel("Rule category").fill("Dining")
  await page
    .getByRole("form", { name: "Add transaction rule" })
    .getByRole("button", {
      name: "Add rule",
    })
    .click()
  await expect(page.getByText('merchant contains "coffee" → Dining')).toBeVisible()

  await page.getByLabel("CSV or JSON files").setInputFiles(fixture("transaction-rules.csv"))
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await expect(page.getByText("1 row matched a transaction rule")).toBeVisible()
  await expect(page.getByLabel("Category for row 1 Synthetic Coffee House")).toHaveValue("Dining")
  await expect(page.getByLabel("Category for row 2 Synthetic Grocery Mart")).toHaveValue(
    "Uncategorized",
  )
  await expect(page.getByText("Rule applied").first()).toBeVisible()

  await page.getByLabel("Category for row 2 Synthetic Grocery Mart").fill("Groceries")

  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText("Imported 3 transactions rows.")).toBeVisible()

  await page.getByRole("link", { name: "Transactions", exact: true }).click()
  await expect(page.getByRole("rowheader", { name: "Synthetic Coffee House" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Synthetic Grocery Mart" })).toBeVisible()
  const coffeeRow = page.locator("tbody tr", { hasText: "Synthetic Coffee House" })
  const groceryRow = page.locator("tbody tr", { hasText: "Synthetic Grocery Mart" })
  await expect(coffeeRow).toContainText("Dining")
  await expect(groceryRow).toContainText("Groceries")
})

test("transaction rules support reorder with first-match-wins precedence", async ({ page }) => {
  await page.goto("/imports")

  async function addRule(merchant: string, category: string) {
    await page.getByRole("button", { name: "Add rule" }).click()
    await page.getByLabel("Merchant contains").fill(merchant)
    await page.getByLabel("Rule category").fill(category)
    await page
      .getByRole("form", { name: "Add transaction rule" })
      .getByRole("button", { name: "Add rule" })
      .click()
    await expect(page.getByText(`merchant contains "${merchant}" → ${category}`)).toBeVisible()
  }

  await addRule("synthetic", "General")
  await addRule("coffee", "Dining")

  await page.getByLabel("CSV or JSON files").setInputFiles(fixture("transaction-rules.csv"))
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  // First rule wins while it is ordered first.
  await expect(page.getByLabel("Category for row 1 Synthetic Coffee House")).toHaveValue("General")

  await page.getByRole("button", { name: "Move Dining rule up" }).click()
  await page.getByLabel("CSV or JSON files").setInputFiles([])
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture("transaction-rules.csv"))
  await expect(page.getByLabel("Category for row 1 Synthetic Coffee House")).toHaveValue("Dining")
})
