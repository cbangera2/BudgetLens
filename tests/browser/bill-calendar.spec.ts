import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test, type Locator, type Page } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.resolve(directory, "../fixtures/bill-calendar.csv")

const MONTH_INDEX = new Map(
  [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ].map((name, index) => [name, index]),
)

function parseMonthLabel(label: string): number {
  const [name, year] = label.split(" ")
  const month = MONTH_INDEX.get(name ?? "")
  if (month === undefined || year === undefined || !/^\d{4}$/.test(year)) {
    throw new Error(`Unparseable month heading: ${label}`)
  }
  return Number(year) * 12 + month
}

async function monthHeading(page: Page): Promise<string> {
  const heading = page.getByRole("heading", { name: /^\w+ \d{4}$/ })
  await expect(heading).toBeVisible()
  return (await heading.textContent())?.trim() ?? ""
}

async function goToMonth(page: Page, target: string): Promise<void> {
  for (let step = 0; step < 30; step += 1) {
    const current = await monthHeading(page)
    if (current === target) return
    if (parseMonthLabel(current) > parseMonthLabel(target)) {
      await page.getByRole("button", { name: "Previous month" }).click()
    } else {
      await page.getByRole("button", { name: "Next month" }).click()
    }
  }
  throw new Error(`Could not navigate to ${target}`)
}

async function boundingBox(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  if (!box) throw new Error("Missing bounding box")
  return box
}

test("bill calendar lays recurring charges on the month grid", async ({ page }) => {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture)
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await expect(page.getByText("Preview ready. Review the counts before importing.")).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText(/Imported 48 .*rows?\./)).toBeVisible()

  await page.goto("/bills")
  await expect(page.getByRole("heading", { name: "Bills" })).toBeVisible()
  const calendar = page.getByRole("region", { name: "Bill calendar" })
  await expect(calendar).toBeVisible()

  // The default view is the current month; the monthly fixture cadence
  // repeats indefinitely, so its chips are always present here.
  const homeMonth = await monthHeading(page)
  await expect(calendar.getByText("Beacon Streaming").first()).toBeVisible()

  // A fully past month pins every projected charge past the overdue
  // tolerance: Beacon Streaming lands on May 15, Harbor News on May 10, and
  // seven crowded bills share May 12.
  await goToMonth(page, "May 2026")
  const may15 = calendar.locator('[data-date="2026-05-15"]')
  await expect(may15.getByText("Beacon Streaming")).toBeVisible()
  await expect(may15.getByText("$12.99")).toBeVisible()
  await expect(may15.locator('[data-status="overdue"]')).toBeVisible()
  const may10 = calendar.locator('[data-date="2026-05-10"]')
  await expect(may10.getByText("Harbor News")).toBeVisible()
  await expect(may10.getByText("$7.50")).toBeVisible()
  await expect(calendar.getByText("Month total $402.97 across 9 bills")).toBeVisible()
  await expect(calendar.getByText("Overdue").first()).toBeVisible()

  // The crowded overdue day stays inside its cell: no chip may bleed into a
  // neighboring column.
  const may12 = calendar.locator('[data-date="2026-05-12"]')
  const crowdedChips = may12.locator("li")
  await expect(crowdedChips).toHaveCount(7)
  const cellBox = await boundingBox(may12)
  for (const chip of await crowdedChips.all()) {
    const chipBox = await boundingBox(chip)
    expect(chipBox.x).toBeGreaterThanOrEqual(cellBox.x - 1)
    expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(cellBox.x + cellBox.width + 1)
  }
  await expect(may12.getByText("Maple Insurance")).toBeVisible()
  await expect(may12.getByText("$120.00")).toBeVisible()

  // Savings sweeps pair with their matching legs, so they never flag as
  // overdue bills.
  await expect(calendar.getByText("Transfer to High-Yield Savings")).toHaveCount(0)
  await expect(calendar.getByText(/1 hidden as transfer/)).toBeVisible()

  // Editing a bill amount flows into the month total.
  await calendar.getByRole("button", { name: "Edit Beacon Streaming bill" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Expected amount (USD)").fill("25")
  await dialog.getByRole("button", { name: "Save bill" }).click()
  await expect(calendar.getByText("Month total $414.98")).toBeVisible()
  await expect(may15.getByText("$25.00")).toBeVisible()

  // Dismissing a merchant removes it everywhere and updates the total.
  await calendar.getByRole("button", { name: "Edit Harbor News bill" }).click()
  await expect(dialog).toBeVisible()
  await dialog.getByLabel(/Not a bill/).check()
  await dialog.getByRole("button", { name: "Save bill" }).click()
  await expect(may10.locator("li")).toHaveCount(0)
  await expect(calendar.getByText("Month total $407.48 across 8 bills")).toBeVisible()
  await expect(calendar.getByText(/1 dismissed/)).toBeVisible()

  // Dismissed merchants restore from the hidden bills list.
  await expect(calendar.getByRole("heading", { name: "Hidden bills" })).toBeVisible()
  await calendar.getByRole("button", { name: "Restore Harbor News bill" }).click()
  await expect(may10.getByText("Harbor News")).toBeVisible()
  await expect(calendar.getByText("Month total $414.98 across 9 bills")).toBeVisible()

  // Forward navigation keeps projecting the cadence, and Today returns.
  await page.getByRole("button", { name: "Next month" }).click()
  await expect(page.getByRole("heading", { name: "June 2026" })).toBeVisible()
  await expect(calendar.getByText("Beacon Streaming").first()).toBeVisible()

  await page.getByRole("button", { name: "Today" }).click()
  expect(await monthHeading(page)).toBe(homeMonth)
})
