import { beforeEach, describe, expect, it, vi } from "vitest"

import { BudgetLensDatabase } from "@/db/database"
import { createRepositories } from "@/db/repositories"
import type { BudgetGoal, Transaction } from "@/domain/models"
import type { BudgetLensRepositories } from "@/domain/repositories"

interface UndoToastAction {
  label: string
  onClick: () => void
}

interface UndoToastOptions {
  action?: UndoToastAction
  description?: string
  duration?: number
}

const sonnerMocks = vi.hoisted(() => ({
  toast: vi.fn<(message: string, options?: UndoToastOptions) => void>(),
  success: vi.fn<(message: string) => void>(),
  error: vi.fn<(message: string) => void>(),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(sonnerMocks.toast, {
    success: sonnerMocks.success,
    error: sonnerMocks.error,
  }),
}))

import {
  UNDO_TTL_MS,
  clearUndo,
  notifyDeletedWithUndo,
  peekUndo,
  restoreUndo,
  stashUndo,
  takeUndo,
  type UndoSnapshot,
} from "@/lib/undo-buffer"

function syntheticTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-synthetic-1",
    date: "2026-03-04",
    description: "Synthetic Market",
    amountMinor: -4250,
    category: "Groceries",
    transactionType: "Debit",
    accountName: "Sample Checking",
    accountType: "Checking",
    provider: "Sample Bank",
    labels: ["weekly"],
    notes: null,
    groupId: null,
    shared: false,
    shareCount: 2,
    importBatchId: "manual",
    fingerprint: "synthetic-fingerprint",
    createdAt: "2026-03-04T00:00:00.000Z",
    updatedAt: "2026-03-04T00:00:00.000Z",
    ...overrides,
  }
}

function syntheticBudget(overrides: Partial<BudgetGoal> = {}): BudgetGoal {
  return {
    id: "budget-synthetic-groceries",
    category: "Groceries",
    amountMinor: 50_000,
    period: "monthly",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  }
}

function transactionEntry(transaction?: Transaction): UndoSnapshot {
  return { kind: "transaction", transaction: transaction ?? syntheticTransaction() }
}

describe("undo buffer", () => {
  beforeEach(() => {
    clearUndo()
    vi.clearAllMocks()
  })

  it("stores and takes the last-deleted snapshot exactly once", () => {
    const entry = transactionEntry()
    stashUndo(entry, 1_000)

    expect(takeUndo(undefined, 1_000)).toBe(entry)
    expect(takeUndo(undefined, 1_000)).toBeNull()
    expect(peekUndo(1_000)).toBeNull()
  })

  it("peeks without consuming the snapshot", () => {
    const entry = transactionEntry()
    stashUndo(entry, 1_000)

    expect(peekUndo(1_000)).toBe(entry)
    expect(takeUndo(undefined, 1_000)).toBe(entry)
  })

  it("expires entries after the TTL", () => {
    const entry = transactionEntry()
    stashUndo(entry, 1_000)

    expect(peekUndo(1_000 + UNDO_TTL_MS)).toBe(entry)
    expect(takeUndo(undefined, 1_000 + UNDO_TTL_MS + 1)).toBeNull()
    expect(peekUndo(1_000 + UNDO_TTL_MS + 1)).toBeNull()
  })

  it("discards the previous snapshot when a second delete lands", () => {
    const first = transactionEntry(syntheticTransaction({ id: "tx-first" }))
    const second = transactionEntry(syntheticTransaction({ id: "tx-second" }))
    stashUndo(first, 1_000)
    stashUndo(second, 2_000)

    expect(takeUndo(undefined, 2_000)).toBe(second)
    expect(takeUndo(undefined, 2_000)).toBeNull()
  })

  it("refuses a stale Undo token after a newer delete", () => {
    const first = transactionEntry(syntheticTransaction({ id: "tx-first" }))
    const second = transactionEntry(syntheticTransaction({ id: "tx-second" }))
    const staleToken = stashUndo(first, 1_000)
    const freshToken = stashUndo(second, 2_000)

    expect(takeUndo(staleToken, 2_000)).toBeNull()
    expect(peekUndo(2_000)).toBe(second)
    expect(takeUndo(freshToken, 2_000)).toBe(second)
  })
})

