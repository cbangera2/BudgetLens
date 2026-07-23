import { readFile } from "node:fs/promises"
import path from "node:path"

import { BudgetLensDatabase } from "@/db/database"
import { ImportService } from "@/features/imports/import-service"

async function fixture(name: string): Promise<string> {
  return readFile(path.resolve(process.cwd(), "tests/fixtures", name), "utf8")
}

describe("ImportService", () => {
  let db: BudgetLensDatabase
  let service: ImportService

  beforeEach(() => {
    db = new BudgetLensDatabase(`budgetlens-test-${crypto.randomUUID()}`)
    service = new ImportService(db)
  })

  afterEach(async () => {
    await db.delete()
  })

  it("previews without writing and atomically commits transactions", async () => {
    const preview = await service.preview(
      "Date,Description,Amount,Account Name\n2026-01-01,Synthetic Cafe,-12.34,Sample Checking",
      "transactions.csv",
    )

    expect(preview).toMatchObject({ kind: "transactions", importableCount: 1 })
    expect(await db.transactions.count()).toBe(0)
    expect(await db.imports.count()).toBe(0)

    const receipt = await service.commit(preview)

    expect(receipt.batch).toMatchObject({ importedCount: 1, skippedCount: 0 })
    expect((await db.transactions.toArray())[0]).toMatchObject({
      amountMinor: -1234,
      importBatchId: receipt.batch.id,
    })
    expect(await db.imports.count()).toBe(1)
  })

  it("detects duplicate rows and an already imported file", async () => {
    const content = "Date,Description,Amount\n2026-01-01,Synthetic Cafe,-12.34"
    const first = await service.preview(content, "first.csv")
    await service.commit(first)

    const repeatedFile = await service.preview(content, "renamed.csv")
    expect(repeatedFile).toMatchObject({
      duplicateFile: true,
      duplicateCount: 1,
      importableCount: 0,
    })
    await expect(service.commit(repeatedFile)).rejects.toThrow("already imported")

    const repeatedRow = await service.preview(
      `${content}\n2026-01-02,Synthetic Shop,-5.00`,
      "mixed.csv",
    )
    expect(repeatedRow).toMatchObject({
      duplicateFile: false,
      duplicateCount: 1,
      importableCount: 1,
    })
  })

  it("can intentionally retain identical rows in separate batches and delete only one batch", async () => {
    const firstPreview = await service.preview(
      "Date,Description,Amount\n2026-01-01,Synthetic Cafe,-12.34",
      "first.csv",
    )
    const first = await service.commit(firstPreview)
    const secondPreview = await service.preview(
      "Date,Description,Amount\n2026-01-01,Synthetic Cafe,-12.34\n",
      "second.csv",
      "skip",
      "include",
    )

    expect(secondPreview).toMatchObject({
      duplicateFile: false,
      duplicateCount: 1,
      duplicatePolicy: "include",
      importableCount: 1,
    })
    const second = await service.commit(secondPreview)
    const before = await db.transactions.toArray()
    expect(before).toHaveLength(2)
    expect(new Set(before.map((row) => row.fingerprint))).toHaveLength(1)

    const deletion = await service.deleteBatch(first.batch.id)

    expect(deletion).toMatchObject({ deletedTransactionCount: 1, deletedWealthCount: 0 })
    expect(await db.imports.get(first.batch.id)).toBeUndefined()
    expect(await db.imports.get(second.batch.id)).toBeDefined()
    expect(await db.transactions.toArray()).toEqual([
      expect.objectContaining({ importBatchId: second.batch.id }),
    ])
  })

  it("deletes wealth rows by batch without touching another series or manual transactions", async () => {
    const netWorth = await service.commit(
      await service.preview("Date,Net Worth\n2026-01-31,1000.00", "net-worth.csv"),
    )
    const investment = await service.commit(
      await service.preview("Date,Investment Value\n2026-01-31,500.25", "investments.csv"),
    )
    await db.transactions.add({
      id: "manual-row",
      date: "2026-01-01",
      description: "Synthetic manual entry",
      amountMinor: -100,
      category: "Other",
      transactionType: "debit",
      accountName: null,
      accountType: null,
      provider: null,
      labels: [],
      notes: null,
      importBatchId: "manual",
      fingerprint: "synthetic-manual-fingerprint",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })

    const deletion = await service.deleteBatch(netWorth.batch.id)

    expect(deletion).toMatchObject({ deletedTransactionCount: 0, deletedWealthCount: 1 })
    expect(await db.wealth.where("series").equals("netWorth").count()).toBe(0)
    expect(await db.wealth.where("series").equals("investment").count()).toBe(1)
    expect(await db.imports.get(investment.batch.id)).toBeDefined()
    expect(await db.transactions.get("manual-row")).toBeDefined()
  })

  it("rolls back row deletion when removing import metadata fails", async () => {
    const receipt = await service.commit(
      await service.preview(
        "Date,Description,Amount\n2026-01-01,Synthetic Cafe,-12.34",
        "atomic-delete.csv",
      ),
    )
    vi.spyOn(db.imports, "delete").mockRejectedValueOnce(new Error("synthetic deletion failure"))

    await expect(service.deleteBatch(receipt.batch.id)).rejects.toThrow(
      "synthetic deletion failure",
    )
    expect(await db.transactions.where("importBatchId").equals(receipt.batch.id).count()).toBe(1)
    expect(await db.imports.get(receipt.batch.id)).toBeDefined()
  })

  it("imports net worth and supports explicit same-date skip and replace policies", async () => {
    const original = await service.preview("Date,Net Worth\n2026-01-31,1000.00", "net-worth.csv")
    await service.commit(original)

    const skip = await service.preview(
      "Date,Net Worth\n2026-01-31,1100.00\n2026-02-28,1200.00",
      "net-worth-new.csv",
      "skip",
    )
    expect(skip).toMatchObject({ duplicateCount: 1, replacementCount: 0, importableCount: 1 })
    await service.commit(skip)
    expect(
      (await db.wealth.where("[series+date]").equals(["netWorth", "2026-01-31"]).first())
        ?.valueMinor,
    ).toBe(100_000)

    const replace = await service.preview(
      "Date,Net Worth\n2026-01-31,1100.00",
      "net-worth-replace.csv",
      "replace",
    )
    expect(replace).toMatchObject({ replacementCount: 1, importableCount: 1 })
    const receipt = await service.commit(replace)
    expect(receipt.batch.replacedCount).toBe(1)
    expect(
      (await db.wealth.where("[series+date]").equals(["netWorth", "2026-01-31"]).first())
        ?.valueMinor,
    ).toBe(110_000)
  })

  it("imports investment history independently from net worth", async () => {
    const preview = await service.preview(
      "Date,Investment Value\n2026-01-31,500.25\n2026-02-28,525.75",
      "investments.csv",
    )
    await service.commit(preview)

    expect(await db.wealth.where("series").equals("investment").count()).toBe(2)
    expect(await db.wealth.where("series").equals("netWorth").count()).toBe(0)
  })

  it("rolls back every row when batch metadata cannot be saved", async () => {
    const preview = await service.preview(
      "Date,Description,Amount\n2026-01-01,Synthetic One,-1.00\n2026-01-02,Synthetic Two,-2.00",
      "rollback.csv",
    )
    vi.spyOn(db.imports, "add").mockRejectedValueOnce(new Error("synthetic storage failure"))

    await expect(service.commit(preview)).rejects.toThrow("synthetic storage failure")
    expect(await db.transactions.count()).toBe(0)
    expect(await db.imports.count()).toBe(0)
  })

  it("previews multiple JSON files with deterministic cross-file deduplication", async () => {
    const collection = await service.previewMany([
      { content: await fixture("transactions-page-one.json"), sourceName: "page-one.json" },
      { content: await fixture("transactions-page-two.json"), sourceName: "page-two.json" },
      { content: "{not valid", sourceName: "malformed.json" },
      { content: '{"unexpected":true}', sourceName: "unsupported.json" },
    ])

    expect(collection).toMatchObject({
      selectedCount: 4,
      rowCount: 4,
      importableCount: 3,
      duplicateCount: 1,
      invalidRowCount: 0,
    })
    expect(collection.previews).toHaveLength(2)
    expect(collection.failures.map((failure) => failure.sourceName)).toEqual([
      "malformed.json",
      "unsupported.json",
    ])

    const result = await service.commitMany(collection.previews)
    expect(result).toMatchObject({ failures: [] })
    expect(result.receipts).toHaveLength(2)
    expect(result.receipts.reduce((sum, receipt) => sum + receipt.batch.importedCount, 0)).toBe(3)
    expect(await db.transactions.count()).toBe(3)
  })

  it("recognizes a legacy positive debit row as a duplicate after sign normalization", async () => {
    await db.transactions.add({
      id: "legacy-row",
      date: "2026-03-01",
      description: "Invented Corner Shop",
      amountMinor: 1875,
      category: "Shopping",
      transactionType: "debit",
      accountName: "Sample Checking",
      accountType: "CHECKING",
      provider: "Example Cooperative",
      labels: [],
      notes: null,
      importBatchId: "legacy-batch",
      fingerprint: "legacy-positive-sign",
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    })

    const next = await service.previewMany([
      { content: await fixture("transactions-page-one.json"), sourceName: "page-one.json" },
    ])

    expect(next.previews[0]).toMatchObject({ duplicateCount: 1, importableCount: 1 })
  })

  it("bounds multi-file count and combined content size", async () => {
    await expect(
      service.previewMany(
        Array.from({ length: 21 }, (_, index) => ({ content: "{}", sourceName: `${index}.json` })),
      ),
    ).rejects.toThrow("at most 20")
    await expect(
      service.previewMany([
        { content: "x".repeat(50 * 1024 * 1024 + 1), sourceName: "large.json" },
      ]),
    ).rejects.toThrow("combined byte limit")
  })
})
