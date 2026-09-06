import { describe, expect, it } from "vitest"

import { buildTransaction } from "@/test/factories"

import { computeSettlementBalances, settleGroupTransactions, simplifyBalances } from "./settle"

function balanceMap(transactions: Parameters<typeof settleGroupTransactions>[0]) {
  return new Map(
    settleGroupTransactions(transactions).balances.map((b) => [b.member, b.balanceMinor]),
  )
}

describe("settleGroupTransactions", () => {
  it("settles a two-person simple split", () => {
    const transactions = [
      buildTransaction({
        id: "a1",
        description: "Cabin",
        amountMinor: -10_000,
        accountName: "Alice",
        shared: true,
        shareCount: 2,
      }),
      buildTransaction({
        id: "b1",
        description: "Groceries",
        amountMinor: -4_000,
        accountName: "Bob",
        shared: true,
        shareCount: 2,
      }),
    ]
    const result = settleGroupTransactions(transactions)
    expect(result.memberCount).toBe(2)
    // Alice fronted 10000 (share 5000, owed 5000); Bob fronted 4000 (share
    // 2000, owed 2000). Alice net +3000, Bob net -3000.
    expect(balanceMap(transactions)).toEqual(
      new Map([
        ["Alice", 3_000],
        ["Bob", -3_000],
      ]),
    )
    expect(result.transfers).toEqual([{ from: "Bob", to: "Alice", amountMinor: 3_000 }])
  })

  it("simplifies a three-person chain through a zero-net member", () => {
    const transactions = [
      buildTransaction({
        id: "a1",
        description: "Alice pays",
        amountMinor: -10_000,
        accountName: "Alice",
        shared: true,
        shareCount: 2,
      }),
      buildTransaction({
        id: "b1",
        description: "Bob pays",
        amountMinor: -5_000,
        accountName: "Bob",
        shared: true,
        shareCount: 2,
      }),
      buildTransaction({
        id: "c1",
        description: "Charlie personal",
        amountMinor: -100,
        accountName: "Charlie",
        shared: false,
      }),
    ]
    const result = settleGroupTransactions(transactions)
    // Alice +5000 split as -2500/-2500; Bob +2500 split as -1250/-1250.
    // Nets: Alice +3750, Bob 0, Charlie -3750.
    expect(balanceMap(transactions)).toEqual(
      new Map([
        ["Alice", 3_750],
        ["Bob", 0],
        ["Charlie", -3_750],
      ]),
    )
    // Two underlying debts collapse to one direct payback; zero-net Bob excluded.
    expect(result.transfers).toEqual([{ from: "Charlie", to: "Alice", amountMinor: 3_750 }])
  })

  it("collapses a direct A-owes-B, B-owes-C chain to A-pays-C", () => {
    const transfers = simplifyBalances([
      { member: "Alice", balanceMinor: 1_000 },
      { member: "Bob", balanceMinor: 0 },
      { member: "Charlie", balanceMinor: -1_000 },
    ])
    expect(transfers).toEqual([{ from: "Charlie", to: "Alice", amountMinor: 1_000 }])
  })

  it("never inflates transfers for unbalanced input", () => {
    const transfers = simplifyBalances([
      { member: "Alice", balanceMinor: 1_000 },
      { member: "Bob", balanceMinor: -400 },
    ])
    expect(transfers).toEqual([{ from: "Bob", to: "Alice", amountMinor: 400 }])
  })

  it("uses existing shareCount rounding for uneven splits and conserves exactly", () => {
    const transactions = [
      buildTransaction({
        id: "a1",
        description: "Odd bill",
        amountMinor: -1_001,
        accountName: "Alice",
        shared: true,
        shareCount: 3,
      }),
      buildTransaction({
        id: "b1",
        description: "Bob personal",
        amountMinor: -100,
        accountName: "Bob",
        shared: false,
      }),
      buildTransaction({
        id: "c1",
        description: "Charlie personal",
        amountMinor: -100,
        accountName: "Charlie",
        shared: false,
      }),
    ]
    const result = settleGroupTransactions(transactions)
    // share = round(-1001 / 3) = -334; Alice owed 667, split -334/-333.
    expect(balanceMap(transactions)).toEqual(
      new Map([
        ["Alice", 667],
        ["Bob", -334],
        ["Charlie", -333],
      ]),
    )
    const total = result.balances.reduce((sum, b) => sum + b.balanceMinor, 0)
    expect(total).toBe(0)
    const paid = result.transfers.reduce((sum, t) => sum + t.amountMinor, 0)
    expect(paid).toBe(667)
  })

  it("excludes zero-net members from transfers but keeps their balances", () => {
    const transfers = simplifyBalances([
      { member: "Alice", balanceMinor: 2_500 },
      { member: "Bob", balanceMinor: 0 },
      { member: "Charlie", balanceMinor: -2_500 },
    ])
    expect(transfers).toEqual([{ from: "Charlie", to: "Alice", amountMinor: 2_500 }])
    expect(transfers.some((t) => t.from === "Bob" || t.to === "Bob")).toBe(false)
  })

  it("returns an empty settlement for single-member groups", () => {
    const result = settleGroupTransactions([
      buildTransaction({ id: "a1", accountName: "Alice", amountMinor: -5_000, shared: true }),
    ])
    expect(result.memberCount).toBe(1)
    expect(result.transfers).toEqual([])
    expect(result.balances).toEqual([{ member: "Alice", balanceMinor: 0 }])
  })

  it("returns empty settlement when nothing is shared", () => {
    const result = settleGroupTransactions([
      buildTransaction({ id: "a1", accountName: "Alice", amountMinor: -5_000 }),
      buildTransaction({ id: "b1", accountName: "Bob", amountMinor: -3_000 }),
    ])
    expect(result.transfers).toEqual([])
  })

  it("falls back to You for blank account names", () => {
    const result = settleGroupTransactions([
      buildTransaction({
        id: "a1",
        accountName: null,
        amountMinor: -6_000,
        shared: true,
        shareCount: 2,
      }),
      buildTransaction({
        id: "b1",
        accountName: "Bob",
        amountMinor: -100,
        shared: false,
      }),
    ])
    expect(result.balances.map((b) => b.member).toSorted()).toEqual(["Bob", "You"])
    expect(result.transfers).toEqual([{ from: "Bob", to: "You", amountMinor: 3_000 }])
  })

  it("conserves minor units exactly across randomized cases", () => {
    let seed = 0x2f6e2b1
    const next = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let caseIndex = 0; caseIndex < 200; caseIndex += 1) {
      const memberCount = 2 + Math.floor(next() * 3)
      const names = ["Alice", "Bob", "Charlie", "Dana"].slice(0, memberCount)
      const transactions = names.map((name, index) =>
        buildTransaction({
          id: `m-${caseIndex}-${index}`,
          accountName: name,
          amountMinor: -(1 + Math.floor(next() * 10_000)),
          shared: false,
        }),
      )
      const sharedCount = 1 + Math.floor(next() * 4)
      for (let index = 0; index < sharedCount; index += 1) {
        const payer = names[Math.floor(next() * names.length)]!
        transactions.push(
          buildTransaction({
            id: `s-${caseIndex}-${index}`,
            accountName: payer,
            amountMinor: -(1 + Math.floor(next() * 10_000)),
            shared: true,
            shareCount: 2 + Math.floor(next() * 3),
          }),
        )
      }
      const result = settleGroupTransactions(transactions)
      const balanceTotal = result.balances.reduce((sum, b) => sum + b.balanceMinor, 0)
      expect(balanceTotal).toBe(0)
      const creditorTotal = result.balances
        .filter((b) => b.balanceMinor > 0)
        .reduce((sum, b) => sum + b.balanceMinor, 0)
      const transferTotal = result.transfers.reduce((sum, t) => sum + t.amountMinor, 0)
      expect(transferTotal).toBe(creditorTotal)
      for (const transfer of result.transfers) {
        expect(transfer.amountMinor).toBeGreaterThan(0)
        expect(Number.isInteger(transfer.amountMinor)).toBe(true)
      }
      expect(result.transfers.length).toBeLessThanOrEqual(Math.max(0, result.memberCount - 1))
      void computeSettlementBalances
    }
  })
})
