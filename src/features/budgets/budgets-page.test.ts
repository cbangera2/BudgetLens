import { budgetPeriodPrefix, budgetValues } from "./budgets-page"

describe("budget form values", () => {
  it("converts currency to integer minor units", () => {
    expect(budgetValues(" Groceries ", "250.555", "monthly")).toEqual({
      category: "Groceries",
      amountMinor: 25_056,
      period: "monthly",
    })
  })
  it("rejects invalid goals", () => {
    expect(budgetValues("", "100", "monthly")).toBeNull()
    expect(budgetValues("Dining", "0", "monthly")).toBeNull()
    expect(budgetValues("Dining", "100", "weekly")).toBeNull()
  })
})

describe("budget period prefix", () => {
  it("derives monthly prefixes as YYYY-MM", () => {
    expect(budgetPeriodPrefix("monthly", "2026-09-15")).toBe("2026-09")
    expect(budgetPeriodPrefix("monthly", "2026-01-05")).toBe("2026-01")
  })
  it("derives yearly prefixes as YYYY", () => {
    expect(budgetPeriodPrefix("yearly", "2026-09-15")).toBe("2026")
    expect(budgetPeriodPrefix("yearly", "2026-01-05")).toBe("2026")
  })
  it("handles January and year boundaries without rolling", () => {
    expect(budgetPeriodPrefix("monthly", "2026-01-01")).toBe("2026-01")
    expect(budgetPeriodPrefix("yearly", "2026-01-01")).toBe("2026")
    expect(budgetPeriodPrefix("monthly", "2025-12-31")).toBe("2025-12")
    expect(budgetPeriodPrefix("yearly", "2025-12-31")).toBe("2025")
    expect(budgetPeriodPrefix("monthly", "2025-01-31")).toBe("2025-01")
  })
})
