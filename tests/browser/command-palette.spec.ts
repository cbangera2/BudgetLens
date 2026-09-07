// Command palette: keyboard-only coverage. No pointer input anywhere in this
// spec — every interaction is a keypress, matching the desktop-first contract.

import { expect, test } from "@playwright/test"

async function openPalette(page) {
  await page.keyboard.press("ControlOrMeta+k")
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible()
  await expect(page.getByRole("combobox", { name: "Search commands" })).toBeFocused()
}

test("opens with the shortcut and navigates with type, arrows, enter", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()

  await openPalette(page)
  await page.keyboard.type("go to")
  const budgets = page.getByRole("option", { name: /Go to Budgets/ })
  await expect(budgets).toBeVisible()
  // Rank order for "go to" leads with Transactions; one arrow step down lands
  // on Budgets (second), Enter navigates there.
  await page.keyboard.press("ArrowDown")
  await expect(budgets).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("Enter")

  await expect(page).toHaveURL(/\/budgets/)
  await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible()
  await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0)
})

test("dismisses with Escape and returns focus to the opener", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()

  // Keyboard-focus a nav link so focus return has a deterministic target.
  const transactions = page.getByRole("link", { name: "Transactions", exact: true })
  await transactions.focus()
  await page.keyboard.press("ControlOrMeta+k")
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0)
  await expect(transactions).toBeFocused()
})

test("does not trigger while typing in a text input", async ({ page }) => {
  await page.goto("/transactions")
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()

  await page.getByLabel("Search").focus()
  await page.keyboard.press("ControlOrMeta+k")
  await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0)
  // The keystroke must not leak into the field either.
  await expect(page.getByLabel("Search")).toHaveValue("")
})

test("opens the assistant with a preset question", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()

  await openPalette(page)
  await page.keyboard.type("over budget")
  await expect(page.getByRole("option", { name: /Ask assistant/ })).toBeVisible()
  await page.keyboard.press("Enter")

  await expect(page.getByRole("region", { name: "BudgetLens assistant" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Ask the assistant" })).toHaveValue(
    "Am I over budget anywhere?",
    { timeout: 8_000 },
  )
})
