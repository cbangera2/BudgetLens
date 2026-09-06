import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { expect, test, type Locator } from "@playwright/test"

// Synthetic 1x1 transparent PNG generated in-code (never a real photo).
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

const SIDECAR_KEY = "budgetlens.receipts.sidecar.v1"

/**
 * Activate a button via keyboard. The mobile shell docks the Filters card
 * sticky over the bottom of the viewport and the edit dialog scrolls, so
 * buttons revealed by scrolling can sit underneath an overlay and pointer
 * hit-testing fails; keyboard activation fires the same handlers without
 * coordinates.
 */
async function activateButton(button: Locator) {
  await button.press("Enter")
}

test("receipt photos attach to a transaction and are removed with it", async ({ page }) => {
  const description = `Receipt E2E ${Date.now()}`
  const filePath = path.join(os.tmpdir(), `receipt-e2e-${Date.now()}.png`)
  fs.writeFileSync(filePath, Buffer.from(TINY_PNG_BASE64, "base64"))
  try {
    await page.goto("/transactions")
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible()

    await activateButton(page.getByRole("button", { name: "Add transaction", exact: true }))
    const createDialog = page.getByRole("dialog", { name: "Add transaction" })
    await expect(createDialog).toBeVisible()
    await createDialog.getByLabel("Date").fill("2026-08-15")
    await createDialog.getByLabel("Description").fill(description)
    await createDialog.getByLabel("Amount").fill("-18.50")
    await activateButton(createDialog.getByRole("button", { name: "Add transaction", exact: true }))
    await expect(page.getByRole("rowheader", { name: description })).toBeVisible()

    await activateButton(page.getByRole("button", { name: `Edit ${description}`, exact: true }))
    const editDialog = page.getByRole("dialog", { name: `Edit ${description}` })
    await expect(editDialog).toBeVisible()
    await expect(editDialog.getByText(/excluded from JSON backups/)).toBeVisible()

    await editDialog.getByLabel("Add receipt photo").setInputFiles(filePath)
    await expect(editDialog.getByRole("img", { name: "Receipt 1" })).toBeVisible()

    const sidecarBefore = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      SIDECAR_KEY,
    )
    expect(sidecarBefore).not.toBeNull()
    const refsBefore = Object.values(JSON.parse(sidecarBefore as string)) as Array<
      Array<{ hash: string }>
    >
    expect(refsBefore).toHaveLength(1)
    expect(refsBefore[0]).toHaveLength(1)
    expect(refsBefore[0]?.[0]?.hash).toMatch(/^[0-9a-f]{64}$/)

    await activateButton(editDialog.getByRole("button", { name: "Cancel" }))
    await expect(editDialog).toHaveCount(0)

    await activateButton(page.getByRole("button", { name: `Delete ${description}`, exact: true }))
    const deleteDialog = page.getByRole("alertdialog", { name: "Delete transaction?" })
    await expect(deleteDialog).toBeVisible()
    await activateButton(deleteDialog.getByRole("button", { name: "Delete", exact: true }))
    await expect(page.getByRole("rowheader", { name: description })).toHaveCount(0)

    const sidecarAfter = await page.evaluate((key) => window.localStorage.getItem(key), SIDECAR_KEY)
    expect(sidecarAfter === null || sidecarAfter === "{}").toBe(true)

    const remaining = await page.evaluate(async () => {
      const files: string[] = []
      try {
        const root = await navigator.storage.getDirectory()
        const directory = (await root.getDirectoryHandle("receipts")) as unknown as {
          keys(): AsyncIterable<string>
        }
        for await (const key of directory.keys()) files.push(key)
      } catch {
        // No receipts directory means no stored images.
      }
      let indexedDbBlobs = -1
      try {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("budgetlens-receipt-blobs", 1)
          request.addEventListener("success", () => resolve(request.result))
          request.addEventListener("error", () => reject(request.error))
        })
        try {
          if (!database.objectStoreNames.contains("blobs")) {
            indexedDbBlobs = 0
          } else {
            const stored = await new Promise<unknown[]>((resolve, reject) => {
              const transaction = database.transaction("blobs", "readonly")
              const request = transaction.objectStore("blobs").getAllKeys()
              request.addEventListener("success", () => resolve(request.result as unknown[]))
              request.addEventListener("error", () => reject(request.error))
            })
            indexedDbBlobs = stored.length
          }
        } finally {
          database.close()
        }
      } catch {
        // An unreachable blob store means no stored images.
      }
      return { files, indexedDbBlobs }
    })
    expect(remaining.files).toEqual([])
    expect(remaining.indexedDbBlobs).toBe(0)
  } finally {
    fs.rmSync(filePath, { force: true })
  }
})
