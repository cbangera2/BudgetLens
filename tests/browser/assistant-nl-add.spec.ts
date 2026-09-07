import { expect, test } from "@playwright/test"

test("assistant NL add drafts a transaction and applies on approval", async ({ page }) => {
  await page.route("**/chat/completions", async (route) => {
    const request = route.request()
    let hasTools = false
    try {
      const body = JSON.parse(request.postData() ?? "{}") as { tools?: unknown }
      hasTools = Array.isArray(body.tools) && body.tools.length > 0
    } catch {
      hasTools = false
    }
    if (hasTools) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: "",
                tool_calls: [
                  {
                    id: "call-nl-add",
                    type: "function",
                    function: {
                      name: "propose_transaction",
                      arguments: JSON.stringify({ text: "spent $12 on coffee yesterday" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [
          {
            message: {
              content:
                "Drafted your $12 coffee purchase for yesterday. Review the card to approve.",
            },
          },
        ],
      }),
    })
  })

  await page.addInitScript(() => {
    window.localStorage.setItem(
      "budgetlens.onboarding.v1",
      '{"version":1,"choice":"empty","completedAt":"2026-01-01T00:00:00.000Z"}',
    )
  })
  await page.goto("/")
  await page.locator("button[title='Ask about your finances']").click()
  await page.getByLabel("Ask the assistant").fill("spent $12 on coffee yesterday")
  await page.getByRole("button", { name: "Send message" }).click()

  const card = page.getByRole("group", { name: "Proposed transaction from text" })
  await expect(card).toBeVisible()
  await expect(card.getByText("coffee")).toBeVisible()
  await expect(card.getByText(/\$12\.00/)).toBeVisible()

  await card.getByRole("button", { name: /approve \+ apply/i }).click()
  await expect(card.getByText(/applied/)).toBeVisible()

  await page.getByRole("link", { name: "Transactions", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()
  await expect(page.getByRole("rowheader", { name: "coffee" })).toBeVisible()
})
