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
  const review = page.getByRole("option", { name: /Go to Review/ })
  const groups = page.getByRole("option", { name: /Go to Groups/ })
  await expect(review).toBeVisible()
  await expect(review).toHaveAttribute("aria-selected", "true")
  // Rank order for "go to" leads with Review; one arrow step down lands
  // on Groups (second), Enter navigates there.
  await page.keyboard.press("ArrowDown")
  await expect(groups).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("Enter")

  await expect(page).toHaveURL(/\/groups/)
  await expect(page.getByRole("heading", { name: "Groups" })).toBeVisible()
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
