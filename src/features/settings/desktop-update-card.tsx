import { relaunch } from "@tauri-apps/plugin-process"
import { check } from "@tauri-apps/plugin-updater"
import { RefreshCw } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isTauriSync } from "@/lib/isTauri"

type UpdateStatus =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "ready"
  | "error"

async function handleRelaunch(): Promise<void> {
  await relaunch()
}

/**
 * Desktop-only app updater (Tauri `latest.json` from GitHub Releases).
 * Renders nothing on web/Pages. Release notes are plain text — never HTML.
 */
export function DesktopUpdateCard() {
  const [isDesktop] = useState(() => isTauriSync())
  const [status, setStatus] = useState<UpdateStatus>("idle")
  const [version, setVersion] = useState<string | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  // Bytes downloaded so far. This plugin version reports chunk sizes without
  // a total, so progress is indeterminate (MB counter, no percent).
  const [downloadedBytes, setDownloadedBytes] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isDesktop) return null

  async function handleCheck(): Promise<void> {
    setStatus("checking")
    setError(null)
    try {
      const update = await check()
      if (!update) {
        setStatus("current")
        return
      }
      setVersion(update.version)
      setNotes(update.body ?? null)
      setStatus("available")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update check failed.")
      setStatus("error")
    }
  }

  async function handleInstall(): Promise<void> {
    setStatus("downloading")
    setDownloadedBytes(0)
    setError(null)
    try {
      const update = await check()
      if (!update) {
        setStatus("current")
        return
      }
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setDownloadedBytes(0)
        } else if (event.event === "Progress") {
          const chunk = event.data.chunkLength
          setDownloadedBytes((current) => (current ?? 0) + chunk)
        } else if (event.event === "Finished") {
          setDownloadedBytes(null)
        }
      })
      setStatus("ready")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update download failed.")
      setStatus("error")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="size-5" aria-hidden="true" />
          App updates
        </CardTitle>
        <CardDescription>
          BudgetLens checks GitHub Releases for signed updates. Startup checks are silent and never
          interrupt you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "current" && <p className="text-sm">You&apos;re on the latest version.</p>}
        {status === "available" && version && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Version {version} is available.</p>
            {notes && (
              <p className="max-h-32 overflow-y-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
                {notes}
              </p>
            )}
          </div>
        )}
        {status === "downloading" && (
          <div className="space-y-1">
            <progress className="h-2 w-full" aria-label="Downloading update" />
            <p className="text-xs text-muted-foreground">
              Downloading…
              {downloadedBytes !== null && downloadedBytes > 0
                ? ` ${(downloadedBytes / 1_000_000).toFixed(1)} MB so far`
                : ""}
            </p>
          </div>
        )}
        {status === "ready" && (
          <p className="text-sm font-medium">Update installed. Restart to apply it.</p>
        )}
        {status === "error" && error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {(status === "idle" || status === "current" || status === "error") && (
            <Button type="button" variant="outline" onClick={() => void handleCheck()}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Check for updates
            </Button>
          )}
          {status === "checking" && (
            <Button type="button" variant="outline" disabled>
              <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
              Checking…
            </Button>
          )}
          {status === "available" && (
            <Button type="button" onClick={() => void handleInstall()}>
              Download and install
            </Button>
          )}
          {status === "ready" && (
            <Button type="button" onClick={() => void handleRelaunch()}>
              Restart now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
