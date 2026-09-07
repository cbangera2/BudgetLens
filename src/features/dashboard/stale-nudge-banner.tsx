import { Link } from "@tanstack/react-router"
import { useLiveQuery } from "dexie-react-hooks"
import { useEffect, useState } from "react"

import { repositories } from "@/db/repositories"
import type { ImportBatch } from "@/domain/models"

import {
  STALE_NUDGE_STORAGE_KEY,
  getStaleNudgeDismissalKey,
  getStaleNudgeFreshness,
  dismissStaleNudge,
  readStaleNudgeDismissal,
  type StaleNudgeFreshness,
} from "./stale-nudge-freshness"

function defaultStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage
  } catch {
    return null
  }
  return null
}

export function StaleNudgeBanner({
  freshness,
  onDismiss,
}: {
  freshness: StaleNudgeFreshness
  onDismiss: () => void
}) {
  if (freshness.variant === "fresh") return null
  const isStale = freshness.variant === "stale"
  const daysSince = freshness.daysSince ?? 0
  return (
    <output
      data-testid="stale-nudge-banner"
      data-variant={freshness.variant}
      data-days-since={isStale ? String(daysSince) : undefined}
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-card-foreground shadow-sm motion-reduce:animate-none motion-reduce:transition-none"
    >
      <p className="min-w-0 flex-1">
        {isStale ? (
          <>
            It has been {daysSince} {daysSince === 1 ? "day" : "days"} since your last import. Your
            overview may be out of date.{" "}
            <Link to="/imports" className="font-semibold underline underline-offset-2">
              Import fresh data
            </Link>
          </>
        ) : (
          <>
            No imports yet. Bring your data in to see your financial picture.{" "}
            <Link to="/imports" className="font-semibold underline underline-offset-2">
              Import fresh data
            </Link>
          </>
        )}
      </p>
      <button
        type="button"
        aria-label={isStale ? "Dismiss stale data nudge" : "Dismiss import suggestion"}
        onClick={onDismiss}
        className="inline-flex h-8 shrink-0 items-center rounded-md px-3 text-xs font-medium text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
      >
        Dismiss
      </button>
    </output>
  )
}

export function StaleDataNudge({
  batches: batchesProp,
  now: nowProp,
  storage: storageProp,
}: {
  batches?: readonly ImportBatch[] | null
  now?: Date
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null
} = {}) {
  const liveBatches = useLiveQuery(() => repositories.imports.list(), [], undefined)
  const storage = storageProp !== undefined ? storageProp : defaultStorage()

  const [dismissedFor, setDismissedFor] = useState<string | null>(() =>
    readStaleNudgeDismissal(storageProp !== undefined ? storageProp : defaultStorage()),
  )

  useEffect(() => {
    const target = storageProp !== undefined ? storageProp : defaultStorage()
    if (!target) return () => undefined
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STALE_NUDGE_STORAGE_KEY) {
        setDismissedFor(readStaleNudgeDismissal(target))
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [storageProp])

  const batches = batchesProp !== undefined ? batchesProp : liveBatches
  if (!batches) return null

  const freshness = getStaleNudgeFreshness(batches, nowProp ?? new Date())
  if (freshness.variant === "fresh") return null

  const key = getStaleNudgeDismissalKey(freshness)
  if (dismissedFor === key) return null

  return (
    <StaleNudgeBanner
      freshness={freshness}
      onDismiss={() => {
        dismissStaleNudge(storage, key)
        setDismissedFor(key)
      }}
    />
  )
}
