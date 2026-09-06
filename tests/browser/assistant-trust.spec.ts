import { expect, test } from "@playwright/test"

test("hosted send asks for consent first, cancel keeps the draft", async ({ page }) => {
  await page.goto("/")
  await page.locator("button[title='Ask about your finances']").click()
  await page.getByRole("button", { name: "Assistant settings" }).click()
  await page.locator("#assistant-provider").selectOption("openrouter")
  await page.getByRole("button", { name: "Assistant settings" }).click()
  await page.getByLabel("Ask the assistant").fill("Summarize my test spending please")
  await page.getByRole("button", { name: "Send message" }).click()
  await expect(page.getByRole("dialog", { name: "Confirm sharing finance summary" })).toBeVisible()
  await expect(page.getByText("Never raw files.")).toBeVisible()
  await page.getByRole("button", { name: "Not now" }).click()
  await expect(page.getByRole("dialog", { name: "Confirm sharing finance summary" })).toHaveCount(0)
  // Nothing was sent, and the draft is preserved in the composer.
  await expect(page.getByLabel("Ask the assistant")).toHaveValue(
    "Summarize my test spending please",
  )
})

test("biometric app lock gates the shell on native", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as {
      webkit?: { messageHandlers?: { bridge?: unknown } }
    }
    w.webkit = { messageHandlers: { bridge: {} } }
    window.localStorage.setItem("budgetlens.app-lock.v1", '"biometric"')
  })
  await page.goto("/")
  await expect(page.getByRole("dialog", { name: "BudgetLens is locked" })).toBeVisible()
  await page.getByRole("button", { name: "Unlock" }).click()
})
