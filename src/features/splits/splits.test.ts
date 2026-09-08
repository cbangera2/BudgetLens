import { buildTransaction } from "@/test/factories"

import {
  allocateByWeights,
  allocateEvenSplit,
  buildSplitChildren,
  buildUnsplitParentLabels,
  childDescription,
  collectSplitParentIds,
  getSplitChildren,
  hasSplitChildren,
  isActiveTransaction,
  isSplitChild,
  isSupersededSplitParent,
  onlyActiveTransactions,
  SPLIT_CHILD_LABEL_PREFIX,
  SPLIT_PARENT_LABEL,
  splitChildParentId,
  splitRemainingStatus,
  validateSplitParts,
} from "./splits"

function parent() {
  return buildTransaction({ id: "parent-1", amountMinor: -10_000, category: "Groceries" })
}

describe("split labels and predicate", () => {
  it("marks only superseded parents as inactive", () => {
    const ordinary = buildTransaction()
    const child = buildTransaction({ labels: [`${SPLIT_CHILD_LABEL_PREFIX}parent-1`] })
    const superseded = buildTransaction({ labels: [SPLIT_PARENT_LABEL] })

    expect(isSupersededSplitParent(ordinary)).toBe(false)
    expect(isSupersededSplitParent(child)).toBe(false)
    expect(isSupersededSplitParent(superseded)).toBe(true)

    expect(isActiveTransaction(child)).toBe(true)
    expect(isActiveTransaction(superseded)).toBe(false)
    expect(onlyActiveTransactions([ordinary, child, superseded])).toEqual([ordinary, child])
  })

  it("links children to parents through labels", () => {
    const rows = [
      buildTransaction({ id: "parent-1", labels: [SPLIT_PARENT_LABEL] }),
      buildTransaction({ id: "child-a", labels: [`${SPLIT_CHILD_LABEL_PREFIX}parent-1`] }),
      buildTransaction({ id: "child-b", labels: [`${SPLIT_CHILD_LABEL_PREFIX}parent-1`] }),
      buildTransaction({ id: "other", labels: [`${SPLIT_CHILD_LABEL_PREFIX}parent-9`] }),
    ]
    expect(splitChildParentId(rows[1]!)).toBe("parent-1")
    expect(splitChildParentId(rows[0]!)).toBeNull()
    expect(isSplitChild(rows[1]!)).toBe(true)
    expect(isSplitChild(rows[0]!)).toBe(false)
    expect(getSplitChildren(rows, "parent-1").map((row) => row.id)).toEqual(["child-a", "child-b"])
    expect(hasSplitChildren(rows, "parent-1")).toBe(true)
    expect(hasSplitChildren(rows, "missing")).toBe(false)
    expect([...collectSplitParentIds(rows)].toSorted()).toEqual(["parent-1", "parent-9"])
  })

  it("ignores malformed split labels", () => {
    const empty = buildTransaction({ labels: [SPLIT_CHILD_LABEL_PREFIX] })
    expect(splitChildParentId(empty)).toBeNull()
    expect(isSplitChild(empty)).toBe(false)
  })
})

describe("dust allocation", () => {
  it("splits evenly with remainder-to-largest (penny dust)", () => {
    expect(allocateEvenSplit(-10_000, 3)).toEqual([-3334, -3333, -3333])
    expect(allocateEvenSplit(10_000, 3)).toEqual([3334, 3333, 3333])
    expect(allocateEvenSplit(-100, 2)).toEqual([-50, -50])
    expect(allocateEvenSplit(-1, 2)).toEqual([-1, 0])
  })

  it("allocates by weights with dust to the largest share", () => {
    expect(allocateByWeights(-10_000, [2, 1])).toEqual([-6667, -3333])
    expect(allocateByWeights(100, [1, 1, 1, 1])).toEqual([25, 25, 25, 25])
    const parts = allocateByWeights(-42_50, [3, 2, 1])
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(-42_50)
  })

  it("always sums exactly to the total", () => {
    for (const total of [-10_001, -99, 1, 7, 123_456]) {
      for (const count of [2, 3, 5]) {
        const parts = allocateEvenSplit(total, count)
        expect(parts).toHaveLength(count)
        expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total)
      }
    }
  })

  it("rejects invalid allocation input", () => {
    expect(() => allocateEvenSplit(-100, 1)).toThrow(/at least 2/)
    expect(() => allocateByWeights(-100, [])).toThrow(/weight/)
    expect(() => allocateByWeights(-100, [1, 0])).toThrow(/positive/)
    expect(() => allocateByWeights(10.5, [1, 1])).toThrow(/minor units/)
    expect(() => allocateByWeights(-100, [Number.MAX_VALUE, Number.MAX_VALUE])).toThrow(/finite/)
  })

  it("reports remaining status by magnitude for expenses and income", () => {
    expect(splitRemainingStatus(-10_000, -5000)).toBe("left")
    expect(splitRemainingStatus(-10_000, -10_000)).toBe("balanced")
    expect(splitRemainingStatus(-10_000, -12_000)).toBe("over")
    expect(splitRemainingStatus(10_000, 4000)).toBe("left")
    expect(splitRemainingStatus(10_000, 10_000)).toBe("balanced")
    expect(splitRemainingStatus(10_000, 11_000)).toBe("over")
  })
})

