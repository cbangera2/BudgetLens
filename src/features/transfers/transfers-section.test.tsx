import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Toaster } from "sonner"

import { buildTransaction } from "@/test/factories"

import { detectTransferPairs } from "./detection"
import {
  TRANSFER_FLAGS_STORAGE_KEY,
  useTransferFlags,
  type TransferFlagActions,
  type TransferFlags,
} from "./store"
import { resolveDismissTargets, TransfersSection } from "./transfers-section"

const rows = [
  buildTransaction({
    id: "out",
    date: "2026-03-01",
    description: "Synthetic transfer out",
    amountMinor: -25_000,
    category: "Transfer",
    transactionType: "Debit",
    accountName: "Everyday Checking",
  }),
  buildTransaction({
    id: "in",
    date: "2026-03-02",
    description: "Synthetic transfer in",
    amountMinor: 25_000,
    category: "Transfer",
    transactionType: "Credit",
    accountName: "Beacon Savings",
  }),
  buildTransaction({
    id: "grocery",
    date: "2026-03-05",
    description: "Synthetic Groceries",
    amountMinor: -4_250,
    category: "Groceries",
    accountName: "Everyday Checking",
  }),
]

function stubActions(confirmed: readonly string[] = []): TransferFlagActions {
  return {
    flags: Object.fromEntries(confirmed.map((id) => [id, "confirmed"] as const)),
    confirmedIds: new Set(confirmed),
    dismissedIds: new Set(),
    confirmPair: () => undefined,
    dismissPair: () => undefined,
    dismissPairs: () => undefined,
    restoreTransferFlags: () => undefined,
    clearFlag: () => undefined,
  }
}

const bulkRows = [
  buildTransaction({
    id: "out-a",
    date: "2026-03-01",
    description: "Synthetic transfer out A",
    amountMinor: -25_000,
    category: "Transfer",
    transactionType: "Debit",
    accountName: "Everyday Checking",
  }),
  buildTransaction({
    id: "in-a",
    date: "2026-03-02",
    description: "Synthetic transfer in A",
    amountMinor: 25_000,
    category: "Transfer",
    transactionType: "Credit",
    accountName: "Beacon Savings",
  }),
  buildTransaction({
    id: "out-b",
    date: "2026-03-10",
    description: "Synthetic transfer out B",
    amountMinor: -12_000,
    category: "Transfer",
    transactionType: "Debit",
    accountName: "Everyday Checking",
  }),
  buildTransaction({
    id: "in-b",
    date: "2026-03-11",
    description: "Synthetic transfer in B",
    amountMinor: 12_000,
    category: "Transfer",
    transactionType: "Credit",
    accountName: "Beacon Savings",
  }),
]

function stubSpyActions(): TransferFlagActions & {
  confirmPair: ReturnType<typeof vi.fn>
  dismissPair: ReturnType<typeof vi.fn>
  dismissPairs: ReturnType<typeof vi.fn>
  restoreTransferFlags: ReturnType<typeof vi.fn>
} {
  return {
    flags: {},
    confirmedIds: new Set(),
    dismissedIds: new Set(),
    confirmPair: vi.fn<(expenseId: string, incomeId: string) => void>(),
    dismissPair: vi.fn<(expenseId: string, incomeId: string) => void>(),
    dismissPairs: vi.fn<(pairs: readonly { expenseId: string; incomeId: string }[]) => void>(),
    restoreTransferFlags: vi.fn<(snapshot: TransferFlags, ids: readonly string[]) => void>(),
    clearFlag: () => undefined,
  }
}