describe("restoreUndo round-trips", () => {
  let db: BudgetLensDatabase
  let repos: BudgetLensRepositories

  beforeEach(() => {
    db = new BudgetLensDatabase(`budgetlens-undo-${crypto.randomUUID()}`)
    repos = createRepositories(db)
    clearUndo()
  })

  afterEach(async () => {
    await db.delete()
  })

  it("restores a transaction with identical fields but a fresh id", async () => {
    const created = await repos.transactions.add({
      date: "2026-03-04",
      description: "Synthetic Market",
      amountMinor: -4250,
      category: "Groceries",
      transactionType: "Debit",
      accountName: "Sample Checking",
      accountType: "Checking",
      provider: "Sample Bank",
      labels: ["weekly"],
      notes: null,
    })
    const snapshot = await repos.transactions.get(created.id)
    expect(snapshot).toBeDefined()
    await repos.transactions.remove(created.id)

    stashUndo({ kind: "transaction", transaction: snapshot! }, 1_000)
    await restoreUndo(takeUndo(undefined, 1_000)!, repos)

    const rows = await repos.transactions.list()
    expect(rows).toHaveLength(1)
    // transactions.add always mints a fresh id, so undo cannot reuse the old one.
    expect(rows[0]!.id).not.toBe(created.id)
    expect(rows[0]).toMatchObject({
      description: "Synthetic Market",
      amountMinor: -4250,
      category: "Groceries",
      labels: ["weekly"],
    })
  })

  it("restores a budget reusing the original id", async () => {
    const goal = syntheticBudget()
    await repos.budgets.put(goal)
    await repos.budgets.remove(goal.id)

    stashUndo({ kind: "budget", budget: goal }, 1_000)
    await restoreUndo(takeUndo(undefined, 1_000)!, repos)

    // budgets.put writes the full goal including its id.
    const rows = await repos.budgets.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: goal.id, category: "Groceries", amountMinor: 50_000 })
  })

  it("restores a group with a fresh id and re-attaches detached members", async () => {
    const group = await repos.transactionGroups.put({ name: "Synthetic Trip", color: "violet" })
    const member = await repos.transactions.add({
      date: "2026-03-05",
      description: "Synthetic Cab",
      amountMinor: -1500,
      category: "Travel",
      transactionType: null,
      accountName: null,
      accountType: null,
      provider: null,
      labels: [],
      notes: null,
      groupId: group.id,
    })
    const snapshot = (await repos.transactionGroups.get(group.id))!
    await repos.transactionGroups.remove(group.id)
    expect((await repos.transactions.get(member.id))?.groupId).toBeNull()

    stashUndo({ kind: "group", group: snapshot, memberIds: [member.id] }, 1_000)
    await restoreUndo(takeUndo(undefined, 1_000)!, repos)

    // transactionGroups.put mints a fresh id for deleted rows, so undo cannot
    // reuse the old one; members follow the restored group instead.
    const groups = await repos.transactionGroups.list({ includeArchived: true })
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ name: "Synthetic Trip", color: "violet" })
    expect((await repos.transactions.get(member.id))?.groupId).toBe(groups[0]!.id)
  })

  it("never steals a member that moved to another group during the undo window", async () => {
    const group = await repos.transactionGroups.put({ name: "Synthetic Trip", color: "violet" })
    const other = await repos.transactionGroups.put({ name: "Synthetic Stay", color: "blue" })
    const member = await repos.transactions.add({
      date: "2026-03-05",
      description: "Synthetic Cab",
      amountMinor: -1500,
      category: "Travel",
      transactionType: null,
      accountName: null,
      accountType: null,
      provider: null,
      labels: [],
      notes: null,
      groupId: group.id,
    })
    const snapshot = (await repos.transactionGroups.get(group.id))!
    await repos.transactionGroups.remove(group.id)
    await repos.transactions.update(member.id, { groupId: other.id })

    stashUndo({ kind: "group", group: snapshot, memberIds: [member.id] }, 1_000)
    await restoreUndo(takeUndo(undefined, 1_000)!, repos)

    const groups = await repos.transactionGroups.list({ includeArchived: true })
    expect(groups.map((row) => row.name).toSorted()).toEqual(["Synthetic Stay", "Synthetic Trip"])
    expect((await repos.transactions.get(member.id))?.groupId).toBe(other.id)
  })
})

describe("notifyDeletedWithUndo", () => {
  let db: BudgetLensDatabase
  let repos: BudgetLensRepositories

  beforeEach(() => {
    db = new BudgetLensDatabase(`budgetlens-undo-notify-${crypto.randomUUID()}`)
    repos = createRepositories(db)
    clearUndo()
  })

  afterEach(async () => {
    await db.delete()
  })

  it("toasts an Undo action that restores the deleted budget", async () => {
    const goal = syntheticBudget()
    await repos.budgets.put(goal)
    await repos.budgets.remove(goal.id)

    notifyDeletedWithUndo("Budget", { kind: "budget", budget: goal }, { repos })

    expect(sonnerMocks.toast).toHaveBeenCalledTimes(1)
    expect(sonnerMocks.toast.mock.calls[0]?.[0]).toBe("Budget deleted")
    const action = sonnerMocks.toast.mock.calls[0]?.[1]?.action
    expect(action?.label).toBe("Undo")

    action?.onClick()
    await vi.waitFor(async () => {
      expect(await repos.budgets.list()).toHaveLength(1)
    })
    expect(sonnerMocks.success).toHaveBeenCalledWith("Budget restored")
  })

  it("reports expiry when the Undo action fires after the TTL", async () => {
    const now = 5_000
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now)
    try {
      notifyDeletedWithUndo("Budget", { kind: "budget", budget: syntheticBudget() }, { repos })
      nowSpy.mockReturnValue(now + UNDO_TTL_MS + 1)

      const action = sonnerMocks.toast.mock.calls[0]?.[1]?.action
      action?.onClick()

      await vi.waitFor(() => {
        expect(sonnerMocks.error).toHaveBeenCalledWith("Undo expired")
      })
      expect(await repos.budgets.list()).toHaveLength(0)
    } finally {
      nowSpy.mockRestore()
    }
  })
})
