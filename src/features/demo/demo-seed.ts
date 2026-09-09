import { useLiveQuery } from "dexie-react-hooks"

import { database } from "@/db/database"
import { ImportService } from "@/features/imports/import-service"
import { readOnboardingChoice } from "@/features/onboarding/onboarding-storage"

import { writeDemoManifest } from "./demo-manifest"
import {
  DEFAULT_DEMO_TEMPLATE_ID,
  getDemoTemplate,
  isDemoSourceName,
  isDemoTemplateId,
  readDemoTemplateChoice,
  type DemoTemplateId,
} from "./demo-templates"

let inFlight: Promise<boolean> | null = null
const inFlightByTemplate = new Map<DemoTemplateId, Promise<boolean>>()

function resolveTemplateId(explicit?: string | null): DemoTemplateId {
  if (explicit && isDemoTemplateId(explicit)) return explicit
  try {
    const stored = readDemoTemplateChoice(globalThis.localStorage)
    if (isDemoTemplateId(stored)) return stored
  } catch {
    // Private-mode storage may throw; fall through to the golden default.
  }
  return DEFAULT_DEMO_TEMPLATE_ID
}

export async function seedDemoDataIfEmpty(
  db: typeof database = database,
  templateId?: string | null,
): Promise<boolean> {
  // Browser tests seed their own fixture data and expect a clean database.
  if (import.meta.env.VITE_DISABLE_DEMO_DATA === "true") return false

  const hasExistingData =
    (await db.imports.count()) > 0 ||
    (await db.transactions.count()) > 0 ||
    (await db.budgets.count()) > 0
  if (hasExistingData) return false

  const template = getDemoTemplate(resolveTemplateId(templateId ?? null))

  const importService = new ImportService(db)
  const preview = await importService.preview(template.bundleJson, template.sourceName)
  if (preview.importableCount === 0) return false
  await importService.commit(preview)

  const now = new Date().toISOString()
  const budgetRows = template.budgets.map((goal) => ({
    ...goal,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }))
  await db.budgets.bulkPut(budgetRows)

  const groupSeeds = template.groups.map((group) => {
    const id = crypto.randomUUID()
    return { id, name: group.name, row: { ...group, id, createdAt: now, updatedAt: now } }
  })
  await db.transactionGroups.bulkPut(groupSeeds.map((seed) => seed.row))
  const groupIds = new Map(groupSeeds.map((seed) => [seed.name, seed.id]))
  // Record exactly what was seeded so the first real import can remove it.
  writeDemoManifest({
    budgetIds: budgetRows.map((row) => row.id),
    groupIds: groupSeeds.map((seed) => seed.id),
  })

  // Link the tagged trip expenses to the trip group as a shared two-way split.
  const tripGroupId = groupIds.get(template.tripGroupName)
  if (tripGroupId) {
    const trips = await db.transactions
      .filter((transaction) => transaction.labels.includes(template.tripLabel))
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
  const templateId = resolveTemplateId(null)
  const cached = inFlightByTemplate.get(templateId)
  if (cached) return cached
  // Keep the legacy single-flight for backwards compatibility with callers
  // that only ever seed the default template.
  const flight = seedDemoDataIfEmpty(db, templateId).catch((error: unknown) => {
    console.error("Failed to load demo data", error)
    return false
  })
  inFlightByTemplate.set(templateId, flight)
  inFlight ??= flight
  return flight
}

export function isDemoDataOnly(batches: { sourceName: string }[] | undefined): boolean {
  if (!batches || batches.length === 0) return false
  return batches.every((batch) => isDemoSourceName(batch.sourceName))
}

export function useIsDemoData(): boolean {
  const batches = useLiveQuery(() => database.imports.toArray(), [])
  return isDemoDataOnly(batches)
}
