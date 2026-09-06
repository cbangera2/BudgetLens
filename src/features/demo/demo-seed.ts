import { useLiveQuery } from "dexie-react-hooks"

import { database } from "@/db/database"
import { ImportService } from "@/features/imports/import-service"
import { readOnboardingChoice } from "@/features/onboarding/onboarding-storage"

import {
  DEMO_TRIP_LABEL,
  DEMO_SOURCE_NAME,
  GOLDEN_DEMO_BUDGETS,
  GOLDEN_DEMO_BUNDLE_JSON,
  GOLDEN_DEMO_GROUPS,
} from "./golden-bundle"

let inFlight: Promise<boolean> | null = null

export async function seedDemoDataIfEmpty(db: typeof database = database): Promise<boolean> {
  // Browser tests seed their own fixture data and expect a clean database.
  if (import.meta.env.VITE_DISABLE_DEMO_DATA === "true") return false

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

  const groupSeeds = GOLDEN_DEMO_GROUPS.map((group) => {
    const id = crypto.randomUUID()
    return { id, name: group.name, row: { ...group, id, createdAt: now, updatedAt: now } }
  })
  await db.transactionGroups.bulkPut(groupSeeds.map((seed) => seed.row))
  const groupIds = new Map(groupSeeds.map((seed) => [seed.name, seed.id]))

  // Link the tagged trip expenses to the trip group as a shared two-way split.
  const tripGroupId = groupIds.get("Coastal Summer Trip")
  if (tripGroupId) {
    const trips = await db.transactions
      .filter((transaction) => transaction.labels.includes(DEMO_TRIP_LABEL))
      .toArray()
    await db.transactions.bulkPut(
      trips.map((transaction) => ({
        ...transaction,
        groupId: tripGroupId,
        shared: true,
        shareCount: 2,
        updatedAt: now,
      })),
    )
  }
  return true
}

export function ensureDemoData(db: typeof database = database): Promise<boolean> {
  // First-run onboarding gates demo seeding: only an explicit demo choice
  // loads the sample budget, so import and empty flows keep a clean store.
  if (readOnboardingChoice(globalThis.localStorage) !== "demo") return Promise.resolve(false)
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
