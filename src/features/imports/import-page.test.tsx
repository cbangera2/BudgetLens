import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import type { ImportBatch } from "@/domain/models"
import type {
  ImportCollectionPreview,
  ImportDeletionReceipt,
  ImportPreview,
  ImportReceipt,
} from "@/features/imports/types"

const mocks = vi.hoisted(() => ({
  preview:
    vi.fn<
      (
        content: string,
        sourceName: string,
        wealthPolicy?: "skip" | "replace",
        duplicatePolicy?: "skip" | "include",
      ) => Promise<ImportPreview>
    >(),
  previewMany:
    vi.fn<
      (
        files: { content: string; sourceName: string }[],
        duplicatePolicy?: "skip" | "include",
      ) => Promise<ImportCollectionPreview>
    >(),
  commit: vi.fn<(preview: ImportPreview) => Promise<ImportReceipt>>(),
  commitMany:
    vi.fn<(previews: ImportPreview[]) => Promise<{ receipts: ImportReceipt[]; failures: [] }>>(),
  deleteBatch: vi.fn<(batchId: string) => Promise<ImportDeletionReceipt>>(),
  list: vi.fn<() => Promise<ImportBatch[]>>(),
}))

vi.mock("@/db/repositories", () => ({
  repositories: { imports: { list: mocks.list } },
}))

vi.mock("@/features/imports/import-service", () => ({
  importService: {
    preview: mocks.preview,
    previewMany: mocks.previewMany,
    commit: mocks.commit,
    commitMany: mocks.commitMany,
    deleteBatch: mocks.deleteBatch,
  },
}))

import { ImportPage } from "@/features/imports/import-page"

