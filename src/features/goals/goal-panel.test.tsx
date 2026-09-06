import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import type { WealthSnapshot } from "@/domain/models"
import { GoalPanel } from "@/features/goals/goal-panel"
import type { NetWorthGoal } from "@/features/goals/model"

function snapshot(series: WealthSnapshot["series"], date: string, valueMinor: number) {
  return {
    id: `${series}-${date}`,
    series,
    date,
    valueMinor,
    importBatchId: "synthetic-batch",
    fingerprint: `synthetic-${series}-${date}`,
    createdAt: `${date}T12:00:00.000Z`,
  } satisfies WealthSnapshot
}

const history = [
  snapshot("netWorth", "2026-01-01", 10_000_00),
  snapshot("netWorth", "2026-01-31", 13_000_00),
]

function Harness({
  initialGoal,
  onSave,
  onClear,
}: {
  initialGoal?: NetWorthGoal | null
  onSave: (goal: NetWorthGoal) => void
  onClear: () => void
}) {
  const [goal, setGoal] = useState<NetWorthGoal | null>(initialGoal ?? null)
  return (
    <GoalPanel
      snapshots={history}
      today="2026-02-01"
      locale="en-US"
      goal={goal}
      onSave={(next) => {
        setGoal(next)
        onSave(next)
      }}
      onClear={() => {
        setGoal(null)
        onClear()
      }}
    />
  )
}

describe("GoalPanel", () => {
  it("saves a goal from the form and shows the pace projection", () => {
    const onSave = vi.fn<(goal: NetWorthGoal) => void>()
    render(<Harness onSave={onSave} onClear={() => undefined} />)
    fireEvent.change(screen.getByLabelText("Target amount"), { target: { value: "20000" } })
    fireEvent.change(screen.getByLabelText("Target date"), { target: { value: "2027-02-28" } })
    fireEvent.click(screen.getByRole("button", { name: "Save goal" }))
    expect(onSave).toHaveBeenCalledWith({ targetAmountMinor: 20_000_00, targetDate: "2027-02-28" })
    expect(screen.getByText(/Current pace/)).toBeInTheDocument()
    expect(screen.getByText(/Projected to reach the target/)).toBeInTheDocument()
    expect(screen.getByText(/Required pace/)).toBeInTheDocument()
  })

  it("rejects an invalid goal without calling save", () => {
    const onSave = vi.fn<(goal: NetWorthGoal) => void>()
    render(<Harness onSave={onSave} onClear={() => undefined} />)
    fireEvent.change(screen.getByLabelText("Target amount"), { target: { value: "0" } })
    fireEvent.click(screen.getByRole("button", { name: "Save goal" }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toBeInTheDocument()
  })

  it("deletes the active goal and hides the projection", () => {
    const onClear = vi.fn<() => void>()
    render(
      <Harness
        initialGoal={{ targetAmountMinor: 20_000_00, targetDate: "2027-02-28" }}
        onSave={() => undefined}
        onClear={onClear}
      />,
    )
    expect(screen.getByText(/Current pace/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Delete goal" }))
    expect(onClear).toHaveBeenCalled()
    expect(screen.queryByText(/Current pace/)).not.toBeInTheDocument()
  })

  it("explains a single observation instead of projecting", () => {
    render(
      <GoalPanel
        snapshots={[snapshot("netWorth", "2026-01-01", 10_000_00)]}
        today="2026-02-01"
        locale="en-US"
        goal={{ targetAmountMinor: 20_000_00, targetDate: "2027-02-28" }}
        onSave={() => undefined}
        onClear={() => undefined}
      />,
    )
    expect(screen.getByText(/single observation cannot set a pace/i)).toBeInTheDocument()
  })
})
