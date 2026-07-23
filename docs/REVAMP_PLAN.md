# BudgetLens Local-First Rewrite Plan

## Status

- Planning baseline: July 22, 2026
- Source branch: `main` at `927d4ba4f2951044dbfba5d42aa4de30ae860e0f`
- Implementation branch: `codex/local-first-rewrite`
- Strategy: controlled rewrite in the existing repository, preserving Git history
- Implementation: phases 0 through 3 complete; automated release-hardening checks complete
- Remaining human release work: manual exploratory testing and synthetic-data screenshots

## Product Goal

Rebuild BudgetLens as a private, local-first financial dashboard that imports all current Credit Karma Data Extractor CSV formats, including transaction, net-worth, and investment history exports. Preserve the useful core experience—transaction exploration, filtering, financial metrics, category analysis, budgeting, dashboard customization, and dark mode—while removing unnecessary server infrastructure and brittle generic abstractions.

The default product must work without an account, backend, PostgreSQL database, Docker daemon, or network connection after the application has loaded. Financial records remain in the user's browser unless the user explicitly exports them.

## Why a Rewrite

The current application has coupled UI, persistence, parsing, and calculations in a single client page and API route. Its apparent production build success is misleading because Next.js is configured to ignore TypeScript and ESLint errors. The baseline also includes failing tests, vulnerable dependencies, duplicated CSV parsing, outdated CSV assumptions, and a large untyped chart abstraction.

A clean application shell with compatibility-focused domain modules is lower risk than incrementally migrating those foundations.

## Architectural Decision

### Selected stack

- React with TypeScript and strict compiler settings
- Vite for development and static production builds
- pnpm with a pinned version in `package.json`
- TanStack Router for typed routes and URL-backed filters
- Tailwind CSS and current shadcn/ui components
- Recharts 3 for financial visualizations
- Dexie over IndexedDB for versioned, browser-local persistence
- Papa Parse for RFC-compatible CSV parsing
- Zod for runtime schema validation and useful import errors
- Oxlint with type-aware rules and Oxfmt for fast, consistent quality checks
- Vitest for domain and component tests
- Playwright for browser-level workflows and visual behavior

### Explicitly not selected

- **Next.js:** server rendering and API routes do not improve the primary local-import workflow.
- **TanStack Start:** its server functions, SSR, and full-stack deployment model are unnecessary for the local-first product. TanStack Router keeps a future migration path open.
- **PostgreSQL/Prisma:** they impose installation, security, and deployment costs without providing value for a single-user local dashboard.
- **A single universal chart generator:** domain-specific typed charts are easier to test, understand, and make accessible.

### Future cloud sync boundary

UI code must read and write through repository interfaces rather than importing Dexie tables directly. An optional authenticated sync implementation can later satisfy the same interfaces. No cloud or authentication code is part of this rewrite.

## Information Architecture

### Routes

| Route           | Purpose                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `/`             | Overview with net worth, investments, cash flow, category summary, budgets, and recent activity |
| `/net-worth`    | Net-worth and investment history, ranges, changes, comparison, and accessible data table        |
| `/transactions` | Search, filters, sorting, editing, pagination, and transaction details                          |
| `/budgets`      | Category goals, progress, warnings, and period selection                                        |
| `/imports`      | CSV selection, detected type, preview, validation, import history, and errors                   |
| `/settings`     | Theme, currency, data export, data deletion, and privacy information                            |

Route filters that users may want to bookmark—date range, accounts, categories, vendors, and transaction types—should live in validated URL search parameters. Draft form state stays local to the component.

## Domain Model

### Transaction

```ts
interface Transaction {
  id: string
  date: string // validated ISO calendar date
  description: string
  amountMinor: number // integer minor currency units
  category: string | null
  transactionType: string | null
  accountName: string | null
  accountType: string | null
  provider: string | null
  labels: string[]
  notes: string | null
  importBatchId: string
  fingerprint: string
  createdAt: string
  updatedAt: string
}
```

Money is stored as integer minor units to avoid floating-point aggregation errors. Display currency is an application preference; Credit Karma exports are treated as the configured default currency unless future exports provide currency metadata.

### Wealth snapshot

