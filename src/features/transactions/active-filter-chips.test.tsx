import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ActiveFilterChips, activeFilters } from "./active-filter-chips"
import { defaultTransactionFilters, type TransactionViewFilters } from "./filtering"

afterEach(() => {
  cleanup()
})

describe("activeFilters", () => {
  it("returns nothing for default filters", () => {
    expect(activeFilters(defaultTransactionFilters, [])).toEqual([])
  })

  it("flattens search, preset date, facets, excludes, group, and sort", () => {
    const chips = activeFilters(
      {
        ...defaultTransactionFilters,
        search: "deli",
        from: "2026-01-01",
        to: "2026-12-31",
        categories: ["Dining"],
        excludedAccounts: ["Cash"],
        group: "g1",
        sort: "amount-desc",
      },
      [{ id: "g1", name: "Trip" }],
    )
    expect(chips.map((chip) => chip.label)).toEqual([
      "Search: deli",
      "Date: 2026-01-01 → 2026-12-31",
      "Category: Dining",
      "Account ≠ Cash",
      "Group: Trip",
      "Sort: Amount: high to low",
    ])
  })

  it("clears one value without touching siblings", () => {
    const chips = activeFilters(
      { ...defaultTransactionFilters, categories: ["Dining", "Groceries"] },
      [],
    )
    const dining = chips.find((chip) => chip.key === "categories:Dining")
    expect(dining?.clear).toEqual({ categories: ["Groceries"] })
  })
})

describe("ActiveFilterChips", () => {
  it("renders nothing when no filters apply", () => {
    const { container } = render(
      <ActiveFilterChips
        filters={defaultTransactionFilters}
        groups={[]}
        onRemove={() => undefined}
        onClear={() => undefined}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("removes one chip and clears all", async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn<(patch: Partial<TransactionViewFilters>) => void>()
    const onClear = vi.fn<() => void>()
    render(
      <ActiveFilterChips
        filters={{ ...defaultTransactionFilters, search: "deli", categories: ["Dining"] }}
        groups={[]}
        onRemove={onRemove}
        onClear={onClear}
      />,
    )
    expect(screen.getByLabelText("Active filters")).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Remove Search: deli filter" }))
    expect(onRemove).toHaveBeenCalledWith({ search: "" })

    await user.click(screen.getByRole("button", { name: "Clear all" }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