describe("split validation", () => {
  it("accepts parts that sum exactly to the parent", () => {
    expect(
      validateSplitParts(parent(), [
        { category: "Groceries", amountMinor: -6000 },
        { category: "Household", amountMinor: -4000 },
      ]),
    ).toBeNull()
  })

  it("rejects empty parts and zero totals", () => {
    expect(validateSplitParts(parent(), [])).toMatch(/at least two/)
    expect(validateSplitParts(parent(), [{ category: "A", amountMinor: -10_000 }])).toMatch(
      /at least two/,
    )
    expect(
      validateSplitParts(buildTransaction({ amountMinor: 0 }), [
        { category: "A", amountMinor: -1 },
        { category: "B", amountMinor: 1 },
      ]),
    ).toMatch(/non-zero/)
  })

  it("rejects zero parts, sign flips, and inexact sums", () => {
    const base = parent()
    expect(
      validateSplitParts(base, [
        { category: "A", amountMinor: -10_000 },
        { category: "B", amountMinor: 0 },
      ]),
    ).toMatch(/non-zero/)
    expect(
      validateSplitParts(base, [
        { category: "A", amountMinor: -6000 },
        { category: "B", amountMinor: 4000 },
      ]),
    ).toMatch(/direction/)
    expect(
      validateSplitParts(base, [
        { category: "A", amountMinor: -6000 },
        { category: "B", amountMinor: -3999 },
      ]),
    ).toMatch(/Parts total/)
  })

  it("rejects re-splitting split parents and splitting split parts", () => {
    const base = parent()
    const child = buildTransaction({ labels: [`${SPLIT_CHILD_LABEL_PREFIX}parent-1`] })
    expect(
      validateSplitParts(
        base,
        [
          { category: "A", amountMinor: -5000 },
          { category: "B", amountMinor: -5000 },
        ],
        [child],
      ),
    ).toMatch(/already split/)
    expect(
      validateSplitParts({ ...base, labels: [SPLIT_PARENT_LABEL] }, [
        { category: "A", amountMinor: -5000 },
        { category: "B", amountMinor: -5000 },
      ]),
    ).toMatch(/already split/)
    expect(
      validateSplitParts({ ...base, labels: [`${SPLIT_CHILD_LABEL_PREFIX}other`] }, [
        { category: "A", amountMinor: -5000 },
        { category: "B", amountMinor: -5000 },
      ]),
    ).toMatch(/cannot be split further/)
  })
})

describe("split builders", () => {
  it("builds children with the description prefix, date, and exact sum", () => {
    const base = parent()
    const { children, parentLabels } = buildSplitChildren(base, [
      { category: "Groceries", amountMinor: -6000 },
      { category: "Household", amountMinor: -4000 },
    ])
    expect(children).toHaveLength(2)
    expect(children.reduce((sum, child) => sum + child.amountMinor, 0)).toBe(-10_000)
    for (const child of children) {
      expect(child.date).toBe(base.date)
      expect(child.description.startsWith(base.description)).toBe(true)
      expect(child.labels).toContain(`${SPLIT_CHILD_LABEL_PREFIX}parent-1`)
      expect(child.shared).toBe(false)
    }
    expect(children[0]?.description).toBe(childDescription(base.description, "Groceries", 0))
    expect(children.map((child) => child.category)).toEqual(["Groceries", "Household"])
    expect(parentLabels).toContain(SPLIT_PARENT_LABEL)
  })

  it("falls back to numbered suffixes for blank categories", () => {
    expect(childDescription("Market Run", null, 1)).toBe("Market Run — Part 2")
  })

  it("restores labels on unsplit", () => {
    const marked = buildTransaction({ labels: ["weekly", SPLIT_PARENT_LABEL] })
    expect(buildUnsplitParentLabels(marked)).toEqual(["weekly"])
  })

  it("preserves malformed lookalike labels across split and unsplit", () => {
    const base = parent()
    const marked = buildTransaction({ labels: ["split:child:"] })
    expect(splitChildParentId(marked)).toBeNull()
    const { parentLabels } = buildSplitChildren({ ...base, labels: ["split:child:"] }, [
      { category: "A", amountMinor: -5000 },
      { category: "B", amountMinor: -5000 },
    ])
    expect(parentLabels).toContain("split:child:")
    expect(buildUnsplitParentLabels({ ...base, labels: parentLabels })).toContain("split:child:")
  })

  it("throws on invalid splits", () => {
    expect(() => buildSplitChildren(parent(), [])).toThrow(/at least two/)
  })
})