```ts
type WealthSeries = "netWorth" | "investment"

interface WealthSnapshot {
  id: string
  series: WealthSeries
  date: string
  valueMinor: number
  importBatchId: string
  fingerprint: string
  createdAt: string
}
```

Net worth and investment values share storage and chart transforms while retaining an explicit series discriminator. The logical uniqueness key is `series + date`; importing a newer value for the same series and date requires an explicit previewed replacement policy.

### Import batch

```ts
type ImportKind = "transactions" | "netWorth" | "investment"

interface ImportBatch {
  id: string
  kind: ImportKind
  sourceName: string // sanitized basename only
  sourceHash: string
  rowCount: number
  importedCount: number
  skippedCount: number
  replacedCount: number
  importedAt: string
}
```

The original file contents are never stored as an import batch. Import history contains only the minimum metadata necessary for duplicate detection and user troubleshooting.

## Import Compatibility

### Supported Credit Karma Data Extractor formats

1. Wealth export: `Date,Net Worth`
2. Investment export: `Date,Investment Value`
3. Transaction exports with a configurable subset of:
   - `Date`
   - `Description`
   - `Amount`
   - `Category`
   - `Transaction Type`
   - `Account Name`
   - `Account Type`
   - `Provider`
   - `Labels`
   - `Notes`
4. Legacy BudgetLens transaction header aliases:
   - `Store/Vendor` maps to `Description`
   - `Type` maps to `Transaction Type`

`Date` and `Amount` are required for a transaction import. Optional columns receive `null` or empty defaults. Header matching is trimmed and case-insensitive but never guessed from row values.

### Import stages

1. Enforce file count and configurable file-size/row limits.
2. Decode text and reject unsupported/binary input.
3. Parse CSV with quoted field, embedded comma, escaped quote, BOM, CRLF, and blank-line support.
4. Normalize and classify headers.
5. Validate every row without mutating persistence.
6. Present detected kind, valid count, skipped count, duplicate count, replacements, and representative errors.
7. Commit the accepted batch in one database transaction.
8. Present an import receipt and navigation to the relevant route.

Malformed files must not partially import. User cancellation before confirmation writes nothing.

## Core Feature Preservation

| Existing capability            | Rewrite treatment                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Transaction CSV upload         | Preserve and expand to all current extractor columns and multi-file import               |
| Transaction search/filter/sort | Preserve with typed URL filters and scalable rendering                                   |
| Add/edit/delete transaction    | Preserve with validated forms and confirmation for destructive actions                   |
| Expense/income/savings metrics | Preserve with centralized, tested calculation rules                                      |
| Monthly trends                 | Preserve as a typed cash-flow chart                                                      |
| Category breakdown             | Preserve with chart plus accessible tabular equivalent                                   |
| Budget goals                   | Preserve with monthly/yearly periods and persisted settings                              |
| Dark/light theme               | Preserve with system preference support                                                  |
| Dashboard customization        | Preserve a constrained widget visibility/order model; defer arbitrary chart construction |
| Drag-and-drop                  | Preserve for dashboard widget ordering with keyboard controls and a non-drag alternative |
| Generic custom charts          | Defer until domain dashboards are complete and user demand is demonstrated               |
| PostgreSQL/Docker              | Remove from the default product; reconsider only for a future sync service               |

## Net-Worth Experience

### Summary metrics

- Latest net worth and its observation date
- Latest investment value and its observation date
- Net-worth absolute and percentage change over the selected range
- Investment absolute and percentage change over the selected range
- Investments as a percentage of net worth when the denominator is valid
- Clear empty, single-point, stale-data, and negative-value states

### Chart behavior

- Net worth and investments may be toggled independently.
- Presets: 1M, 3M, 6M, YTD, 1Y, and All.
- A custom date range is supported.
- Values use locale-aware compact axis formatting and full currency tooltips.
- Dates remain calendar dates and must not shift because of time zones.
- Charts resize in grid and mobile layouts.
- Keyboard navigation, screen-reader labels, reduced motion, adequate contrast, and an accessible table are required.
- Large datasets may be downsampled for drawing, but summary calculations and the accessible table use the complete filtered series.

## Component and Design-System Rules

