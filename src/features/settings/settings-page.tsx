import { useLiveQuery } from "dexie-react-hooks"
import { Download, Laptop, Moon, ShieldCheck, Sun, Trash2, Upload } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useTheme } from "@/app/theme-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { database } from "@/db/database"
import { repositories } from "@/db/repositories"
import { NotificationsSettingsCard } from "@/features/notifications/notifications-toggle"
import { readAppLockMode, writeAppLockMode, type AppLockMode } from "@/features/security/app-lock"
import { readAutoBackupEnabled, writeAutoBackupEnabled } from "@/features/settings/auto-backup"
import {
  type BackupPreview,
  clearAllData,
  createBackup,
  previewBackup,
  restoreBackup,
} from "@/features/settings/backup"
import { DesktopUpdateCard } from "@/features/settings/desktop-update-card"
import { cn } from "@/lib/cn"
import {
  backupFilename,
  checkBiometrics,
  isNative,
  shareBackupFile,
  type BiometricsStatus,
} from "@/lib/native"

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
] as const

function describeRestorePreview(preview: BackupPreview): string {
  const parts = [
    `${preview.counts.transactions} transactions`,
    `${preview.counts.wealth} wealth observations`,
    `${preview.counts.wealthBreakdown} breakdown snapshots`,
    `${preview.counts.wealthAccounts} account snapshots`,
    `${preview.counts.budgets} budgets`,
    `${preview.counts.transactionGroups} groups`,
    `${preview.counts.imports} import batches`,
  ]
  const exported = preview.exportedAt ? `Exported ${preview.exportedAt}. ` : ""
  return `${exported}Holds ${parts.join(", ")}.`
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [confirmation, setConfirmation] = useState("")
  const [isNativeShell] = useState(() => isNative())
  const [lockMode, setLockMode] = useState<AppLockMode>(() => readAppLockMode(window.localStorage))
  const [biometrics, setBiometrics] = useState<BiometricsStatus | null>(null)
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(() => {
    try {
      return readAutoBackupEnabled(window.localStorage, isNativeShell)
    } catch {
      return isNativeShell
    }
  })
  const [restoreName, setRestoreName] = useState<string | null>(null)
  const [restorePreview, setRestorePreview] = useState<BackupPreview | null>(null)
  const [restorePayload, setRestorePayload] = useState<unknown>(null)
  const [restoreConfirmation, setRestoreConfirmation] = useState("")
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!isNativeShell) return () => undefined
    let cancelled = false
    void checkBiometrics().then((status) => {
      if (!cancelled) setBiometrics(status)
    })
    return () => {
      cancelled = true
    }
  }, [isNativeShell])
  const counts = useLiveQuery(async () => {
    const [transactions, wealth, wealthBreakdown, wealthAccounts, imports, groups] =
      await Promise.all([
        repositories.transactions.list(),
        repositories.wealth.list(),
        repositories.wealthBreakdown.list(),
        repositories.wealthAccounts.list(),
        repositories.imports.list(),
        repositories.transactionGroups.list({ includeArchived: true }),
      ])
    return {
      transactions: transactions.length,
      wealth: wealth.length,
      wealthBreakdown: wealthBreakdown.length,
      wealthAccounts: wealthAccounts.length,
      imports: imports.length,
      groups: groups.length,
    }
  }, [])

  async function downloadBackup() {
    setBusy(true)
    try {
      const backup = await createBackup(repositories)
      await shareBackupFile(backupFilename(), JSON.stringify(backup, null, 2))
      toast.success("Backup exported")
    } catch {
      toast.error("Could not create the backup")
    } finally {
      setBusy(false)
    }
  }

  async function deleteEverything() {
    if (confirmation !== "DELETE") return
    setBusy(true)
    try {
      await clearAllData(repositories)
      setConfirmation("")
      toast.success("All locally stored financial data was deleted")
    } catch {
      toast.error("Could not delete all data")
    } finally {
      setBusy(false)
    }
  }

  function resetRestore() {
    setRestoreName(null)
    setRestorePreview(null)
    setRestorePayload(null)
    setRestoreConfirmation("")
    setRestoreError(null)
  }

  async function selectRestoreFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setRestoreError(null)
    try {
      const text = await file.text()
      const payload: unknown = JSON.parse(text)
      const preview = previewBackup(payload)
      setRestoreName(file.name)
      setRestorePreview(preview)
      setRestorePayload(payload)
      setRestoreConfirmation("")
    } catch (caught) {
      resetRestore()
      setRestoreError(
        caught instanceof Error ? caught.message : "That file is not a BudgetLens backup.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function applyRestore() {
    if (!restorePayload || restoreConfirmation !== "RESTORE") return
    setBusy(true)
    try {
      const receipt = await restoreBackup(database, restorePayload)
      resetRestore()
      toast.success(
        `Backup restored: ${receipt.transactions} transactions, ${receipt.budgets} budgets`,
      )
    } catch (caught) {
      setRestoreError(caught instanceof Error ? caught.message : "Could not restore that backup.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Manage appearance, backups, and data stored in this browser.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how BudgetLens looks on this device.</CardDescription>
        </CardHeader>{" "}
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-4 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                theme === value && "border-primary bg-accent",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="font-medium">{label}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      {isNativeShell ? (
        <Card>
          <CardHeader>
            <CardTitle>App lock</CardTitle>
            <CardDescription>
              Require Face ID or the device passcode to open your finances on this device.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={lockMode === "biometric"}
                onChange={(event) => {
                  const next: AppLockMode = event.target.checked ? "biometric" : "off"
                  writeAppLockMode(window.localStorage, next)
                  setLockMode(next)
                }}
              />
              <span>Lock app with Face ID or passcode</span>
            </label>
            <p className="text-xs text-muted-foreground">
              {biometrics === null
                ? "Checking device capabilities…"
                : biometrics.available
                  ? "Biometric unlock is available on this device."
                  : "No biometrics enrolled — the device passcode will be offered instead."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {isNativeShell ? (
        <Card>
          <CardHeader>
            <CardTitle>Automatic backup</CardTitle>
            <CardDescription>Keep a daily JSON copy without thinking about it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={(event) => {
                  const next = event.target.checked
                  writeAutoBackupEnabled(window.localStorage, next)
                  setAutoBackupEnabled(next)
                }}
              />
              <span>Back up automatically when the app suspends</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Native only: overwrites budgetlens-auto-backup.json in Documents at most once per day.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <NotificationsSettingsCard />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" aria-hidden="true" />
            Local data and privacy
          </CardTitle>
          <CardDescription>
            Financial records stay in this browser&apos;s IndexedDB storage. BudgetLens has no
            analytics and does not upload imported files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-lg bg-muted p-3">
              <dt className="text-muted-foreground">Transactions</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {counts?.transactions ?? 0}
              </dd>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <dt className="text-muted-foreground">Wealth observations</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{counts?.wealth ?? 0}</dd>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <dt className="text-muted-foreground">Breakdown snapshots</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {counts?.wealthBreakdown ?? 0}
              </dd>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <dt className="text-muted-foreground">Account snapshots</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {counts?.wealthAccounts ?? 0}
              </dd>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <dt className="text-muted-foreground">Groups</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{counts?.groups ?? 0}</dd>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <dt className="text-muted-foreground">Import batches</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{counts?.imports ?? 0}</dd>
            </div>
          </dl>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void downloadBackup()}
          >
            <Download className="size-4" aria-hidden="true" />
            Download JSON backup
          </Button>
          <p className="text-xs text-muted-foreground">
            Backups contain your financial data. Store them somewhere private and do not attach them
            to issues or pull requests.
          </p>
          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="restore-file">Restore from a JSON backup</Label>
            <Input
              id="restore-file"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              aria-invalid={Boolean(restoreError)}
              aria-describedby={`restore-file-help${restoreError ? " restore-file-error" : ""}`}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ""
                void selectRestoreFile(file)
              }}
            />
            <p id="restore-file-help" className="text-xs text-muted-foreground">
              Restoring replaces everything currently stored with the backup contents. Version-1
              bundles restore through Imports instead.
            </p>
          </div>
          {restoreError ? (
            <div
              id="restore-file-error"
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <p className="font-medium">That backup cannot be restored</p>
              <p className="mt-1">{restoreError}</p>
            </div>
          ) : null}
          {restorePreview && restoreName ? (
            <div className="space-y-3 rounded-xl border p-3">
              <p className="text-sm">
                <span className="font-medium">{restoreName}</span> is ready.{" "}
                {describeRestorePreview(restorePreview)}
              </p>
              <div className="max-w-sm space-y-2">
                <Label htmlFor="restore-confirmation">Type RESTORE to confirm</Label>
                <Input
                  id="restore-confirmation"
                  value={restoreConfirmation}
                  autoComplete="off"
                  onChange={(event) => setRestoreConfirmation(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy || restoreConfirmation !== "RESTORE"}
                  onClick={() => void applyRestore()}
                >
                  <Upload className="size-4" aria-hidden="true" />
                  Restore backup
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => resetRestore()}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <DesktopUpdateCard />

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Delete all local data</CardTitle>
          <CardDescription>
            This permanently removes transactions, wealth history, breakdowns, account snapshots,
            budgets, groups, and import history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-sm space-y-2">
            <Label htmlFor="delete-confirmation">Type DELETE to confirm</Label>
            <Input
              id="delete-confirmation"
              value={confirmation}
              autoComplete="off"
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || confirmation !== "DELETE"}
            onClick={() => void deleteEverything()}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete everything
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
