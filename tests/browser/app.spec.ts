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

test("imports current transactions and supports URL-backed search", async ({ page }) => {
  await importCsv(page, "current-transactions.csv", 2)

  await page.getByRole("link", { name: "Transactions", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: 'Quoted "Merchant"' })).toBeVisible()

  await page.getByRole("button", { name: "Edit Example Market, North" }).click()
  await expect(page.getByRole("dialog", { name: "Edit Example Market, North" })).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByRole("dialog", { name: "Edit Example Market, North" })).toHaveCount(0)

  await page.getByRole("button", { name: 'Delete Quoted "Merchant"' }).click()
  await expect(page.getByRole("alertdialog", { name: "Delete transaction?" })).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByRole("alertdialog", { name: "Delete transaction?" })).toHaveCount(0)

  await page.getByLabel("Search").fill("market")
  await expect(page).toHaveURL(/q=market/)
  await expect(page.getByRole("rowheader", { name: "Example Market, North" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: 'Quoted "Merchant"' })).toBeHidden()
})

test("imports multiple JSON files and reports partial-invalid selections", async ({ page }) => {
  await page.goto("/imports")
  await page
    .getByLabel("CSV or JSON files")
    .setInputFiles([
      fixture("transactions-page-one.json"),
      fixture("transactions-page-two.json"),
      fixture("unsupported-transactions.json"),
    ])

  await expect(page.getByRole("heading", { name: "JSON import preview" })).toBeVisible()
  await expect(page.getByText("transactions-page-one.json")).toBeVisible()
  await expect(page.getByText("unsupported-transactions.json")).toBeVisible()
  await expect(page.getByText("Unsupported JSON structure.")).toBeVisible()
  await page.getByRole("button", { name: "Import valid files" }).click()
  await expect(
    page.getByText("Imported 3 rows from 2 files. 1 selected file(s) were not imported."),
  ).toBeVisible()

  await page.getByRole("link", { name: "Transactions", exact: true }).click()
  await expect(page.getByRole("rowheader", { name: "Invented Corner Shop" })).toBeVisible()
  await expect(page.getByText("-$18.75")).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Imaginary Transit" })).toBeVisible()
})

test("imports and visualizes net worth and investment history", async ({ page }) => {
  await importCsv(page, "net-worth.csv", 2)
  await importCsv(page, "investments.csv", 2)

  await page.getByRole("link", { name: "Net worth" }).click()
  await expect(page.getByRole("heading", { name: "Net worth" })).toBeVisible()
  await expect(page.getByText("Latest net worth")).toBeVisible()
  await expect(page.getByText("Latest investments")).toBeVisible()
  await expect(page.getByRole("heading", { name: "$12,700.00" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "$6,725.50" })).toBeVisible()
  await expect(page.locator(".recharts-area-curve")).toHaveCount(2)
  await expect(
    page.getByRole("table", { name: "Net worth and investment values by observation date" }),
  ).toBeVisible()
})

test("keeps primary navigation usable at narrow widths", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible()
  await page.getByRole("link", { name: "Settings" }).click()
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  await expect(
    page.getByText("Financial records stay in this browser's IndexedDB storage."),
  ).toBeVisible()
})

test("shows dashboard content before customization controls", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
  await expect(page.getByLabel("Financial summary")).toBeVisible()
  await expect(page.getByText("Dashboard layout")).toBeVisible()
  await expect(page.getByRole("button", { name: "Add or hide modules" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Dashboard modules" })).toHaveCount(0)

  await page.getByRole("button", { name: "Add or hide modules" }).click()
  await expect(page.getByRole("dialog", { name: "Dashboard modules" })).toBeVisible()
  await page.getByRole("button", { name: "Close dashboard modules" }).click()
  await page.getByRole("button", { name: "Rearrange" }).click()
  await expect(page.getByText("Rearranging dashboard")).toBeVisible()
  await page.getByRole("button", { name: "Done" }).click()

  await expect(page.getByLabel("Financial summary")).toBeVisible()
  await expect(page.getByText("Rearranging dashboard")).toHaveCount(0)
})

test("keeps custom-chart actions compact, accessible, and persisted", async ({ page }) => {
  await page.goto("/")

  const chart = page.getByLabel("Monthly overview custom chart")
  const edit = page.getByRole("button", { name: "Edit Monthly overview" })
  const actions = page.getByLabel("Monthly overview chart actions")
  await expect(chart).toBeVisible()

  if ((page.viewportSize()?.width ?? 0) >= 640) {
    await expect(actions).toHaveCSS("opacity", "0.6")
    await chart.hover()
    await expect(actions).toHaveCSS("opacity", "1")
    await page.mouse.move(0, 0)
    await edit.focus()
    await expect(actions).toHaveCSS("opacity", "1")
  } else {
    await expect(actions).toHaveCSS("opacity", "1")
  }

  await edit.click()
  const editor = page.getByRole("dialog", { name: "Edit Monthly overview" })
  await expect(editor).toBeVisible()
  await editor.getByRole("checkbox", { name: "Savings" }).uncheck()
  await editor.getByRole("combobox", { name: "Chart type" }).click()
  await page.getByRole("option", { name: "Line", exact: true }).click()
  await editor.getByRole("button", { name: "Done" }).click()

  await page.reload()
  await chart.hover()
  await edit.click()
  await expect(editor.getByRole("checkbox", { name: "Savings" })).not.toBeChecked()
  await expect(editor.getByRole("combobox", { name: "Chart type" })).toHaveText("Line")
  await editor.getByRole("button", { name: "Done" }).click()

  await page.getByLabel("Chart title").fill("Account mix")
  await page.getByRole("button", { name: "Add chart" }).click()
  await page
    .getByRole("dialog", { name: "Edit Account mix" })
    .getByRole("button", { name: "Done" })
    .click()
  const accountMix = page.getByLabel("Account mix custom chart")
  await accountMix.hover()
  await page.getByRole("button", { name: "Move Account mix up" }).click()
  const reorderedCharts = page.locator(
    'section[aria-label="Account mix custom chart"] + section[aria-label="Monthly overview custom chart"]',
  )
  await expect(reorderedCharts).toHaveCount(1)

  await page.reload()
  await expect(reorderedCharts).toHaveCount(1)
  await chart.hover()
  await page.getByRole("button", { name: "Delete Monthly overview" }).click()
  const confirmation = page.getByRole("alertdialog", { name: "Delete chart?" })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole("button", { name: "Cancel" }).click()
  await expect(chart).toBeVisible()

  await accountMix.hover()
  await page.getByRole("button", { name: "Delete Account mix" }).click()
  await confirmation.getByRole("button", { name: "Delete" }).click()
  await page.reload()
  await expect(accountMix).toHaveCount(0)
})

test("makes every overview chart editable and persists area fill", async ({ page }) => {
  await page.goto("/")

  for (const title of [
    "Total metrics",
    "Monthly trends",
    "Spending by category",
    "Monthly overview",
  ]) {
    await expect(page.getByRole("button", { name: `Edit ${title}` })).toBeVisible()
  }

  await page.getByRole("button", { name: "Edit Monthly trends" }).click()
  const editor = page.getByRole("dialog", { name: "Edit Monthly trends" })
  await editor.getByRole("combobox", { name: "Area fill" }).click()
  await page.getByRole("option", { name: "None", exact: true }).click()
  await editor.getByRole("button", { name: "Done" }).click()

  await page.reload()
  await page.getByRole("button", { name: "Edit Monthly trends" }).click()
  await expect(editor.getByRole("combobox", { name: "Area fill" })).toHaveText("None")
})
