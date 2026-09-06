import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(directory, "../fixtures/settling-shared.csv")

async function markSharedInGroup(page: Page, description: string, groupName: string) {
  await page.getByRole("button", { name: `Edit ${description}` }).click()
  const dialog = page.getByRole("dialog", { name: `Edit ${description}` })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Group (optional)").selectOption({ label: groupName })
  const shared = dialog.getByLabel("Shared (split cost)")
  if (!(await shared.isChecked())) await shared.check()
  await dialog.getByLabel("Divide by").fill("2")
  await dialog.getByRole("button", { name: "Save changes" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
}

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
  await markSharedInGroup(page, "Settling Cabin", "Settling Trip")
  await markSharedInGroup(page, "Settling Groceries", "Settling Trip")
  await expect(page.getByText("shared ÷2")).toHaveCount(2)

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
