import path from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test } from "@playwright/test"

const directory = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => path.resolve(directory, "../fixtures", name)

// TEMPORARY CI diagnostic (to be deleted before merge): logs mobile geometry
// around the transactions-table merchant link click.
test("cidbg merchant link geometry", async ({ page }) => {
  await page.goto("/imports")
  await page.getByLabel("CSV or JSON files").setInputFiles(fixture("current-transactions.csv"))
  await expect(page.getByRole("heading", { name: "Import preview" })).toBeVisible()
  await page.getByRole("button", { name: "Confirm import" }).click()
  await expect(page.getByText("Imported 2 transactions rows.")).toBeVisible()

  await page.goto("/transactions")
  const detailLink = page.getByRole("link", { name: "Example Market, North" })
  await expect(detailLink).toBeVisible()

  const metrics = await page.evaluate(() => {
    const link = document.querySelector("tbody tr th[scope='row'] a")
    const sortButton = document.querySelector("thead button[aria-label='Sort by merchant']")
    const linkRect = link?.getBoundingClientRect()
    const buttonRect = (sortButton as HTMLElement | null)?.getBoundingClientRect()
    const at = (x: number, y: number) => {
      const element = document.elementFromPoint(x, y)
      return element ? element.tagName : "none"
    }
    return {
      inner: { w: window.innerWidth, h: window.innerHeight },
      dpr: window.devicePixelRatio,
      scale: window.visualViewport?.scale ?? -1,
      scrollY: window.scrollY,
      bodyScroll: { w: document.body.scrollWidth, h: document.body.scrollHeight },
      font: link ? getComputedStyle(link).fontFamily.slice(0, 60) : "none",
      link: linkRect
        ? { x: Math.round(linkRect.x), y: Math.round(linkRect.y), w: Math.round(linkRect.width) }
        : null,
      sortButton: buttonRect
        ? {
            x: Math.round(buttonRect.x),
            y: Math.round(buttonRect.y),
            w: Math.round(buttonRect.width),
          }
        : null,
      hitAtLinkCenter: linkRect
        ? at(linkRect.x + linkRect.width / 2, linkRect.y + linkRect.height / 2)
        : "none",
    }
  })
  console.log(`CIDBG-METRICS: ${JSON.stringify(metrics)}`)
  await detailLink.click({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/transactions\/.+/)
})
