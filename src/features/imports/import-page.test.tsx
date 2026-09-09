import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { database } from "@/db/database"
import type { ImportBatch } from "@/domain/models"
import { DEMO_SOURCE_NAME } from "@/features/demo/golden-bundle"
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
import { MAPPING_PROFILES_KEY, upsertMappingProfile } from "@/features/imports/mapping-profiles"

const ODD_HEADERS = [
  "Transaction Date",
  "Withdrawal",
  "Narrative",
  "Spending Category",
  "Acct",
  "Flow",
  "Reference ID",
]

const ODD_MAPPING = {
  date: "Transaction Date",
  amount: "Withdrawal",
  description: "Narrative",
  category: "Spending Category",
  account: "Acct",
  type: "Flow",
}

const ODD_CONTENT = `${ODD_HEADERS.join(",")}\n2026-02-03,-18.25,Example Corner Shop,Groceries,Checking,debit,REF-001\n`
const RENAMED_CONTENT = `${[...ODD_HEADERS.slice(0, 6), "Reference No."].join(",")}\n2026-02-03,-18.25,Example Corner Shop,Groceries,Checking,debit,REF-001\n`

function oddFile(name: string, content: string): File {
  const file = new File([content], name, { type: "text/csv" })
  Object.defineProperty(file, "text", { value: () => Promise.resolve(content) })
  return file
}

function seedOddProfile(name = "Odd bank") {
  const result = upsertMappingProfile(
    [],
    { name, headers: ODD_HEADERS, mapping: { ...ODD_MAPPING } },
    "2026-09-07T00:00:00.000Z",
  )
  window.localStorage.setItem(
    MAPPING_PROFILES_KEY,
    JSON.stringify({ version: 1, profiles: result.profiles }),
  )
  return result.profiles
}

