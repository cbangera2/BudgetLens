import { unlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

/**
 * Synthetic fixture anchored to the current month so month-to-date math is
 * deterministic whenever the spec runs: one $3,000.00 paycheck on day 1 (the
 * only income, so no recurring bill is ever detected) plus a $487.00 monthly
 * budget created through the UI ($487.00 spreads to exactly $16.00/day).
 */
function fixtureCsv(): { file: string; monthPrefix: string; remainingDays: number } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthPrefix = `${year}-${pad(month)}`
  const rows = [
    "Date,Description,Amount,Category,Transaction Type,Account Name,Account Type,Provider,Labels,Notes",
    `${monthPrefix}-01,Synthetic Safe Paycheck,3000.00,Income,Credit,Everyday Checking,Checking,Sample Credit Union,synthetic,Synthetic safe-to-spend pay`,
  ]
  const file = path.join(os.tmpdir(), `safe-to-spend-${process.pid}-${Date.now()}.csv`)
  writeFileSync(file, `${rows.join("\n")}\n`)
  return { file, monthPrefix, remainingDays: daysInMonth - now.getDate() }
}

async function importCsv(page: Page, file: string) {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(file)
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText(/Imported 1 .*rows?\./)).toBeVisible()
}

test("safe-to-spend hero matches the hand-computed value and explains the math", async ({
  page,
}) => {
  const { file, remainingDays } = fixtureCsv()
  try {
    await page.goto("/")
    await expect(page.getByRole("region", { name: "Safe to spend" })).toBeVisible()
    await expect(page.getByText("No income recorded yet this month.")).toBeVisible()

    await importCsv(page, file)

    await page.goto("/budgets")
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible()
    await page.getByRole("button", { name: "Add goal" }).click()
    await page.getByLabel("Category", { exact: true }).fill("Groceries")
    await page.getByLabel("Goal amount").fill("487")
    await page.getByRole("button", { name: "Save goal", exact: true }).click()
    await expect(page.getByText("$487.00 goal")).toBeVisible()

    // Hand-computed: $3,000.00 income − $0.00 bills − $16.00 × days left.
    const burnMinor = 1_600 * remainingDays
    const safeMinor = 300_000 - burnMinor
    const expected = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(safeMinor / 100)

    await page.goto("/")
    const hero = page.getByRole("region", { name: "Safe to spend" })
    await expect(hero).toBeVisible()
    await expect(hero.getByTestId("safe-to-spend-amount")).toHaveText(expected)

    await hero.getByRole("button", { name: "How this is calculated" }).click()
    const math = hero.getByTestId("safe-to-spend-math")
    await expect(math).toBeVisible()
    await expect(math).toContainText("$3,000.00")
    await expect(math).toContainText("$0.00")
    await expect(math).toContainText("floored at $0")
    await expect(hero.getByText("Safe-to-spend = income received this month")).toBeVisible()
    await expect(hero.getByRole("link", { name: "View transactions" })).toHaveAttribute(
      "href",
      "/transactions",
    )
    await expect(hero.getByRole("link", { name: "View bills" })).toHaveAttribute("href", "/bills")
    await expect(hero.getByRole("link", { name: "View budgets" })).toHaveAttribute(
      "href",
      "/budgets",
    )
  } finally {
    unlinkSync(file)
  }
})
