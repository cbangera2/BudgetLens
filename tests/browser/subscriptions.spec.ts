import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(directory, "../fixtures/subscriptions.csv")

test("detects subscriptions and shows monthly burn from a fixture import", async ({ page }) => {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture)
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await expect(page.getByText("Preview ready. Review the counts before importing.")).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText(/Imported 13 .*rows?\./)).toBeVisible()

  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Subscriptions" })).toBeVisible()

  const section = page.getByRole("region", { name: "Subscriptions" })
  await expect(section).toBeVisible()
  await expect(section.getByText("Total monthly burn:")).toBeVisible()
  await expect(section.getByText("$24.02")).toBeVisible()
  await expect(section.getByText("Acme Streaming")).toBeVisible()
  await expect(section.getByText("$14.73")).toBeVisible()
  await expect(section.getByText("Example News")).toBeVisible()
  await expect(section.getByText("$9.29")).toBeVisible()
  await expect(section.getByText("Corner Deli")).toHaveCount(0)
  await expect(section.getByText("One-Time Shop")).toHaveCount(0)
})
