import { budgetValues } from "./budgets-page"

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
