import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test, type Page } from "@playwright/test"

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

test("bill calendar lays recurring charges on the month grid", async ({ page }) => {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture)
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await expect(page.getByText("Preview ready. Review the counts before importing.")).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText(/Imported 12 .*rows?\./)).toBeVisible()

  await page.goto("/bills")
  await expect(page.getByRole("heading", { name: "Bills" })).toBeVisible()
  const calendar = page.getByRole("region", { name: "Bill calendar" })
  await expect(calendar).toBeVisible()

  // The default view is the current month; the monthly fixture cadence
  // repeats indefinitely, so its chips are always present here.
  const homeMonth = await monthHeading(page)
  await expect(calendar.getByText("Beacon Streaming").first()).toBeVisible()

  // A fully past month pins every projected charge past the overdue
  // tolerance: Beacon Streaming lands on May 15, Harbor News on May 10.
  await goToMonth(page, "May 2026")
  const may15 = calendar.locator('[data-date="2026-05-15"]')
  await expect(may15.getByText("Beacon Streaming")).toBeVisible()
  await expect(may15.getByText("$12.99")).toBeVisible()
  await expect(may15.locator('[data-status="overdue"]')).toBeVisible()
  const may10 = calendar.locator('[data-date="2026-05-10"]')
  await expect(may10.getByText("Harbor News")).toBeVisible()
  await expect(may10.getByText("$7.50")).toBeVisible()
  await expect(calendar.getByText("Month total $20.49 across 2 bills")).toBeVisible()
  await expect(calendar.getByText("Overdue").first()).toBeVisible()

  // Forward navigation keeps projecting the cadence, and Today returns.
  await page.getByRole("button", { name: "Next month" }).click()
  await expect(page.getByRole("heading", { name: "June 2026" })).toBeVisible()
  await expect(calendar.getByText("Beacon Streaming").first()).toBeVisible()

  await page.getByRole("button", { name: "Today" }).click()
  expect(await monthHeading(page)).toBe(homeMonth)
})
