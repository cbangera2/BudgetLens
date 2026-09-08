import { expect, test, type Locator } from "@playwright/test"

// Web builds hide the native OCR scan flow behind capability detection: the
// new-transaction form shows a one-line explanation and no scan controls
// (the Vision plugin has no web implementation; no fake UI).

async function activateButton(button: Locator) {
  await button.press("Enter")
}

test("receipt OCR on web shows a one-line note with no scan controls", async ({ page }) => {
  await page.goto("/transactions")
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()

  await activateButton(page.getByRole("button", { name: "Add transaction", exact: true }))
  const createDialog = page.getByRole("dialog", { name: "Add transaction" })
  await expect(createDialog).toBeVisible()

  await expect(
    createDialog.getByText(
      "Receipt text scan runs on-device in the native app; nothing is uploaded.",
    ),
  ).toBeVisible()
  await expect(createDialog.getByLabel(/scan receipt photo/i)).toHaveCount(0)
  await expect(createDialog.getByText(/reading receipt text/i)).toHaveCount(0)
})
