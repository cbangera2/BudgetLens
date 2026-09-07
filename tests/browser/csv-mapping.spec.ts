import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => path.resolve(directory, "../fixtures", name)

test("bank-agnostic CSV mapping imports oddly-headered files", async ({ page }) => {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture("bank-odd-headers.csv"))

  await expect(page.getByRole("heading", { name: "Map CSV columns" })).toBeVisible()
  await expect(page.getByText("uses headers we don't recognize")).toBeVisible()

  await expect(page.getByLabel("Date (required)")).toHaveValue("Transaction Date")
  await expect(page.getByLabel("Amount (required)")).toHaveValue("Withdrawal")
  await expect(page.getByLabel("Description (required)")).toHaveValue("Narrative")
  await expect(page.getByLabel("Category (optional)")).toHaveValue("Spending Category")
  await expect(page.getByLabel("Account (optional)")).toHaveValue("Acct")
  await expect(page.getByLabel("Type (optional)")).toHaveValue("Flow")

  await page.getByRole("button", { name: "Preview with mapping" }).click()

  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await expect(page.getByText("Preview ready. Review the counts before importing.")).toBeVisible()
  await expect(page.getByText("Example Corner Shop, North")).toBeVisible()
  await expect(page.getByText("Fictional Employer Payroll")).toBeVisible()

  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText("Imported 2 transactions rows.")).toBeVisible()

  await page.getByRole("link", { name: "Transactions", exact: true }).click()
  await expect(page.getByRole("rowheader", { name: "Example Corner Shop, North" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Fictional Employer Payroll" })).toBeVisible()
  await expect(page.getByRole("cell", { name: "-$18.25" }).first()).toBeVisible()
  await expect(page.getByRole("cell", { name: "$2,500.00" }).first()).toBeVisible()
})
