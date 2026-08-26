import { useId, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import type { Transaction, TransactionDraft, TransactionGroup } from "@/domain/models"
import { DEFAULT_SHARE_COUNT, effectiveTransactionAmountMinor } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

const NO_GROUPS: readonly TransactionGroup[] = []
const NEW_VALUE = "__new__"

export interface TransactionFormValues {
  date: string
  description: string
  amount: string
  category: string
  transactionType: string
  accountName: string
  accountType: string
  provider: string
  notes: string
  groupId: string
  shared: boolean
  shareCount: number
}

function initialValues(transaction?: Transaction): TransactionFormValues {
  return {
    date: transaction?.date ?? "",
    description: transaction?.description ?? "",
    amount: transaction
      ? String(
          normalizeTransactionAmountMinor(transaction.amountMinor, transaction.transactionType) /
            100,
        )
      : "",
    category: transaction?.category ?? "",
    transactionType: transaction?.transactionType ?? "",
    accountName: transaction?.accountName ?? "",
    accountType: transaction?.accountType ?? "",
    provider: transaction?.provider ?? "",
    notes: transaction?.notes ?? "",
    groupId: transaction?.groupId ?? "",
    shared: transaction?.shared ?? false,
    shareCount: transaction?.shareCount ?? DEFAULT_SHARE_COUNT,
  }
}
export function valuesToDraft(values: TransactionFormValues): TransactionDraft | null {
  const amount = Number(values.amount)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(values.date) ||
    !values.description.trim() ||
    !Number.isFinite(amount) ||
    amount === 0
  )
    return null

  const shareCount =
    Number.isInteger(values.shareCount) && values.shareCount >= 2 && values.shareCount <= 10
      ? values.shareCount
      : DEFAULT_SHARE_COUNT

  return {
    date: values.date,
    description: values.description.trim(),
    amountMinor: Math.sign(amount) * Math.round(Math.abs(amount) * 100),
    category: values.category?.trim() || null,
    transactionType: values.transactionType?.trim() || null,
    accountName: values.accountName?.trim() || null,
    accountType: values.accountType?.trim() || null,
    provider: values.provider?.trim() || null,
    labels: [],
    notes: values.notes?.trim() || null,
    groupId: values.groupId || null,
    shared: values.shared,
    shareCount: values.shared ? shareCount : DEFAULT_SHARE_COUNT,
  }
}

