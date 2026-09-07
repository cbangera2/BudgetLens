import {
  transactionDetailPath,
  transactionsByImportBatchPath,
  transactionsFilteredPath,
} from "./links"

describe("transaction links", () => {
  it("builds detail paths with encoded ids", () => {
    expect(transactionDetailPath("abc")).toBe("/transactions/abc")
    expect(transactionDetailPath("a/b c")).toBe("/transactions/a%2Fb%20c")
  })

  it("builds combinable facet paths with one param per facet", () => {
    expect(transactionsFilteredPath({})).toBe("/transactions")
    expect(transactionsFilteredPath({ category: "Dining" })).toBe("/transactions?category=Dining")
    expect(
      transactionsFilteredPath({ merchant: "Coffee Shop", category: "Dining", account: "Card" }),
    ).toBe("/transactions?merchant=Coffee+Shop&category=Dining&account=Card")
  })

  it("builds import-batch filtered paths with encoded ids", () => {
    expect(transactionsByImportBatchPath("batch-1")).toBe("/transactions?importBatch=batch-1")
    expect(transactionsByImportBatchPath("a/b c")).toBe("/transactions?importBatch=a%2Fb+c")
  })
})