describe("transfers section", () => {
  it("excludes a fully confirmed pair from spending", () => {
    render(<TransfersSection transactions={rows} flagActions={stubActions(["out", "in"])} />)
    expect(screen.getByText(/42\.50/)).toBeVisible()
    expect(screen.getByText(/excluded 2 transfer rows/)).toBeVisible()
  })

  it("ignores an orphaned confirmation that no longer forms a pair", () => {
    const withoutIncome = rows.filter((row) => row.id !== "in")
    render(
      <TransfersSection transactions={withoutIncome} flagActions={stubActions(["out", "in"])} />,
    )
    expect(screen.getByText(/No transfers detected yet/)).toBeVisible()
    expect(screen.getByText(/292\.50/)).toBeVisible()
    expect(screen.getByText(/excluded 0 transfer rows/)).toBeVisible()
  })

  it("disables approve-all with an empty selection", () => {
    render(<TransfersSection transactions={bulkRows} flagActions={stubActions()} />)
    expect(screen.getByText("0 of 2 selected")).toBeVisible()
    const approveAll = screen.getByRole("button", { name: "Approve all 0" })
    expect(approveAll).toBeDisabled()
    expect(
      screen.getByRole("checkbox", {
        name: "Select transfer Synthetic transfer out A and Synthetic transfer in A",
      }),
    ).not.toBeChecked()
    expect(
      screen.getByRole("checkbox", {
        name: "Select transfer Synthetic transfer out B and Synthetic transfer in B",
      }),
    ).not.toBeChecked()
  })

  it("toggles select-all and select-none", async () => {
    const user = userEvent.setup()
    render(<TransfersSection transactions={bulkRows} flagActions={stubActions()} />)
    const selectAll = screen.getByRole("checkbox", { name: "Select all suggested transfers" })

    await user.click(selectAll)
    expect(screen.getByText("2 of 2 selected")).toBeVisible()
    expect(screen.getByRole("button", { name: "Approve all 2" })).toBeEnabled()
    expect(
      screen.getByRole("checkbox", {
        name: "Select transfer Synthetic transfer out A and Synthetic transfer in A",
      }),
    ).toBeChecked()
    expect(
      screen.getByRole("checkbox", {
        name: "Select transfer Synthetic transfer out B and Synthetic transfer in B",
      }),
    ).toBeChecked()

    await user.click(selectAll)
    expect(screen.getByText("0 of 2 selected")).toBeVisible()
    expect(screen.getByRole("button", { name: "Approve all 0" })).toBeDisabled()
  })

  it("approves each selected pair through the per-pair confirm path exactly once", async () => {
    const user = userEvent.setup()
    const actions = stubSpyActions()
    render(<TransfersSection transactions={bulkRows} flagActions={actions} />)

    await user.click(
      screen.getByRole("checkbox", {
        name: "Select transfer Synthetic transfer out A and Synthetic transfer in A",
      }),
    )
    await user.click(
      screen.getByRole("checkbox", {
        name: "Select transfer Synthetic transfer out B and Synthetic transfer in B",
      }),
    )
    await user.click(screen.getByRole("button", { name: "Approve all 2" }))

    expect(actions.confirmPair).toHaveBeenCalledTimes(2)
    expect(actions.confirmPair).toHaveBeenCalledWith("out-a", "in-a")
    expect(actions.confirmPair).toHaveBeenCalledWith("out-b", "in-b")
    expect(actions.dismissPair).not.toHaveBeenCalled()
  })

  it("approves only the selected pair on a partial selection", async () => {
    const user = userEvent.setup()
    const actions = stubSpyActions()
    render(<TransfersSection transactions={bulkRows} flagActions={actions} />)

    await user.click(
      screen.getByRole("checkbox", {
        name: "Select transfer Synthetic transfer out B and Synthetic transfer in B",
      }),
    )
    await user.click(screen.getByRole("button", { name: "Approve all 1" }))

    expect(actions.confirmPair).toHaveBeenCalledTimes(1)
    expect(actions.confirmPair).toHaveBeenCalledWith("out-b", "in-b")
  })

  it("preserves per-pair confirm and dismiss", async () => {
    const user = userEvent.setup()
    const actions = stubSpyActions()
    render(<TransfersSection transactions={bulkRows} flagActions={actions} />)

    await user.click(
      screen.getByRole("button", {
        name: "Confirm transfer Synthetic transfer out A and Synthetic transfer in A",
      }),
    )
    expect(actions.confirmPair).toHaveBeenCalledTimes(1)
    expect(actions.confirmPair).toHaveBeenCalledWith("out-a", "in-a")

    await user.click(
      screen.getByRole("button", {
        name: "Dismiss transfer Synthetic transfer out B and Synthetic transfer in B",
      }),
    )
    expect(actions.dismissPair).toHaveBeenCalledTimes(1)
    expect(actions.dismissPair).toHaveBeenCalledWith("out-b", "in-b")
  })

  it("requires confirm before dismiss-all touches any flags", async () => {
    const user = userEvent.setup()
    const actions = stubSpyActions()
    render(<TransfersSection transactions={bulkRows} flagActions={actions} />)

    await user.click(screen.getByRole("button", { name: "Dismiss all 2" }))
    expect(actions.dismissPairs).not.toHaveBeenCalled()
    expect(actions.dismissPair).not.toHaveBeenCalled()
    expect(
      screen.getByRole("alertdialog", { name: "Dismiss 2 suggested transfers?" }),
    ).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(actions.dismissPairs).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("dismisses only the checked subset on a partial selection", async () => {
    const user = userEvent.setup()
    const actions = stubSpyActions()
    render(<TransfersSection transactions={bulkRows} flagActions={actions} />)

    await user.click(
      screen.getByRole("checkbox", {
        name: "Select transfer Synthetic transfer out B and Synthetic transfer in B",
      }),
    )
    expect(screen.getByRole("button", { name: "Dismiss all 1" })).toBeEnabled()
    await user.click(screen.getByRole("button", { name: "Dismiss all 1" }))
    await user.click(screen.getByRole("button", { name: "Dismiss" }))

    expect(actions.dismissPairs).toHaveBeenCalledTimes(1)
    expect(actions.dismissPairs).toHaveBeenCalledWith([
      expect.objectContaining({ expenseId: "out-b", incomeId: "in-b" }),
    ])
    expect(actions.confirmPair).not.toHaveBeenCalled()
  })

  it("dismisses every visible suggestion when nothing is checked", async () => {
    const user = userEvent.setup()
    const actions = stubSpyActions()
    render(<TransfersSection transactions={bulkRows} flagActions={actions} />)

    expect(screen.getByRole("button", { name: "Dismiss all 2" })).toBeEnabled()
    await user.click(screen.getByRole("button", { name: "Dismiss all 2" }))
    await user.click(screen.getByRole("button", { name: "Dismiss" }))

    expect(actions.dismissPairs).toHaveBeenCalledTimes(1)
    const pairs = actions.dismissPairs.mock.calls[0]?.[0] ?? []
    expect(pairs).toHaveLength(2)
    expect(pairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ expenseId: "out-a", incomeId: "in-a" }),
        expect.objectContaining({ expenseId: "out-b", incomeId: "in-b" }),
      ]),
    )
  })

  it("persists bulk dismissal and restores it through the undo toast", async () => {
    window.localStorage.clear()
    const user = userEvent.setup()
    function Harness() {
      const flagActions = useTransferFlags()
      return (
        <>
          <Toaster />
          <TransfersSection transactions={bulkRows} flagActions={flagActions} />
        </>
      )
    }
    render(<Harness />)

    await user.click(screen.getByRole("checkbox", { name: "Select all suggested transfers" }))
    await user.click(screen.getByRole("button", { name: "Dismiss all 2" }))
    await user.click(screen.getByRole("button", { name: "Dismiss" }))

    expect(screen.getByText("All detected transfers were dismissed.")).toBeVisible()
    expect(JSON.parse(window.localStorage.getItem(TRANSFER_FLAGS_STORAGE_KEY) ?? "{}")).toEqual({
      "out-a": "dismissed",
      "in-a": "dismissed",
      "out-b": "dismissed",
      "in-b": "dismissed",
    })

    await user.click(screen.getByRole("button", { name: "Undo" }))

    expect(screen.getByText("0 of 2 selected")).toBeVisible()
    expect(
      screen.getByRole("checkbox", {
        name: "Select transfer Synthetic transfer out A and Synthetic transfer in A",
      }),
    ).toBeVisible()
    expect(window.localStorage.getItem(TRANSFER_FLAGS_STORAGE_KEY)).toBeNull()
    window.localStorage.clear()
  })
})

