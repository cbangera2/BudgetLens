// Receipt photo capture + thumbnails for the transaction edit dialog.
//
// Single integration point for the receipts feature: rendered by
// TransactionForm for existing transactions (captures need a transaction id).
// Capture is a plain file input (accept="image/*"), which summons the native
// camera roll picker inside WKWebView with no extra bridge.

import { useCallback, useEffect, useId, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  addReceiptForTransaction,
  installReceiptCascade,
  listTransactionReceipts,
  pruneOrphanedReceipts,
  removeTransactionReceipt,
  type ReceiptRef,
} from "@/features/receipts/receipts"
import { createReceiptDisplayUrl, loadReceiptBlob } from "@/features/receipts/storage"

export function ReceiptSection({ transactionId }: { transactionId: string }) {
  const fieldId = useId()
  const [refs, setRefs] = useState<readonly ReceiptRef[]>([])
  const [displayUrls, setDisplayUrls] = useState<Readonly<Record<string, string>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const displayUrlCache = useRef<Record<string, string>>({})

  const refresh = useCallback(() => {
    setRefs(listTransactionReceipts(transactionId))
  }, [transactionId])

  useEffect(() => {
    installReceiptCascade()
    refresh()
    // Eventual cleanup for images whose transaction was removed through a
    // path that bypassed the cascade (for example a backup restore).
    void pruneOrphanedReceipts()
      .then(refresh)
      .catch(() => undefined)
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    async function loadDisplayUrls() {
      const entries = await Promise.all(
        refs.map(async (ref) => {
          const cached = displayUrlCache.current[ref.hash]
          if (cached) return [ref.hash, cached] as const
          const blob = await loadReceiptBlob(ref.hash)
          if (!blob || cancelled) return null
          const url = createReceiptDisplayUrl(blob)
          if (!url) return null
          displayUrlCache.current[ref.hash] = url
          return [ref.hash, url] as const
        }),
      )
      if (!cancelled) {
        setDisplayUrls(Object.fromEntries(entries.filter((entry) => entry !== null)))
      }
    }
    void loadDisplayUrls()
    return () => {
      cancelled = true
    }
  }, [refs])

  useEffect(
    () => () => {
      for (const url of Object.values(displayUrlCache.current)) {
        try {
          URL.revokeObjectURL(url)
        } catch {
          // Revoking preview URLs is best-effort teardown.
        }
      }
      displayUrlCache.current = {}
    },
    [],
  )

  async function attach(file: File | undefined) {
    if (!file || busy) return
    setBusy(true)
    setError("")
    try {
      await addReceiptForTransaction(transactionId, file)
      refresh()
    } catch {
      setError("That photo could not be attached. Try another image file.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(hash: string) {
    setError("")
    try {
      await removeTransactionReceipt(transactionId, hash)
      const cached = displayUrlCache.current[hash]
      if (cached) {
        try {
          URL.revokeObjectURL(cached)
        } catch {
          // Revoking preview URLs is best-effort teardown.
        }
        delete displayUrlCache.current[hash]
      }
      refresh()
    } catch {
      setError("That photo could not be removed.")
    }
  }

  return (
    <section aria-labelledby={`${fieldId}-title`} className="grid gap-2">
      <h3 id={`${fieldId}-title`} className="text-sm font-medium">
        Receipt photos
      </h3>
      <p className="text-xs text-muted-foreground">
        Photos are downscaled on this device and stored outside your finance tables. They are
        excluded from JSON backups so backups stay small.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={`${fieldId}-file`}>Add receipt photo</Label>
        <Input
          id={`${fieldId}-file`}
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ""
            void attach(file)
          }}
        />
      </div>
      {refs.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Attached receipt photos">
          {refs.map((ref, index) => {
            const url = displayUrls[ref.hash]
            return (
              <li
                key={ref.hash}
                className="grid justify-items-center gap-1 rounded-xl border bg-muted/40 p-2"
              >
                {url ? (
                  <img
                    src={url}
                    alt={`Receipt ${index + 1}`}
                    className="h-20 w-20 rounded-lg border object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid h-20 w-20 place-items-center rounded-lg border bg-muted text-xs text-muted-foreground"
                  >
                    Photo {index + 1}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(ref.hash)}
                >
                  Remove receipt photo {index + 1}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
