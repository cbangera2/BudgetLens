import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(directory, "../fixtures/settling-shared.csv")

test("group settling suggests exact paybacks for a shared group", async ({ page }) => {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture)
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText("Imported 2 transactions rows.")).toBeVisible()

  await page.goto("/groups")
  await expect(page.getByRole("heading", { name: "Groups" })).toBeVisible()
  await page.getByRole("button", { name: "New group" }).click()
  await page.getByLabel("Name").fill("Settling Trip")
  await page.getByRole("button", { name: "Save group" }).click()
  await expect(page.getByText("Settling Trip")).toBeVisible()

  await page.goto("/transactions")
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Settling Cabin" })).toBeVisible()
  await page.getByLabel("Select Settling Cabin").check()
  await page.getByLabel("Select Settling Groceries").check()

  await page.getByLabel("Add to group").click()
  await page.getByRole("option", { name: "Settling Trip" }).click()
  await expect(page.getByText("2 of").first())
    .toBeHidden({ timeout: 1_000 })
    .catch(() => {})

  await page.getByLabel("Select Settling Cabin").check()
  await page.getByLabel("Select Settling Groceries").check()
  await page.getByLabel("Sharing").click()
  await page.getByRole("option", { name: /Shared ÷2/ }).click()

  await page.goto("/groups")
  await page
    .getByRole("link", { name: /Settling Trip/ })
    .first()
    .click()
  await expect(page.getByRole("heading", { name: "Settling Trip" })).toBeVisible()

  const settleUp = page.getByLabel("Settle up", { exact: true })
  await expect(settleUp.getByRole("heading", { name: "Settle up" })).toBeVisible()
  await expect(settleUp.getByText("Bob pays Alice $30.00")).toBeVisible()
  await expect(settleUp.getByText("$30.00", { exact: true })).toBeVisible()
})
