import { useId, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Transaction, TransactionDraft } from "@/domain/models"
import { normalizeTransactionAmountMinor } from "@/domain/transaction-amount"

export type TransactionFormValues = Pick<
  TransactionDraft,
  | "date"
  | "description"
  | "category"
  | "transactionType"
  | "accountName"
  | "accountType"
  | "provider"
  | "notes"
> & { amount: string }

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
  }
}

export function TransactionForm({
  transaction,
  onSubmit,
  onCancel,
}: {
  transaction?: Transaction
  onSubmit: (draft: TransactionDraft) => Promise<void>
  onCancel: () => void
}) {
  const id = useId()
  const [values, setValues] = useState(() => initialValues(transaction))
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const set = (key: keyof TransactionFormValues, value: string) =>
    setValues((current) => ({ ...current, [key]: value }))

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
        {(["category", "transactionType", "accountName", "accountType", "provider"] as const).map(
          (key) => (
            <div className="grid gap-1.5" key={key}>
              <Label htmlFor={`${id}-${key}`}>
                {
                  {
                    category: "Category",
                    transactionType: "Transaction type",
                    accountName: "Account name",
                    accountType: "Account type",
                    provider: "Provider",
                  }[key]
                }
              </Label>
              <Input
                id={`${id}-${key}`}
                maxLength={100}
                value={values[key] ?? ""}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ),
        )}
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