function unsupportedHeadersError(): Error {
  return new Error(
    "Unsupported headers. Expected a transaction, wealth history, net worth breakdown, or wealth accounts CSV.",
  )
}

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
      wealthBreakdown: [],
      wealthAccounts: [],
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
      wealthBreakdown: [],
      wealthAccounts: [],
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
      deletedWealthBreakdownCount: 0,
      deletedWealthAccountCount: 0,
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
    expect(await screen.findByText(/No completed imports yet\./)).toBeInTheDocument()
    expect(
      await screen.findByText(/Select CSV or JSON files above to preview your first import\./),
    ).toBeInTheDocument()
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

    expect(
      await screen.findByRole("heading", { name: "Multi-file import preview" }),
    ).toBeInTheDocument()
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

    expect(
      await screen.findByRole("heading", { name: "Multi-file import preview" }),
    ).toBeInTheDocument()
    expect(mocks.previewMany).toHaveBeenCalledWith(
      [{ content: "{}", sourceName: "readable.json" }],
      "skip",
      [],
    )
    expect(screen.getByText("unreadable.json")).toBeInTheDocument()
    expect(screen.getByText("The file could not be read.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Import valid files" })).toBeEnabled()
  })

  it("previews mixed CSV and JSON selections together", async () => {
    const user = userEvent.setup()
    render(<ImportPage />)
    const csv = new File(["Date,Amount"], "one.csv", { type: "text/csv" })
    const json = new File(["{}"], "two.json", { type: "application/json" })
    Object.defineProperty(csv, "text", { value: () => Promise.resolve("Date,Amount") })
    Object.defineProperty(json, "text", { value: () => Promise.resolve("{}") })

    await user.upload(screen.getByLabelText("CSV or JSON files"), [csv, json])

    expect(
      await screen.findByRole("heading", { name: "Multi-file import preview" }),
    ).toBeInTheDocument()
    expect(mocks.previewMany).toHaveBeenCalledWith(
      [
        { content: "Date,Amount", sourceName: "one.csv" },
        { content: "{}", sourceName: "two.json" },
      ],
      "skip",
      [],
    )
    expect(screen.getByLabelText("CSV or JSON files")).toHaveAttribute("aria-invalid", "false")
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

  it("links import history rows to their filtered transaction batch", async () => {
    const batch: ImportBatch = {
      id: "batch-1",
      kind: "transactions",
      sourceName: "synthetic-transactions.csv",
      sourceHash: "synthetic-hash",
      rowCount: 1,
      importedCount: 1,
      skippedCount: 0,
      replacedCount: 0,
      importedAt: "2026-07-22T12:00:00.000Z",
    }
    mocks.list.mockResolvedValueOnce([batch])
    render(<ImportPage />)

    const view = await screen.findByRole("link", {
      name: "View synthetic-transactions.csv transactions",
    })
    expect(view).toHaveAttribute("href", "/transactions?importBatch=batch-1")
  })

  it("links a confirmed import result to its transaction batch", async () => {
    const user = userEvent.setup()
    mocks.preview.mockResolvedValueOnce({
      kind: "transactions",
      sourceName: "synthetic-transactions.csv",
      sourceHash: "synthetic-hash",
      rowCount: 1,
      transactions: [],
      wealth: [],
      wealthBreakdown: [],
      wealthAccounts: [],
      issues: [],
      duplicateFile: false,
      duplicateCount: 0,
      replacementCount: 0,
      importableCount: 1,
      duplicatePolicy: "skip",
      wealthPolicy: "skip",
    })
    mocks.commit.mockResolvedValueOnce({
      batch: {
        id: "batch-1",
        kind: "transactions",
        sourceName: "synthetic-transactions.csv",
        sourceHash: "synthetic-hash",
        rowCount: 1,
        importedCount: 1,
        skippedCount: 0,
        replacedCount: 0,
        importedAt: "2026-07-22T12:00:00.000Z",
      },
    })
    render(<ImportPage />)
    const file = new File(["Date,Description,Amount"], "synthetic-transactions.csv", {
      type: "text/csv",
    })
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve("Date,Description,Amount"),
    })

    await user.upload(screen.getByLabelText("CSV or JSON files"), file)
    await user.click(await screen.findByRole("button", { name: "Confirm import" }))

    const view = await screen.findByRole("link", {
      name: "View synthetic-transactions.csv",
    })
    expect(view).toHaveAttribute("href", "/transactions?importBatch=batch-1")
  })

  it("offers to remember a confirmed column mapping for files like it", async () => {
    const user = userEvent.setup()
    mocks.preview.mockRejectedValueOnce(unsupportedHeadersError())
    render(<ImportPage />)

    await user.upload(screen.getByLabelText("CSV or JSON files"), oddFile("bank.csv", ODD_CONTENT))

    expect(await screen.findByRole("heading", { name: "Map CSV columns" })).toBeInTheDocument()
    const remember = screen.getByRole("checkbox", { name: "Remember for files like this" })
    expect(remember).not.toBeChecked()
    await user.click(remember)
    expect(screen.getByLabelText("Profile name")).toHaveValue("bank")
    await user.clear(screen.getByLabelText("Profile name"))
    await user.type(screen.getByLabelText("Profile name"), "Odd bank")

    await user.click(screen.getByRole("button", { name: "Preview with mapping" }))

    expect(await screen.findByRole("heading", { name: "Import preview" })).toBeInTheDocument()
    expect(
      screen.getByText(/Saved mapping profile “Odd bank” for files like this\./),
    ).toBeInTheDocument()
    const stored = JSON.parse(window.localStorage.getItem(MAPPING_PROFILES_KEY) ?? "")
    expect(stored.profiles).toHaveLength(1)
    expect(stored.profiles[0]).toMatchObject({ name: "Odd bank", sourceFileName: "bank.csv" })
  })

  it("pre-applies an exact profile match with attribution", async () => {
    seedOddProfile()
    const user = userEvent.setup()
    mocks.preview.mockRejectedValue(unsupportedHeadersError())
    render(<ImportPage />)

    await user.upload(
      screen.getByLabelText("CSV or JSON files"),
      oddFile("bank-odd-headers.csv", ODD_CONTENT),
    )

    expect(await screen.findByText(/Using saved profile “Odd bank”\./)).toBeInTheDocument()
    expect(screen.getByLabelText("Date (required)")).toHaveValue("Transaction Date")
    expect(screen.getByLabelText("Amount (required)")).toHaveValue("Withdrawal")
    expect(screen.getByLabelText("Description (required)")).toHaveValue("Narrative")
  })

  it("suggests close header matches without applying them", async () => {
    seedOddProfile()
    const user = userEvent.setup()
    mocks.preview.mockRejectedValue(unsupportedHeadersError())
    render(<ImportPage />)

    await user.upload(
      screen.getByLabelText("CSV or JSON files"),
      oddFile("bank-renamed.csv", RENAMED_CONTENT),
    )

    expect(await screen.findByText(/looks like a saved profile/)).toBeInTheDocument()
    expect(screen.queryByText(/Using saved profile/)).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Apply Odd bank" }))

    expect(await screen.findByText(/Using saved profile “Odd bank”\./)).toBeInTheDocument()
    expect(screen.getByLabelText("Date (required)")).toHaveValue("Transaction Date")
  })

  it("manages saved profiles from the imports page", async () => {
    seedOddProfile()
    const user = userEvent.setup()
    render(<ImportPage />)

    expect(
      await screen.findByRole("heading", { name: "Saved mapping profiles" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Odd bank")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Rename Odd bank" }))
    await user.clear(screen.getByLabelText("Profile name"))
    await user.type(screen.getByLabelText("Profile name"), "Odd bank renamed")
    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByText("Odd bank renamed")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Delete Odd bank renamed" }))
    expect(screen.queryByText("Odd bank renamed")).not.toBeInTheDocument()
    expect(screen.getByText(/No saved profiles yet\./)).toBeInTheDocument()
  })

  it("omits transaction links for batches without transactions", async () => {
    const user = userEvent.setup()
    const batch: ImportBatch = {
      id: "batch-2",
      kind: "netWorth",
      sourceName: "synthetic-net-worth.csv",
      sourceHash: "synthetic-hash",
      rowCount: 2,
      importedCount: 2,
      skippedCount: 0,
      replacedCount: 0,
      importedAt: "2026-07-22T12:00:00.000Z",
    }
    mocks.list.mockResolvedValue([batch])
    render(<ImportPage />)

    expect(await screen.findByText("synthetic-net-worth.csv")).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "View synthetic-net-worth.csv transactions" }),
    ).not.toBeInTheDocument()

    const file = new File(["Date,Net Worth\n2026-01-01,1000"], "synthetic-net-worth.csv", {
      type: "text/csv",
    })
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve("Date,Net Worth\n2026-01-01,1000"),
    })
    await user.upload(screen.getByLabelText("CSV or JSON files"), file)
    await user.click(await screen.findByRole("button", { name: "Confirm import" }))
    await screen.findByText("Imported 2 net worth rows.")
    expect(
      screen.queryByRole("link", { name: "View synthetic-net-worth.csv" }),
    ).not.toBeInTheDocument()
  })
})

