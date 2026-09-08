import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(directory, "../fixtures/transfers-bulk.csv")

test("dismiss-all confirms, clears suggestions, and undoes back", async ({ page }) => {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture)
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText("Imported 5 transactions rows.")).toBeVisible()

  await page.goto("/review")
  await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible()

  const transfers = page.getByLabel("Transfers", { exact: true })
  await expect(transfers.getByRole("heading", { name: "Transfers", exact: true })).toBeVisible()
  await expect(transfers.getByText("0 of 2 selected")).toBeVisible()

  await transfers.getByRole("checkbox", { name: "Select all suggested transfers" }).check()
  await expect(transfers.getByText("2 of 2 selected")).toBeVisible()
  await page.screenshot({ path: "/tmp/dismiss-all-before.png" })

  const dismissAll = transfers.getByRole("button", { name: "Dismiss all 2" })
  await expect(dismissAll).toBeEnabled()
  await dismissAll.click()

  const dialog = page.getByRole("alertdialog", { name: "Dismiss 2 suggested transfers?" })
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: "/tmp/dismiss-all-confirm.png" })
  await dialog.getByRole("button", { name: "Dismiss" }).click()

  await expect(transfers.getByText("All detected transfers were dismissed.")).toBeVisible()
  await expect(
    transfers.getByRole("checkbox", { name: "Select all suggested transfers" }),
  ).toHaveCount(0)
  await page.screenshot({ path: "/tmp/dismiss-all-after.png" })

  const toast = page.locator("[data-sonner-toast]", { hasText: "2 suggested transfers dismissed" })
  await expect(toast).toBeVisible()
  await toast.getByRole("button", { name: "Undo" }).click()

  await expect(transfers.getByText("0 of 2 selected")).toBeVisible()
  await expect(
    transfers.getByRole("checkbox", {
      name: "Select transfer Synthetic transfer out A and Synthetic transfer in A",
    }),
  ).toBeVisible()
  await expect(
    transfers.getByRole("checkbox", {
      name: "Select transfer Synthetic transfer out B and Synthetic transfer in B",
    }),
  ).toBeVisible()
})
