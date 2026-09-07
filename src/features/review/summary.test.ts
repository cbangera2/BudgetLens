import { buildTransaction } from "@/test/factories"

import { isReviewQueueEmpty, summarizeReviewQueues } from "./summary"

function transferPair(outId: string, inId: string) {
  return [
    buildTransaction({
      id: outId,
      date: "2026-03-01",
      description: "Synthetic transfer out",
      amountMinor: -25_000,
      category: "Transfer",
      transactionType: "Debit",
      accountName: "Everyday Checking",
    }),
    buildTransaction({
      id: inId,
      date: "2026-03-02",
      description: "Synthetic transfer in",
      amountMinor: 25_000,
      category: "Transfer",
      transactionType: "Credit",
      accountName: "Beacon Savings",
    }),
  ]
}

function subscriptionCharge(date: string, id: string) {
  return buildTransaction({
    id,
    date,
    description: "Synthetic Review Stream",
    amountMinor: -1_200,
    category: "Entertainment",
    transactionType: "Debit",
    accountName: "Everyday Checking",
  })
}

describe("summarizeReviewQueues", () => {
  it("aggregates every queue from synthetic fixtures", () => {
    const transactions = [
      ...transferPair("out-1", "in-1"),
      subscriptionCharge("2026-01-15", "sub-1"),
      subscriptionCharge("2026-02-15", "sub-2"),
      subscriptionCharge("2026-03-15", "sub-3"),
      buildTransaction({ id: "uncategorized-1", category: null }),
      buildTransaction({ id: "uncategorized-2", category: "  " }),
      buildTransaction({ id: "categorized-1", category: "Groceries" }),
    ]
    expect(summarizeReviewQueues({ transactions, transferFlags: {}, ruleCount: 2 })).toEqual({
      transfersQueue: 1,
      subscriptionsFound: 1,
      rulesActive: 2,
      uncategorized: 2,
    })
  })

  it("drops confirmed and dismissed transfer pairs from the queue", () => {
    const transactions = [...transferPair("out-1", "in-1"), ...transferPair("out-2", "in-2")]
    expect(
      summarizeReviewQueues({
        transactions,
        transferFlags: {
          "out-1": "confirmed",
          "in-1": "confirmed",
          "out-2": "dismissed",
          "in-2": "dismissed",
        },
        ruleCount: 0,
      }).transfersQueue,
    ).toBe(0)
  })

  it("reports the all-zero empty state", () => {
    const counts = summarizeReviewQueues({ transactions: [], transferFlags: {}, ruleCount: 0 })
    expect(counts).toEqual({
      transfersQueue: 0,
      subscriptionsFound: 0,
      rulesActive: 0,
      uncategorized: 0,
    })
    expect(isReviewQueueEmpty(counts)).toBe(true)
  })

  it("is not empty while any queue has work", () => {
    expect(
      isReviewQueueEmpty({
        transfersQueue: 0,
        subscriptionsFound: 0,
        rulesActive: 1,
        uncategorized: 0,
      }),
    ).toBe(false)
  })
})
