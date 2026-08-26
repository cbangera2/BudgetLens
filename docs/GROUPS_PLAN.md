# Transaction Groups & Shared Costs — Implementation Plan

Status: draft for discussion
Branch: `feat/transaction-groups`

## Problem

Transactions are a flat list. Real-life spending happens in **projects** — a vacation,
a wedding, a home renovation — and the questions that matter ("what did Japan cost?",
"what's my share after splitting with Sam?") can't be answered today.

Goals:

1. Let users group transactions into named **groups** (e.g. "Vacation 2026") and see
   what the group cost, with per-category/daily breakdowns.
2. Let users mark a transaction as **shared**: its _effective_ cost is divided
   (default ÷2) because someone else reimbursed part of it (Venmo, cash, etc.).

Non-goals (for this PR): multi-user accounts, automatic Venmo/bank matching,
recurring groups, cloud sync.

## Design decisions

### D1 — Groups are first-class entities, membership is a field on the transaction

New table `transactionGroups`; each transaction gets a nullable `groupId`.
A transaction belongs to **at most one group** (matches the mental model; keeps bulk
UI simple). Deleting a group **unassigns** members — transactions are never deleted.

```ts
// src/domain/models.ts
interface TransactionGroup {
  id: string // crypto.randomUUID()
  name: string // unique-ish, user-facing
  description: string | null
  color: string | null // hex, used in charts
  startDate: IsoDate | null // optional trip window
  endDate: IsoDate | null
  budgetMinor: number | null // optional expected cost → progress bar
  archived: boolean // hide from default views without deleting
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

type TransactionGroupDraft = Omit<TransactionGroup, "id" | "createdAt" | "updatedAt">
```

### D2 — Shared = `shareCount` on the transaction, not a separate ledger

```ts
// added to Transaction (all optional/nullable — zero migration pain)
groupId: string | null // default null
shared: boolean // default false
shareCount: number // default 1; effective cost = amount / shareCount
```

- Marking shared defaults to ÷2 (`shareCount = 2`), editable 2–10.
- Effective amount: `effectiveMinor(t) = Math.round(amountMinor / shareCount)` when
  `shared`, else raw. Works for refunds/income too (same division).
- **Fingerprint intentionally excludes these fields** — re-importing the same CSV must
  not duplicate rows or clobber manual assignments.

Why not a reimbursements ledger? It models the wrong thing (two-sided records),
requires matching income↔expense, and users already told us the rule of thumb:
"divide by half". A count is one integer and trivially explains itself in the UI.

### D3 — Where splits apply

| Surface                     | Uses raw or effective amounts?                         |
| --------------------------- | ------------------------------------------------------ |
| Dashboard metrics/cash flow | **raw** (money actually left your account)             |
| Budget progress             | raw                                                    |
| Group rollups & analytics   | **effective** (your true cost) + gross shown alongside |
| Import dedupe               | unaffected                                             |

This is explicit in the UI copy so totals never silently disagree.

### D4 — Schema v3

Dexie version bump only (latest-version declaration style, like v1→v2):

```ts
DATABASE_SCHEMA_VERSION = 3
stores: {
  transactions: "...existing..., groupId",   // index for member queries
  transactionGroups: "&id, name, archived",
}
```

Registration checklist (every place tables are enumerated):

- [ ] `src/db/database.ts` — version + class property
- [ ] `src/domain/repositories.ts` — interface + aggregate
- [ ] `src/db/repositories.ts` — implementation; **extend `update()`'s explicit
      field rebuild** with `groupId/shared/shareCount` or edits silently drop them;
      add `groupMembers(groupId)` helper
- [ ] `src/features/settings/backup.ts` — include groups in backup v3 +
      `clearAllData`
- [ ] `settings-page.tsx` counts row (optional)

Import service untouched except confirming new transaction fields default safely in
its `bulkAdd` spread.

### D5 — Analytics as pure functions

New `src/features/groups/calculations.ts`, mirroring `dashboard/calculations.ts`:

```ts
calculateGroupSummary(members: readonly Transaction[], group: TransactionGroup):
  GroupSummary {
  grossMinor            // sum of normalized expenses (raw)
  effectiveMinor        // sum with shareCount applied (your cost)
  savedBySharingMinor   // gross − effective
  refundMinor           // credits inside the window
  byCategory            // {category, effectiveMinor, share}[] desc
  byDay                 // [{date, cumulativeEffectiveMinor}] between start/end
  topExpenses           // top 5 by |amount|
}
```

All amounts via existing `normalizeTransactionAmountMinor`. Unit tests cover rounding
(÷3 on odd cents), negative amounts, empty groups, missing members.

### D6 — UI

1. **Groups page** (`/groups`, nav item "Groups"): card grid like Budgets page —
   name, date window, spent vs budget `<progress>`, member count, effective vs gross.
   Create/edit form Card. Archive toggle.
2. **Group detail** (`/groups/$id`): summary stats row, category pie + daily spend
   bar (reuse `ChartContainer`/Recharts patterns), member table (remove from group,
   toggle shared inline).
3. **Transactions page — first-class multi-select**:
   - checkbox column, header select-all (page-scoped),
   - bulk action bar when `selection.size > 0`: _Add to group ▾_, _Remove from
     group_, _Mark shared ÷2_, _Set split…_, _Clear_;
   - per-row badges: colored group chip + "½" shared indicator;
   - filter extension: `?group=<id>` in `filtering.ts` URL state.
4. **Transaction form**: group `<select>` + shared toggle with split-count input
   (shown only when shared); preview line "Counts as −$X".
5. **Dashboard widget (stretch)**: `"groups"` module in customization catalog,
   category "Plan", showing active groups + effective spend.

### D7 — Testing strategy

- Pure calc tests (rounding, mixed sign, empty).
- Repo tests w/ fake-indexeddb: put/update round-trips preserve new fields;
  `update()` regression test for the dropped-field bug class.
- Component tests: selection bar renders/applies bulk updates; groups page CRUD;
  form validation (split ≥ 2 when shared).
- Browser test happy path: create group → select 3 txns → assign → mark one shared
  → detail page shows ÷2 math.
- Backup v3 test updated (mock object gains `transactionGroups`).

## Phasing (each phase shippable, CI green)

| Phase | Scope                                                            |
| ----- | ---------------------------------------------------------------- |
| 1     | Schema v3, models, repositories, backup v3, factories/tests      |
| 2     | Groups page CRUD (+ route/nav)                                   |
| 3     | Transactions multi-select + bulk assign/shared actions + filters |
| 4     | Rollup calcs + group detail analytics/charts                     |
| 5     | Form fields, dashboard widget, README/docs                       |

Single PR if review stays manageable; otherwise phase-per-PR onto this branch series.

## Open questions

1. One group per transaction (proposed) — ever need overlapping memberships?
2. Fixed ÷2 default OK? Cap at ÷10?
3. Should shared splits ever affect global dashboard numbers, or group-only (proposed)?
4. Name: "Groups" vs "Collections" vs "Projects"?

## Acceptance criteria

- Create/rename/archive/delete group; delete never removes transactions.
- Bulk-assign ≥1 txn to a group; mark shared; correct ÷N math incl. rounding.
- Group detail shows gross vs effective vs saved-by-sharing, category split, daily trend.
- Re-importing identical CSV preserves assignments (fingerprint unchanged).
- Backup contains groups + new fields; clear-all wipes them.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` green;
  browser suite passes desktop + mobile viewport.