describe("ImportPage", () => {
  beforeEach(() => {
    mocks.list.mockResolvedValue([])
    mocks.preview.mockResolvedValue({
      kind: "netWorth",
      sourceName: "synthetic-net-worth.csv",
      sourceHash: "synthetic-hash",
      rowCount: 2,
      transactions: [],
      wealth: [
        { series: "netWorth", date: "2026-01-01", valueMinor: 100_000 },
        { series: "netWorth", date: "2026-02-01", valueMinor: 110_000 },
      ],
      issues: [],
      duplicateFile: false,
      duplicateCount: 0,
      replacementCount: 0,
      importableCount: 2,
      duplicatePolicy: "skip",
      wealthPolicy: "skip",
    })
    mocks.commit.mockResolvedValue({
      batch: {
        id: "batch",
        kind: "netWorth",
        sourceName: "synthetic-net-worth.csv",
        sourceHash: "synthetic-hash",
        rowCount: 2,
        importedCount: 2,
        skippedCount: 0,
        replacedCount: 0,
        importedAt: "2026-07-22T12:00:00.000Z",
      },
    })
    const jsonPreview: ImportPreview = {
      kind: "transactions",
      sourceName: "page-one.json",
      sourceHash: "json-hash",
      rowCount: 2,
      transactions: [],
      wealth: [],
      issues: [],
      duplicateFile: false,
      duplicateCount: 0,
      replacementCount: 0,
      importableCount: 2,
      duplicatePolicy: "skip",
      wealthPolicy: "skip",
    }
    mocks.previewMany.mockResolvedValue({
      previews: [jsonPreview],
      failures: [{ sourceName: "broken.json", message: "JSON parsing failed." }],
      selectedCount: 2,
      rowCount: 2,
      importableCount: 2,
      duplicateCount: 0,
      invalidRowCount: 0,
    })
    mocks.commitMany.mockResolvedValue({
      receipts: [
        {
          batch: {
            id: "json-batch",
            kind: "transactions",
            sourceName: "page-one.json",
            sourceHash: "json-hash",
            rowCount: 2,
            importedCount: 2,
            skippedCount: 0,
            replacedCount: 0,
            importedAt: "2026-07-22T12:00:00.000Z",
          },
        },
      ],
      failures: [],
    })
    mocks.deleteBatch.mockResolvedValue({
      batch: {
        id: "batch",
        kind: "transactions",
        sourceName: "synthetic-transactions.json",
        sourceHash: "delete-hash",
        rowCount: 2,
        importedCount: 2,
        skippedCount: 0,
        replacedCount: 0,
        importedAt: "2026-07-22T12:00:00.000Z",
      },
      deletedTransactionCount: 2,
      deletedWealthCount: 0,
    })
  })

  afterEach(() => vi.clearAllMocks())

  it("provides an accessible empty import workflow", async () => {
    render(<ImportPage />)

    expect(screen.getByRole("heading", { name: "Import Credit Karma data" })).toBeInTheDocument()
    expect(screen.getByLabelText("CSV or JSON files")).toHaveAttribute(
      "accept",
      ".csv,.json,text/csv,application/json",
    )
    expect(screen.getByLabelText("CSV or JSON files")).toHaveAttribute("multiple")
    expect(screen.getByRole("checkbox", { name: /skip duplicate rows/i })).toBeChecked()
    expect(await screen.findByText("No completed imports yet.")).toBeInTheDocument()
  })

  it("previews and confirms a net-worth file", async () => {
    const user = userEvent.setup()
    render(<ImportPage />)
    const file = new File(["Date,Net Worth\n2026-01-01,1000"], "synthetic-net-worth.csv", {
      type: "text/csv",
    })
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve("Date,Net Worth\n2026-01-01,1000"),
    })

    await user.upload(screen.getByLabelText("CSV or JSON files"), file)

    expect(await screen.findByRole("heading", { name: "Import preview" })).toBeInTheDocument()
    expect(screen.getByText("Net worth · synthetic-net-worth.csv")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Keep existing value" })).toBeChecked()

    await user.click(screen.getByRole("button", { name: "Confirm import" }))

    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(await screen.findByText("Imported 2 net worth rows.")).toBeInTheDocument()
  })

  it("previews valid JSON files while reporting invalid files separately", async () => {
    const user = userEvent.setup()
    render(<ImportPage />)
    const valid = new File(["{}"], "page-one.json", { type: "application/json" })
    const broken = new File(["{"], "broken.json", { type: "application/json" })
    Object.defineProperty(valid, "text", { value: () => Promise.resolve("{}") })
    Object.defineProperty(broken, "text", { value: () => Promise.resolve("{") })

    await user.upload(screen.getByLabelText("CSV or JSON files"), [valid, broken])

    expect(await screen.findByRole("heading", { name: "JSON import preview" })).toBeInTheDocument()
    expect(screen.getByText("page-one.json")).toBeInTheDocument()
    expect(screen.getByText("broken.json")).toBeInTheDocument()
    expect(screen.getByText("JSON parsing failed.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Import valid files" })).toBeEnabled()

    await user.click(screen.getByRole("button", { name: "Import valid files" }))
    expect(mocks.commitMany).toHaveBeenCalledOnce()
    expect(
      await screen.findByText(
        "Imported 2 rows from 1 files. 1 selected file(s) were not imported.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Files not imported" })).toBeInTheDocument()
  })

  it("continues parsing readable JSON when another selected file cannot be read", async () => {
    const user = userEvent.setup()
    render(<ImportPage />)
    const valid = new File(["{}"], "readable.json", { type: "application/json" })
    const unreadable = new File(["{}"], "unreadable.json", { type: "application/json" })
    Object.defineProperty(valid, "text", { value: () => Promise.resolve("{}") })
    Object.defineProperty(unreadable, "text", {
      value: () => Promise.reject(new Error("synthetic read failure")),
    })

    await user.upload(screen.getByLabelText("CSV or JSON files"), [valid, unreadable])

    expect(await screen.findByRole("heading", { name: "JSON import preview" })).toBeInTheDocument()
    expect(mocks.previewMany).toHaveBeenCalledWith(
      [{ content: "{}", sourceName: "readable.json" }],
      "skip",
    )
    expect(screen.getByText("unreadable.json")).toBeInTheDocument()
    expect(screen.getByText("The file could not be read.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Import valid files" })).toBeEnabled()
  })

  it("rejects mixed CSV and JSON selections with a predictable message", async () => {
    const user = userEvent.setup()
    render(<ImportPage />)

    await user.upload(screen.getByLabelText("CSV or JSON files"), [
      new File(["Date,Amount"], "one.csv", { type: "text/csv" }),
      new File(["{}"], "two.json", { type: "application/json" }),
    ])

    expect(
      await screen.findByText(
        "Import one CSV at a time, or select multiple JSON files. Do not mix formats.",
      ),
    ).toBeInTheDocument()
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.previewMany).not.toHaveBeenCalled()
  })

  it("can intentionally include duplicates and remove only a selected import batch", async () => {
    const user = userEvent.setup()
    const batch: ImportBatch = {
      id: "batch",
      kind: "transactions",
      sourceName: "synthetic-transactions.json",
      sourceHash: "delete-hash",
      rowCount: 2,
      importedCount: 2,
      skippedCount: 0,
      replacedCount: 0,
      importedAt: "2026-07-22T12:00:00.000Z",
    }
    mocks.list.mockResolvedValueOnce([batch]).mockResolvedValueOnce([])
    render(<ImportPage />)

    const skipDuplicates = screen.getByRole("checkbox", { name: /skip duplicate rows/i })
    await user.click(skipDuplicates)
    expect(skipDuplicates).not.toBeChecked()
    expect(screen.getByText(/duplicate rows will be imported intentionally/i)).toBeInTheDocument()

    expect(await screen.findByText("synthetic-transactions.json")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Remove" }))
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Rows from other imports are not removed",
    )
    await user.click(screen.getByRole("button", { name: "Remove import" }))

    expect(mocks.deleteBatch).toHaveBeenCalledWith("batch")
    expect(
      await screen.findByText("Removed 2 stored rows from synthetic-transactions.json."),
    ).toBeInTheDocument()
    expect(screen.queryByText("synthetic-transactions.json")).not.toBeInTheDocument()
  })
})