describe("resolveDismissTargets", () => {
  const suggested = detectTransferPairs([
    buildTransaction({
      id: "out-a",
      date: "2026-03-01",
      description: "Synthetic transfer out A",
      amountMinor: -25_000,
      category: "Transfer",
      transactionType: "Debit",
      accountName: "Everyday Checking",
    }),
    buildTransaction({
      id: "in-a",
      date: "2026-03-02",
      description: "Synthetic transfer in A",
      amountMinor: 25_000,
      category: "Transfer",
      transactionType: "Credit",
      accountName: "Beacon Savings",
    }),
    buildTransaction({
      id: "out-b",
      date: "2026-03-10",
      description: "Synthetic transfer out B",
      amountMinor: -12_000,
      category: "Transfer",
      transactionType: "Debit",
      accountName: "Everyday Checking",
    }),
    buildTransaction({
      id: "in-b",
      date: "2026-03-11",
      description: "Synthetic transfer in B",
      amountMinor: 12_000,
      category: "Transfer",
      transactionType: "Credit",
      accountName: "Beacon Savings",
    }),
  ])

  it("returns all visible suggestions when nothing is checked", () => {
    expect(resolveDismissTargets(suggested, new Set())).toHaveLength(2)
  })

  it("returns only the checked subset when any box is checked", () => {
    const targets = resolveDismissTargets(suggested, new Set(["out-b::in-b", "stale::key"]))
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ expenseId: "out-b", incomeId: "in-b" })
  })
})
