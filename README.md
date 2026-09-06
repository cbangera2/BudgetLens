# BudgetLens

A private, local-first dashboard for exploring transaction, net-worth, and investment-history
exports from [Credit Karma Extractor](https://github.com/cbangera2/CreditKarmaExtractor).

**[Try the live demo](https://cbangera2.github.io/BudgetLens/) · [Download the desktop app](https://github.com/cbangera2/BudgetLens/releases) · [Report an issue](https://github.com/cbangera2/BudgetLens/issues)**

Financial data stays on your device. No account system, analytics, application server, or database
service — imported files are never uploaded.

![BudgetLens overview with synthetic demo data: stat modules, filters, custom-chart builder, and the assistant button at bottom right](docs/images/budgetlens-dashboard.jpg)

_The screenshot contains invented demo data only._

## Get started

- **Web:** open the [live demo](https://cbangera2.github.io/BudgetLens/) — nothing to install.
- **Desktop:** download the latest release for macOS (Apple Silicon) or Windows. Updates install
  themselves from Settings. Builds are unsigned for now: on macOS right-click → Open (or allow it
  in Privacy & Security); on Windows choose `More info` → `Run anyway`.
- **From source:** requires Node.js 22+ and [pnpm](https://pnpm.io/).

```bash
git clone https://github.com/cbangera2/BudgetLens.git
cd BudgetLens
pnpm install --frozen-lockfile
pnpm dev
```

Moving between browser, desktop, or machines? Data lives in a separate local store per origin, so
export a JSON backup from Settings first, then restore it where you're going.

## What you can do

- Import transaction CSVs, Credit Karma JSON responses (up to 20 files at once), or one versioned
  BudgetLens JSON bundle — with previews, duplicate skipping, and per-file failure isolation.
- Import net-worth, investment, breakdown-segment, and account-source histories independently.
- Search, filter, sort, add, edit, and delete transactions; bulk-assign them to named groups with
  shared-cost splits.
- Set import rules that auto-categorize matching transactions on the way in.
- Spot recurring subscriptions and monthly burn.
- Track monthly or yearly category budgets.
- Rearrange dashboard modules and build custom charts (bar, donut, area) with your own metrics,
  filters, and styling.
- Ask the built-in assistant about your finances. It defaults to local Ollama
  (`ollama serve` + `ollama pull qwen2.5:7b`) so nothing leaves your machine; hosted keys are kept
  in the OS keychain, and every answer is labeled local or cloud.
- Back up everything to JSON (desktop and mobile back up automatically on suspend) or wipe
  local data from Settings.

## Import formats

Transaction CSVs require `Date` and `Amount`, plus optional `Description`, `Category`,
`Transaction Type`, `Account Name`, `Account Type`, `Provider`, `Labels`, and `Notes` (legacy
`Store/Vendor` and `Type` headers still work). Wealth histories use `Date,Net Worth` or
`Date,Investment Value`; dated breakdown snapshots use `As Of,Section,Segment,Balance,Descriptor`.
Always review the in-app preview before confirming an import.

## Privacy

Storage is local to the current browser profile or app install — clearing site data removes it, so
keep a JSON backup somewhere private. Never commit real exports, credentials, backups, or
screenshots with personal data.

## Development

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:browser
```

Stack: React 19, TypeScript, Vite, TanStack Router, Tailwind, Recharts, Dexie/IndexedDB, Papa Parse,
Zod, Oxlint/Oxfmt, Vitest, Playwright, Tauri (desktop). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Changelog

### 1.1.0

- Desktop apps for macOS (Apple Silicon) and Windows with signed in-app auto-update.
- Local-first assistant: Ollama and OpenAI-compatible providers, OS-keychain keys, local/cloud
  badges, and approval-gated writes.
- Transaction groups with shared-cost splits, import rules, subscription detection with
  monthly burn, golden demo data, first-run onboarding, automatic backup on suspend, mobile
  shell pass, iOS shell groundwork.
- One-file BudgetLens bundle imports, multi-file previews with failure isolation, dated
  asset/debt breakdown and account-source imports, removable import batches.

### 1.0.0 — July 2026

- Local-first rewrite: static Vite + pnpm + Oxlint/Oxfmt replacing Next.js, PostgreSQL, Prisma,
  Docker, npm, and ESLint.
- Versioned browser-local IndexedDB storage with backups and destructive-action confirmations.
- Net-worth and investment imports, summaries, charts, ranges, and accessible tables.
- Transaction management, budgets, dashboard customization, themes, responsive navigation.

Earlier development history remains available in Git.

## Credits

Developed by [Chirag Bangera](https://github.com/cbangera2).
