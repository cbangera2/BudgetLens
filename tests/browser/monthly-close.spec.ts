import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { expect, test } from "@playwright/test"

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${pad(monthIndex + 1)}`
}

function closingMonths(now: Date): { closing: string; prior1: string; prior2: string } {
  const closingDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prior1Date = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const prior2Date = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  return {
    closing: monthKey(closingDate.getFullYear(), closingDate.getMonth()),
    prior1: monthKey(prior1Date.getFullYear(), prior1Date.getMonth()),
    prior2: monthKey(prior2Date.getFullYear(), prior2Date.getMonth()),
  }
}

test("monthly close ritual completes triage, recurring, and summary with resume", async ({
  page,
}) => {
  const { closing, prior1, prior2 } = closingMonths(new Date())
  const rows = [
    "Date,Description,Amount,Category,Transaction Type,Account Name,Account Type,Provider,Labels,Notes",
    `${prior2}-15,Synthetic Monthly Stream,-12.00,Entertainment,Debit,Everyday Checking,Checking,Sample Credit Union,synthetic,Synthetic monthly charge`,
    `${prior1}-15,Synthetic Monthly Stream,-12.00,Entertainment,Debit,Everyday Checking,Checking,Sample Credit Union,synthetic,Synthetic monthly charge`,
    `${closing}-15,Synthetic Monthly Stream,-12.00,Entertainment,Debit,Everyday Checking,Checking,Sample Credit Union,synthetic,Synthetic monthly charge`,
    `${closing}-01,Synthetic Paycheck,2000.00,Income,Credit,Everyday Checking,Checking,Sample Credit Union,synthetic,Synthetic income`,
    `${closing}-06,Synthetic Close Bakery,-8.50,,Debit,Everyday Checking,Checking,Sample Credit Union,synthetic,Synthetic uncategorized spend`,
    `${closing}-09,Synthetic Close Books,-21.99,,Debit,Everyday Checking,Checking,Sample Credit Union,synthetic,Synthetic uncategorized spend`,
  ].join("\n")
  const directory = mkdtempSync(path.join(tmpdir(), "monthly-close-"))
  const fixture = path.join(directory, "monthly-close.csv")
  writeFileSync(fixture, rows)

  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture)
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText(/Imported 6 .*rows?\./)).toBeVisible()

  await page.goto("/review")
  await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible()
  await expect(page.getByTestId("monthly-close-banner")).toBeVisible()
  await expect(page.getByTestId("monthly-close-hub")).toBeVisible()

  await page.getByRole("button", { name: "Start monthly close" }).first().click()
  await expect(page.getByTestId("monthly-close-flow")).toBeVisible()
  await expect(page.getByTestId("monthly-close-step-1")).toBeVisible()

  await page.getByLabel("Category for Synthetic Close Bakery").fill("Dining")
  await page
    .locator("li", { hasText: "Synthetic Close Bakery" })
    .getByRole("button", { name: "Save" })
    .click()
  await expect(page.getByText("Synthetic Close Books", { exact: true })).toBeVisible()

  await page.getByTestId("monthly-close-step-1").getByRole("button", { name: "Continue" }).click()
  await expect(page.getByTestId("monthly-close-step-2")).toBeVisible()

  await page.getByRole("button", { name: "Confirm Synthetic Monthly Stream" }).click()
  await expect(page.getByText("confirmed").first()).toBeVisible()
  await page.getByTestId("monthly-close-step-2").getByRole("button", { name: "Continue" }).click()
  await expect(page.getByTestId("monthly-close-step-3")).toBeVisible()
  await expect(page.getByTestId("monthly-close-verdict")).toBeVisible()

  await page.getByRole("button", { name: "Close month" }).click()
  await expect(page.getByTestId("monthly-close-closed")).toBeVisible()
  await expect(page.getByTestId("monthly-close-verdict")).toBeVisible()

  await page.reload()
  await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible()
  await expect(page.getByTestId("monthly-close-closed")).toBeVisible()
})
