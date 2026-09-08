import { expect, test, type Locator } from "@playwright/test"

/**
 * Keyboard-activate buttons: the mobile shell can dock sticky content over
 * dialog buttons, so pointer hit-testing may fail while keyboard activation
 * fires the same handlers without coordinates.
 */
async function activateButton(button: Locator) {
  await button.press("Enter")
}

test("split a transaction two ways, category totals follow parts, unsplit restores", async ({
  page,
}) => {
  const description = `Split E2E ${Date.now()}`
  const childGroceries = `${description} — Groceries`
  const childHousehold = `${description} — Household`

  await page.goto("/transactions")
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()

  await activateButton(page.getByRole("button", { name: "Add transaction", exact: true }))
  const createDialog = page.getByRole("dialog", { name: "Add transaction" })
  await expect(createDialog).toBeVisible()
  await createDialog.getByLabel("Date").fill("2026-03-10")
  await createDialog.getByLabel("Description").fill(description)
  await createDialog.getByLabel("Amount").fill("-100.00")
  await activateButton(createDialog.getByRole("button", { name: "Add transaction", exact: true }))
  await expect(page.getByRole("rowheader", { name: description })).toBeVisible()
  await expect(page.getByText("Showing 1 of 1 matching transactions.")).toBeVisible()

  // Keyboard-activate the row link: on mobile a sticky card can sit over
  // the table and intercept pointer hit-testing.
  await page.getByRole("link", { name: description, exact: true }).press("Enter")
  await expect(page).toHaveURL(/\/transactions\/.+/)
  const parentUrl = page.url()

  // Split into Groceries 60 + Household 40.
  await activateButton(page.getByRole("button", { name: "Split", exact: true }))
  const splitDialog = page.getByRole("dialog", { name: `Split ${description}` })
  await expect(splitDialog).toBeVisible()
  await splitDialog.getByLabel("Category for part 1").fill("Groceries")
  await splitDialog.getByLabel("Amount for part 1").fill("60")
  await splitDialog.getByLabel("Category for part 2").fill("Household")
  await splitDialog.getByLabel("Amount for part 2").fill("40")
  await expect(splitDialog.getByText("balanced")).toBeVisible()
  await activateButton(splitDialog.getByRole("button", { name: "Split transaction" }))
  await expect(splitDialog).toHaveCount(0)

  // Children render on the detail surface with the superseded banner.
  await expect(page.getByText("Split across 2 categories")).toBeVisible()
  await expect(page.getByRole("link", { name: childGroceries })).toBeVisible()
  await expect(page.getByRole("link", { name: childHousehold })).toBeVisible()
  await expect(page.getByRole("button", { name: "Unsplit", exact: true })).toBeVisible()

  // Children render in the list as ordinary rows; the parent is excluded.
  await page.goto("/transactions")
  await expect(page.getByRole("rowheader", { name: childGroceries })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: childHousehold })).toBeVisible()
  await expect(page.getByRole("link", { name: description, exact: true })).toHaveCount(0)
  await expect(page.getByText("Showing 2 of 2 matching transactions.")).toBeVisible()

  // Category totals reflect the split: each category carries only its part.
  // (Scoped to the row: the running-balance cell can legitimately show the
  // account total, which equals the parent amount once both parts exist.)
  await page.goto("/transactions?category=Groceries")
  await expect(page.getByText("Showing 1 of 1 matching transactions.")).toBeVisible()
  const groceriesRow = page.locator("tbody tr", { hasText: childGroceries })
  await expect(groceriesRow).toContainText("60.00")
  await expect(groceriesRow).not.toContainText("40.00")

  await page.goto("/transactions?category=Household")
  await expect(page.getByText("Showing 1 of 1 matching transactions.")).toBeVisible()
  await expect(page.getByRole("rowheader", { name: childHousehold })).toBeVisible()
  await expect(page.locator("tbody")).toContainText("40.00")

  // Unsplit restores the original single row.
  await page.goto(parentUrl)
  await expect(page.getByText("Split across 2 categories")).toBeVisible()
  await activateButton(page.getByRole("button", { name: "Unsplit", exact: true }))
  await expect(page.getByText("Split across 2 categories")).toHaveCount(0)
  await expect(page.getByRole("link", { name: childGroceries })).toHaveCount(0)

  await page.goto("/transactions")
  await expect(page.getByRole("rowheader", { name: description })).toBeVisible()
  await expect(page.getByText("Showing 1 of 1 matching transactions.")).toBeVisible()
  await expect(page.locator("tbody")).toContainText("100.00")

  await page.goto("/transactions?category=Household")
  await expect(page.getByText("No matching transactions")).toBeVisible()
})
