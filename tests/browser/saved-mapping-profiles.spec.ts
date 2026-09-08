import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => path.resolve(directory, "../fixtures", name)

test("saved mapping profiles pre-apply to same-shape files and stay manageable", async ({
  page,
}) => {
  await page.goto("/imports")

  // Map once and remember the mapping for files like this one.
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture("bank-odd-headers.csv"))
  await expect(page.getByRole("heading", { name: "Map CSV columns" })).toBeVisible()

  const remember = page.getByLabel("Remember for files like this")
  await expect(remember).not.toBeChecked()
  await remember.check()
  await expect(page.getByLabel("Profile name")).toHaveValue("bank odd headers")
  await page.getByLabel("Profile name").fill("Odd bank profile")

  await page.getByRole("button", { name: "Preview with mapping" }).click()
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await expect(
    page.getByText("Saved mapping profile “Odd bank profile” for files like this."),
  ).toBeVisible()

  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText("Imported 2 transactions rows.")).toBeVisible()
  await expect(page.getByText("Odd bank profile")).toBeVisible()

  // A same-shape file gets the saved mapping pre-applied with attribution.
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture("bank-odd-headers-second.csv"))
  await expect(page.getByRole("heading", { name: "Map CSV columns" })).toBeVisible()
  await expect(page.getByText("Using saved profile “Odd bank profile”.")).toBeVisible()
  await expect(page.getByLabel("Date (required)")).toHaveValue("Transaction Date")
  await expect(page.getByLabel("Amount (required)")).toHaveValue("Withdrawal")
  await expect(page.getByLabel("Description (required)")).toHaveValue("Narrative")

  // The applied profile can be removed; the alias suggestion keeps the mapping valid.
  await page.getByRole("button", { name: "Stop using Odd bank profile" }).click()
  await expect(page.getByText("Using saved profile “Odd bank profile”.")).toBeHidden()

  await page.getByRole("button", { name: "Preview with mapping" }).click()
  await expect(page.getByText("Second Synthetic Grocer")).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText("Imported 2 transactions rows.")).toBeVisible()

  // A near miss is suggested but never applied silently.
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture("bank-odd-headers-renamed.csv"))
  await expect(page.getByRole("heading", { name: "Map CSV columns" })).toBeVisible()
  await expect(page.getByText("looks like a saved profile")).toBeVisible()
  await expect(page.getByText("Using saved profile “Odd bank profile”.")).toBeHidden()

  await page.getByRole("button", { name: "Apply Odd bank profile" }).click()
  await expect(page.getByText("Using saved profile “Odd bank profile”.")).toBeVisible()

  await page.getByRole("button", { name: "Preview with mapping" }).click()
  await expect(page.getByText("Third Synthetic Market")).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText("Imported 2 transactions rows.")).toBeVisible()

  // Profiles can be renamed and deleted; deleting keeps imported data.
  await page.getByRole("button", { name: "Rename Odd bank profile" }).click()
  await page.getByLabel("Profile name").fill("Odd bank renamed")
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Odd bank renamed")).toBeVisible()

  await page.getByRole("button", { name: "Delete Odd bank renamed" }).click()
  await expect(page.getByText("Odd bank renamed")).toBeHidden()
  await expect(page.getByText("No saved profiles yet.")).toBeVisible()

  const history = page.getByRole("table", { name: "Completed imports" })
  await expect(history.getByText("bank-odd-headers.csv")).toBeVisible()
  await expect(history.getByText("bank-odd-headers-second.csv")).toBeVisible()
  await expect(history.getByText("bank-odd-headers-renamed.csv")).toBeVisible()

  await page.getByRole("link", { name: "Transactions", exact: true }).click()
  await expect(page.getByRole("rowheader", { name: "Example Corner Shop, North" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Second Synthetic Grocer" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "Third Synthetic Market" })).toBeVisible()
})
