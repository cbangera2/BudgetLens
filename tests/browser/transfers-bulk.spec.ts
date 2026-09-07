import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(directory, "../fixtures/transfers-bulk.csv")

test("bulk approves two selected suggested transfers", async ({ page }) => {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture)
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText("Imported 5 transactions rows.")).toBeVisible()

  await page.getByRole("link", { name: "Transactions", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()

  const transfers = page.getByLabel("Transfers", { exact: true })
  await expect(transfers.getByRole("heading", { name: "Transfers", exact: true })).toBeVisible()
  await expect(transfers.getByText("0 of 2 selected")).toBeVisible()

  const approveAll = transfers.getByRole("button", { name: "Approve all 0" })
  await expect(approveAll).toBeDisabled()

  await transfers
    .getByRole("checkbox", {
      name: "Select transfer Synthetic transfer out A and Synthetic transfer in A",
    })
    .check()
  await transfers
    .getByRole("checkbox", {
      name: "Select transfer Synthetic transfer out B and Synthetic transfer in B",
    })
    .check()

  const approveBoth = transfers.getByRole("button", { name: "Approve all 2" })
  await expect(approveBoth).toBeEnabled()
  await approveBoth.click()

  await expect(
    transfers.getByRole("button", {
      name: "Undo transfer Synthetic transfer out A and Synthetic transfer in A",
    }),
  ).toBeVisible()
  await expect(
    transfers.getByRole("button", {
      name: "Undo transfer Synthetic transfer out B and Synthetic transfer in B",
    }),
  ).toBeVisible()
})