describe("demo replacement notice", () => {
  afterEach(async () => {
    await database.imports.clear()
  })

  it("warns that importing replaces demo data, once per preview", async () => {
    const user = userEvent.setup()
    await database.imports.add({
      id: "demo-batch-1",
      kind: "bundle",
      sourceName: DEMO_SOURCE_NAME,
      sourceHash: "demo-hash",
      rowCount: 1,
      importedCount: 1,
      skippedCount: 0,
      replacedCount: 0,
      importedAt: "2026-07-22T12:00:00.000Z",
    })
    mocks.preview.mockResolvedValueOnce({
      kind: "transactions",
      sourceName: "real.csv",
      sourceHash: "real-hash",
      rowCount: 1,
      transactions: [],
      wealth: [],
      wealthBreakdown: [],
      wealthAccounts: [],
      issues: [],
      duplicateFile: false,
      duplicateCount: 0,
      replacementCount: 0,
      importableCount: 1,
      duplicatePolicy: "skip",
      wealthPolicy: "skip",
    })
    render(<ImportPage />)
    const file = new File(["Date,Description,Amount"], "real.csv", { type: "text/csv" })
    Object.defineProperty(file, "text", {
      value: () => Promise.resolve("Date,Description,Amount"),
    })
    await user.upload(screen.getByLabelText("CSV or JSON files"), file)
    await screen.findByRole("heading", { name: "Import preview" })
    expect(
      await screen.findByText("Importing will replace the sample demo data currently shown."),
    ).toBeInTheDocument()
    await database.imports.clear()
  })

  it("stays silent for demo bundles", async () => {
    const user = userEvent.setup()
    await database.imports.add({
      id: "demo-batch-1",
      kind: "bundle",
      sourceName: DEMO_SOURCE_NAME,
      sourceHash: "demo-hash",
      rowCount: 1,
      importedCount: 1,
      skippedCount: 0,
      replacedCount: 0,
      importedAt: "2026-07-22T12:00:00.000Z",
    })
    mocks.preview.mockResolvedValueOnce({
      kind: "bundle",
      sourceName: DEMO_SOURCE_NAME,
      sourceHash: "demo-hash-2",
      rowCount: 1,
      transactions: [],
      wealth: [],
      wealthBreakdown: [],
      wealthAccounts: [],
      issues: [],
      duplicateFile: false,
      duplicateCount: 0,
      replacementCount: 0,
      importableCount: 1,
      duplicatePolicy: "skip",
      wealthPolicy: "skip",
    })
    render(<ImportPage />)
    const file = new File(["{}"], "demo.json", { type: "application/json" })
    Object.defineProperty(file, "text", { value: () => Promise.resolve("{}") })
    await user.upload(screen.getByLabelText("CSV or JSON files"), file)
    await screen.findByRole("heading", { name: "Import preview" })
    expect(
      screen.queryByText("Importing will replace the sample demo data currently shown."),
    ).not.toBeInTheDocument()
    await database.imports.clear()
  })
})
