import { useLiveQuery } from "dexie-react-hooks"

import { database } from "@/db/database"
import { ImportService } from "@/features/imports/import-service"

import { DEMO_SOURCE_NAME, GOLDEN_DEMO_BUDGETS, GOLDEN_DEMO_BUNDLE_JSON } from "./golden-bundle"

let inFlight: Promise<boolean> | null = null

export async function seedDemoDataIfEmpty(db: typeof database = database): Promise<boolean> {
  const hasExistingData =
    (await db.imports.count()) > 0 ||
    (await db.transactions.count()) > 0 ||
    (await db.budgets.count()) > 0
  if (hasExistingData) return false

  const importService = new ImportService(db)
  const preview = await importService.preview(GOLDEN_DEMO_BUNDLE_JSON, DEMO_SOURCE_NAME)
  if (preview.importableCount === 0) return false
  await importService.commit(preview)

  const now = new Date().toISOString()
  await db.budgets.bulkPut(
    GOLDEN_DEMO_BUDGETS.map((goal) => ({
      ...goal,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    })),
  )
  return true
}

export function ensureDemoData(db: typeof database = database): Promise<boolean> {
  inFlight ??= seedDemoDataIfEmpty(db).catch((error: unknown) => {
    console.error("Failed to load demo data", error)
    return false
  })
  return inFlight
}

export function isDemoDataOnly(batches: { sourceName: string }[] | undefined): boolean {
  if (!batches || batches.length === 0) return false
  return batches.every((batch) => batch.sourceName === DEMO_SOURCE_NAME)
}

export function useIsDemoData(): boolean {
  const batches = useLiveQuery(() => database.imports.toArray(), [])
  return isDemoDataOnly(batches)
}
