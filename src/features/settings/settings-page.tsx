import { useLiveQuery } from "dexie-react-hooks"
import { Download, Laptop, Moon, ShieldCheck, Sun, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { useTheme } from "@/app/theme-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { repositories } from "@/db/repositories"
import { clearAllData, createBackup } from "@/features/settings/backup"
import { cn } from "@/lib/cn"

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
] as const

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const counts = useLiveQuery(async () => {
    const [transactions, wealth, imports] = await Promise.all([
      repositories.transactions.list(),
      repositories.wealth.list(),
      repositories.imports.list(),
    ])
    return { transactions: transactions.length, wealth: wealth.length, imports: imports.length }
  }, [])

  async function downloadBackup() {
    setBusy(true)
    try {
      const backup = await createBackup(repositories)
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `budgetlens-backup-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      toast.success("Backup downloaded")
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
        </CardHeader>
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
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
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
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Delete all local data</CardTitle>
          <CardDescription>
            This permanently removes transactions, wealth history, budgets, and import history.
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