export function TransactionForm({
  transaction,
  groups = NO_GROUPS,
  fieldOptions,
  onSubmit,
  onCancel,
}: {
  transaction?: Transaction
  groups?: readonly TransactionGroup[]
  fieldOptions?: Partial<
    Record<
      "category" | "transactionType" | "accountName" | "accountType" | "provider",
      readonly string[]
    >
  >
  onSubmit: (draft: TransactionDraft) => Promise<void>
  onCancel: () => void
}) {
  const id = useId()
  const [values, setValues] = useState(() => initialValues(transaction))
  const [customActive, setCustomActive] = useState<Record<string, boolean>>({})
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof TransactionFormValues>(key: K, value: TransactionFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  function updateShared(shared: boolean) {
    setValues((current) => ({
      ...current,
      shared,
      shareCount:
        current.shareCount >= 2 && current.shareCount <= 10
          ? current.shareCount
          : DEFAULT_SHARE_COUNT,
    }))
  }

  const amountNumber = Number(values.amount)
  const rawMinor =
    Number.isFinite(amountNumber) && amountNumber !== 0
      ? Math.sign(amountNumber) * Math.round(Math.abs(amountNumber) * 100)
      : null
  const normalizedPreviewMinor =
    rawMinor === null
      ? null
      : normalizeTransactionAmountMinor(rawMinor, values.transactionType || null)
  const previewAmount =
    normalizedPreviewMinor === null
      ? null
      : effectiveTransactionAmountMinor(normalizedPreviewMinor, values.shared, values.shareCount)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const draft = valuesToDraft(values)
    if (!draft) return setError("Enter a valid date, description, and non-zero amount.")
    setSaving(true)
    setError("")
    try {
      await onSubmit(draft)
    } catch {
      setError("The transaction could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        void submit(event)
      }}
      noValidate
    >
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-date`}>Date</Label>
          <Input
            id={`${id}-date`}
            type="date"
            required
            value={values.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-description`}>Description</Label>
          <Input
            id={`${id}-description`}
            required
            maxLength={200}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-amount`}>Amount</Label>
          <Input
            id={`${id}-amount`}
            type="number"
            inputMode="decimal"
            step="0.01"
            required
            aria-describedby={`${id}-amount-help`}
            value={values.amount}
            onChange={(e) => set("amount", e.target.value)}
          />
          <p id={`${id}-amount-help`} className="text-xs text-muted-foreground">
            Use a negative amount for an expense.
          </p>
        </div>
        {(
          [
            ["category", "Category"],
            ["transactionType", "Transaction type"],
            ["accountName", "Account name"],
            ["accountType", "Account type"],
            ["provider", "Provider"],
          ] as const
        ).map(([key, label]) => {
          const options = [...(fieldOptions?.[key] ?? [])].toSorted()
          const current = values[key] ?? ""
          const isCustom =
            Boolean(customActive[key]) || (current !== "" && !options.includes(current))
          const selectValue = isCustom ? NEW_VALUE : current
          return (
            <div className="grid gap-1.5" key={key}>
              <Label htmlFor={`${id}-${key}`}>{label}</Label>
              <Select
                id={`${id}-${key}`}
                value={selectValue}
                placeholder="Select or add new"
                aria-label={label}
                onValueChange={(next) => {
                  if (next === NEW_VALUE) {
                    setCustomActive((prev) => ({ ...prev, [key]: true }))
                    set(key, "")
                  } else {
                    setCustomActive((prev) => ({ ...prev, [key]: false }))
                    set(key, next)
                  }
                }}
                options={[
                  { value: NEW_VALUE, label: "— Add new —" },
                  ...options.map((option) => ({ value: option, label: option })),
                ]}
              />
              {isCustom && (
                <Input
                  id={`${id}-${key}-custom`}
                  aria-label={`${label} custom value`}
                  placeholder={`Enter ${label.toLowerCase()}`}
                  maxLength={100}
                  value={current}
                  onChange={(event) => {
                    setCustomActive((prev) => ({ ...prev, [key]: true }))
                    set(key, event.target.value)
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-group`}>Group (optional)</Label>
          <select
            id={`${id}-group`}
            className={selectClass}
            value={values.groupId}
            onChange={(event) => set("groupId", event.target.value)}
          >
            <option value="">No group</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid content-end gap-2">
          <label className="flex items-center gap-2 text-sm font-medium" htmlFor={`${id}-shared`}>
            <input
              id={`${id}-shared`}
              type="checkbox"
              checked={values.shared}
              onChange={(event) => updateShared(event.target.checked)}
            />
            Shared (split cost)
          </label>
          {values.shared && (
            <div className="flex items-center gap-2">
              <Label htmlFor={`${id}-share-count`} className="text-xs text-muted-foreground">
                Divide by
              </Label>
              <Input
                id={`${id}-share-count`}
                type="number"
                min={2}
                max={10}
                step={1}
                className="h-9 w-20"
                value={values.shareCount}
                onChange={(event) => set("shareCount", Number(event.target.value))}
              />
            </div>
          )}
          {previewAmount !== null && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Counts as{" "}
              {new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(
                previewAmount / 100,
              )}{" "}
              in group analytics.
            </p>
          )}
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-notes`}>Notes</Label>
        <textarea
          id={`${id}-notes`}
          maxLength={500}
          className="min-h-20 rounded-lg border bg-background p-3 text-sm"
          value={values.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : transaction ? "Save changes" : "Add transaction"}
        </Button>
      </div>
    </form>
  )
}
