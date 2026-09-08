import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(directory, "../fixtures/bill-creep.csv")

test("bill creep lists a raised recurring charge with correct figures", async ({ page }) => {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture)
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await expect(page.getByText("Preview ready. Review the counts before importing.")).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText(/Imported 9 .*rows?\./)).toBeVisible()

  await page.goto("/bills")
  await expect(page.getByRole("heading", { name: "Bills" })).toBeVisible()

  const creep = page.getByRole("region", { name: "Bill creep" })
  await expect(creep).toBeVisible()
  await expect(creep.getByText("Acme Streaming")).toBeVisible()
  await expect(creep.getByText("$10.00 → $12.00")).toBeVisible()
  await expect(creep.getByText("+20%")).toBeVisible()
  await expect(creep.getByText("+$2.00")).toBeVisible()
  await expect(creep.getByText("2026-01-15")).toBeVisible()
  await expect(creep.getByText("Example News")).toHaveCount(0)
  await expect(creep.getByText("One-Time Shop")).toHaveCount(0)

  // The creep list is reachable from the subscriptions surface.
  await page.goto("/review")
  await expect(page.getByRole("heading", { name: "Subscriptions", exact: true })).toBeVisible()
  await page.getByRole("link", { name: "View bill creep increases" }).click()
  await expect(page).toHaveURL(/\/bills/)
  await expect(page.getByRole("region", { name: "Bill creep" })).toBeVisible()

  // Dismissals persist across reloads.
  await page.getByRole("button", { name: "Dismiss Acme Streaming bill creep" }).click()
  await expect(creep.getByText("$10.00 → $12.00")).toHaveCount(0)
  await expect(creep.getByText("No bill increases detected.")).toBeVisible()
  await page.reload()
  await expect(page.getByRole("heading", { name: "Bills" })).toBeVisible()
  const reloaded = page.getByRole("region", { name: "Bill creep" })
  await expect(reloaded.getByText("$10.00 → $12.00")).toHaveCount(0)
  await expect(
    reloaded.getByRole("button", { name: "Restore Acme Streaming bill creep" }),
  ).toBeVisible()

  await reloaded.getByRole("button", { name: "Restore Acme Streaming bill creep" }).click()
  await expect(reloaded.getByText("$10.00 → $12.00")).toBeVisible()
})