- Generate only shadcn components that are actually used.
- Keep primitives in `src/components/ui` and domain components by feature.
- Use semantic design tokens rather than hard-coded chart/UI colors.
- Financial gains and losses cannot rely on color alone; pair color with sign, label, and iconography.
- Every icon-only control requires an accessible name and visible tooltip when useful.
- Every loading operation needs a bounded skeleton or progress state; no full-screen spinner for routine data refreshes.
- Empty states explain the next action and link to Imports.
- Desktop, tablet, and narrow mobile layouts are first-class acceptance targets.

## Source Layout

```text
src/
  app/                 # providers, router, shell
  components/ui/       # selected shadcn primitives
  features/
    dashboard/
    imports/
    net-worth/
    transactions/
    budgets/
    settings/
  db/                  # Dexie schema, migrations, repositories
  domain/              # types, money, dates, calculations
  test/                # shared synthetic factories and render helpers
  routes/              # TanStack Router files
tests/
  browser/             # Playwright flows
  fixtures/            # synthetic CSV files only
```

Feature directories own their components, hooks, schemas, calculations, and focused tests. Cross-feature imports must flow through stable domain or repository contracts rather than reaching into another feature's internals.

## Parallel Workstreams

Parallel implementation begins only after the foundation defines package versions, aliases, formatting, routing conventions, domain contracts, database interfaces, and test helpers.

### Stream A: data and imports

Ownership:

- `src/domain/**`
- `src/db/**`
- `src/features/imports/**`
- `src/routes/imports.tsx`
- `tests/fixtures/**`

Deliverables:

- Versioned IndexedDB schema and repository implementations
- CSV classifier, alias normalization, parsers, validation, fingerprints, preview, and atomic commit
- Synthetic current/legacy transaction, net-worth, investment, malformed, quoted-field, duplicate, and replacement fixtures
- Import route and import-history UI
- Unit and component tests

### Stream B: net worth and investments

Ownership:

- `src/features/net-worth/**`
- `src/routes/net-worth.tsx`

Deliverables:

- Range and summary calculations
- Responsive dual-series chart and accessible table
- Summary cards, empty/stale/single/negative states, and range controls
- Unit and component tests using shared synthetic repository factories

This stream codes against the repository interfaces and factories established in the foundation; it must not directly modify Dexie or import parsing.

### Stream C: core dashboard and transactions

Ownership:

- `src/features/dashboard/**`
- `src/features/transactions/**`
- `src/features/budgets/**`
- `src/routes/index.tsx`
- `src/routes/transactions.tsx`
- `src/routes/budgets.tsx`

Deliverables:

- Tested financial metrics and monthly/category aggregations
- Overview widgets and constrained customization model
- Transaction table/list with typed filters and validated CRUD forms
- Budget goals and progress
- Unit and component tests

### Integration ownership

The integrating agent exclusively owns shared configuration after parallel work starts:

- `package.json` and `pnpm-lock.yaml`
- Vite, TypeScript, lint, test, and Playwright configuration
- `src/app/**`
- root route tree generation
- global CSS and design tokens
- CI workflows
- documentation and final conflict resolution

Agents must not change shared configuration without coordinating first. Each stream must keep exported interfaces small and report any contract mismatch rather than silently changing shared contracts.

## Test Strategy

### Domain tests

- Currency parsing and integer-minor conversion, including negatives and parentheses
- ISO calendar-date parsing without time-zone drift
- Credit/debit/income/expense normalization
- Category, cash-flow, savings, budget, and net-worth calculations
- Range boundaries, zero denominators, one-point series, missing dates, and negative values

### Import tests

- All supported headers and legacy aliases
- Configurable transaction column subsets
- Quoted commas, escaped quotes, BOM, CRLF, blank lines, and multiline fields
- Invalid/missing headers, invalid dates, invalid money, oversized input, and mixed file kinds
- Duplicate file, duplicate rows, same-date wealth replacement, cancellation, and atomic rollback
- No raw file content in import history or logs

### Component tests

- User-visible behavior and accessible roles instead of implementation-specific test IDs
- Filters and URL state
- Dialog focus, labels, keyboard operation, errors, and confirmations
- Chart controls plus accessible fallback content
- Import preview and confirmation outcomes

### Browser tests

