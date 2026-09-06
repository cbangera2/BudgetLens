import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(directory, "../fixtures/transfers.csv")

test("detects a transfer pair and excludes confirmed transfers from spending", async ({ page }) => {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture)
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText("Imported 3 transactions rows.")).toBeVisible()

  await page.getByRole("link", { name: "Transactions", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()

  const transfers = page.getByLabel("Transfers", { exact: true })
  await expect(transfers.getByRole("heading", { name: "Transfers", exact: true })).toBeVisible()
  await expect(
    transfers.getByText("Synthetic transfer out and Synthetic transfer in"),
  ).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Synthetic transfer out" })).toBeVisible()

  await transfers
    .getByRole("button", {
      name: "Confirm transfer Synthetic transfer out and Synthetic transfer in",
    })
    .click()

  await expect(transfers.getByText("Spending excluding transfers:")).toBeVisible()
  await expect(transfers.getByText("$42.50").first()).toBeVisible()
  await expect(
    transfers.getByRole("button", {
      name: "Undo transfer Synthetic transfer out and Synthetic transfer in",
    }),
  ).toBeVisible()
})