1. Fresh user imports a transaction CSV and sees overview/transaction results.
2. Fresh user imports net-worth and investment CSVs and sees both chart series and correct summary values.
3. Re-import detects duplicates without inflating totals.
4. Same-date wealth conflicts require and respect the chosen replacement behavior.
5. Filters survive refresh through URL state.
6. Transaction CRUD updates metrics.
7. Theme and dashboard preferences survive refresh.
8. Export/backup and delete-all controls work with confirmation.
9. Keyboard-only import, navigation, chart range selection, and transaction editing work.
10. Narrow mobile viewport has no horizontal application overflow.

### Real-export compatibility checks

Real financial exports may be read only from paths outside the repository. A local compatibility command will report only file kind, header mapping, row counts, and validation counts—never row values. It must not snapshot, copy, upload, log, or commit those files. Any discovered edge case becomes a minimal synthetic regression fixture with invented names, dates, and amounts.

### Required merge gate

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:browser
pnpm build
pnpm audit --prod
```

No build configuration may suppress lint or type errors. CI uses least-privilege permissions, pinned action major versions, dependency caching through pnpm, concurrency cancellation, timeouts, and no repository secrets.

## Privacy and Security Requirements

- Never commit real exports, HAR files, database contents, screenshots containing financial data, credentials, or Credit Karma responses.
- Add patterns for local fixture directories, CSV exports, HAR files, database files, and environment files to `.gitignore` without accidentally ignoring committed synthetic fixtures.
- Do not log transactions, wealth values, parsed rows, or file contents.
- Validate all untrusted file data before persistence or rendering.
- Apply file-size and row-count limits to prevent browser denial of service.
- Escape spreadsheet-formula-leading cells when exporting CSV backups.
- Keep dependencies minimal and remove unused shadcn/Radix packages.
- Add a clear local-storage/privacy explanation and delete-all-data action.
- No telemetry or analytics by default.

## Delivery Phases and Merge Order

### Phase 0: baseline and plan

- Preserve baseline results in this document.
- Confirm real export formats without copying sensitive data.
- Establish the rewrite branch.

### Phase 1: foundation merge gate

- Replace Next.js scaffold with Vite/React/TypeScript/pnpm.
- Add router shell, selected design tokens, theme, error boundaries, and placeholder routes.
- Define domain and repository contracts plus synthetic factories.
- Add green lint/typecheck/unit/build CI.
- Use Oxlint/Oxfmt as the shared fast quality gate and keep standalone TypeScript checking explicit.

Parallel streams branch conceptually from this contract point.

### Phase 2: parallel feature implementation

- Stream A: persistence and imports
- Stream B: net worth and investments
- Stream C: transactions, overview, and budgets

Each stream must pass focused tests before integration.

### Phase 3: integration

- Connect live repositories to feature routes.
- Resolve route-tree and navigation integration centrally.
- Add settings, backup/export, reset, global error/empty states, and responsive polish.
- Remove obsolete Next.js, Prisma, Docker, Jest, and unused UI files.

### Phase 4: release hardening

- Run all required checks and real-export compatibility tests.
- Perform human manual testing with private data before release.
- Update README, screenshots using synthetic data, changelog, migration notes, and release instructions.
- Open a draft PR with an AI-assistance disclosure and an explicit distinction between automated and human testing.

## Definition of Done

- Current and legacy transaction exports import correctly.
- Net-worth and investment exports import independently or together and render correct metrics/charts.
- Core transaction, metric, category, monthly trend, budget, theme, and dashboard-ordering features remain available.
- The app runs as a static local-first application without PostgreSQL or Docker.
- No real financial data exists anywhere in the tracked tree or Git history introduced by this work.
- Lint, typecheck, unit/component tests, browser tests, build, and production audit pass without suppression.
- Accessibility and narrow-mobile browser tests cover the primary workflows.
- Documentation explains privacy, backups, imports, migration limitations, and how to contribute synthetic fixtures.

## Deliberate Follow-Ups

- Optional encrypted cloud sync and authentication
- Multi-currency transaction and wealth series with exchange-rate provenance
- Account-level balance history if the extractor adds that format
- Arbitrary user-authored charts after the typed dashboards are stable
- Installable PWA/offline asset caching after update and data-backup behavior is designed
