# BudgetLens iOS Plan

Status: draft for review (no code yet).
Goal: ship BudgetLens to iOS with native feel, minimal work, no fork of the web app.

## 1. Context: what BudgetLens is today

- Static Vite + React 19 + TypeScript app (`package.json:6-10`). `pnpm build` emits static assets; no app server, no auth, no database service.
- Client routing via TanStack Router, browser history, base path synced with Vite base (`src/app/router.tsx:57-62`, `vite.config.ts:15-19`). 8 routes under one `AppShell` (`src/app/router.tsx:12-53`, `src/app/app-shell.tsx:27-35`):
  Overview, Net worth, Transactions, Groups, Group detail, Budgets, Imports, Settings.
- Shell is desktop-first: sticky header, collapsible sidebar nav, footer, floating assistant FAB/panel (`src/app/app-shell.tsx:92-187`).
- Persistence is local-first via Dexie/IndexedDB, schema v3, 7 tables (`src/db/database.ts:14-43`). Repositories abstract access (`src/db/repositories.ts`, `src/domain/repositories.ts`).
- Imports/exports are pure client parsing: PapaParse + Zod, multi-file preview, duplicate skip, per-file failure isolation, JSON bundle backup, destructive-action confirmations (see `README.md:15-37`, `src/features/imports/`).
- Charts are Recharts 3 + shadcn composition (`README.md:144-152`). Drag reorder via dnd-kit (`package.json:22-24`).
- Styling is Tailwind v4 + CSS variables with `.dark` variant (`src/styles.css:1-63`). Theming via `useTheme` (`src/app/app-shell.tsx:62`).
- Assistant has two transports (`src/features/assistant/provider.ts:25-82`, `src/features/assistant/assistant-panel.tsx`, `server/assistant-harness.ts`):
  - (a) `opencode-harness`: browser `POST /api/chat` to a Vite-dev-only middleware (`server/assistant-harness.ts:528-572`) which drives local `opencode serve` (`OPENCODE_BASE_URL`, default `http://127.0.0.1:4096`) using `@tanstack/ai` + `@tanstack/ai-opencode` + local-process sandbox. Explicitly dev-only; never in the static build.
  - (b) Direct OpenAI-compatible providers: `opencode-bridge` (`http://127.0.0.1:11435/v1`), `ollama` (`http://localhost:11434/v1`), `lmstudio`, `openrouter`, `openai`, `custom`. Browser `fetch` to `/chat/completions`, tools executed locally against Dexie (`src/features/assistant/data-tools.ts`, `src/features/assistant/provider.ts:256-319`). Tool rows capped (`MAX_TOOL_ROWS = 50`); the finance snapshot is capped aggregates plus top/recent rows and a 90-day daily series (exact shapes in capacitor-plan §6.4 — never raw file contents).
- Quality gates: `pnpm format:check`, `lint`, `typecheck`, `test`, `test:browser` (desktop Chromium + iPhone-sized viewport), `build` (`README.md:120-130`).

Implication: the only portable-to-iOS parts without a server are the static bundle + Dexie + direct-provider assistant path. The harness path cannot ship on a phone.

## 2. Decision: Capacitor wrapper + adaptive mobile shell

### Chosen: Capacitor (native shell around existing Vite build)

How it works, conceptually:

1. Keep developing the web app exactly as today.
2. Add a Capacitor project at the repo root. Its web root points at the Vite production output (`dist/`).
3. Capacitor generates a native `ios/` Xcode project: a full-screen WKWebView loading the bundled files via the Capacitor local scheme (not `file://`), plus a JS-to-native bridge.
4. Ship through Xcode directly to personal devices (free Apple ID — no Developer account, no TestFlight, no App Store; see capacitor-plan §8).
5. Web code detects "running natively" at runtime and switches on iOS shell behaviors (tab bar, sheets, native pickers). Web behavior when absent, so desktop and GitHub Pages are unaffected.

Why this over the alternatives:

- PWA / Add to Home Screen: zero work and worth doing as a rehearsal, but no App Store, weaker persistence guarantees, no Share-sheet open-in, no Face ID, no Keychain.
- Expo + WebView: same WebView result as Capacitor but drags in a full React Native runtime for no benefit.
- Full Expo native port or SwiftUI rewrite: the only path to a 100% native feel, but requires reimplementing routing (Expo Router), UI (Radix/shadcn has no RN equivalent), charts (Recharts does not run on native), persistence (Dexie/IndexedDB does not exist on RN; would become expo-sqlite + Drizzle), and drag interactions (dnd-kit becomes Reanimated). Estimated majority-UI rewrite while domain/Zod/duplicate logic ports cleanly. Deferred unless widgets/watch/Siri demand it.
- Tauri Mobile: same wrapper idea as Capacitor, less mature iOS plugin ecosystem. Not worth the risk.

### Non-goals for v1

- No SwiftUI rewrite, no second codebase to maintain.
- No backend, no accounts, no sync server, no push-notification server.
- No on-device LLM. No widgets, watch app, or Siri.
- No IndexedDB-to-SQLite migration. Dexie stays.

## 3. Architecture

```text
+---------------------+        +------------------------------+
|  Vite static build  | -----> | Capacitor iOS shell (WKWebView)|
|  React + Router     | bundle |  + bridge plugins             |
|  Dexie / IndexedDB  |        |  Filesystem / Share / Haptics  |
|  PapaParse + Zod    |        |  Dialog / Biometrics / Browser |
|  Recharts           |        +------------------------------+
+---------------------+                     |
        ^                                   v
        |                        iOS: Files app, iCloud,
   unchanged `pnpm               Share sheet, Keychain,
   dev/build/test`               Face ID, safe areas
```

Key property: the web bundle does not know about Xcode. The Xcode project does not know about React internals. The only contract is:

- the bundle URL Capacitor loads,
- a small `isNative()` runtime check,
- a small native adapter module the UI calls instead of DOM-only APIs (file open, file save/share, secure key storage, haptics, biometric gate).

Everything else (routes, tables, charts, budgets, groups, import validation, theme) is shared.

## 4. What reuses as-is vs. what adapts

### Reuses as-is (~90%)

- All 8 routes and their data loading (`src/routes/`, `src/features/transactions|budgets|groups|net-worth|dashboard|charts|imports|settings/`).
- `src/domain/` math (amounts, duplicate fingerprints), Zod import schemas, PapaParse parsing, budget/group/shared-split rules.
- Dexie repositories and schema (`src/db/database.ts`, `src/db/repositories.ts`). No migration.
- Recharts chart definitions and saved/editable chart model. Only presentation/perf tuning on small screens, not a lib swap.
- Theme tokens and dark mode (`src/styles.css`, `src/app/theme-provider.tsx`). iOS follows the system setting by default.
- Vitest suite, Playwright desktop suite, lint/typecheck/format gates.

### Adapts (small, guarded touch points)

1. Router history (`src/app/router.tsx:62`).
   Today: browser history only. In a bundled `capacitor://` context there is no HTTP server to resolve deep links on reload. Plan: keep browser history on web, select hash or memory history when natively hosted. Must keep `basepath` logic (`src/app/router.tsx:57-62`) consistent with Vite `base` (`vite.config.ts:15-19`). Add a regression test asserting both modes build the same route tree.
2. Vite base (`vite.config.ts:15-19`).
   Today: `/` locally, `/BudgetLens/` on GitHub Actions. Capacitor needs a bundle-relative base (its local scheme serves from a known origin, not Pages). Plan: introduce a build env (e.g. Capacitor build sets its own `VITE_BASE`) without changing the two current cases. Verify asset URLs, lazy route chunks (`lazyRouteComponent` in `src/app/router.tsx:13-52`), and citation href base-stripping (`src/features/assistant/assistant-panel.tsx:242-252`) still resolve.
3. App shell (`src/app/app-shell.tsx`).
   Today: header + collapsible sidebar + FAB + footer. Reuse the `navigation` array (`src/app/app-shell.tsx:27-35`) but branch rendering: sidebar on `lg` web, iOS bottom tab bar on native/small viewport. Assistant FAB becomes a tab or a bottom-sheet handle. Footer hidden or condensed on native. Sidebar preference keys (`SIDEBAR_PREFERENCE_KEY`, `ASSISTANT_OPEN_KEY`) remain; add a native tab state key with the same best-effort storage pattern.
4. Assistant provider list (`src/features/assistant/provider.ts:25-82`).
   Hide on native: `opencode-harness` (needs `pnpm dev`, per its own hint), `opencode-bridge`, `ollama`, `lmstudio`, and any `http://localhost|127.0.0.1` custom URL. Show on native: `openrouter`, `openai`, HTTPS `custom` only. Default native fresh install to `openrouter` with empty key and an explicit opt-in screen. Keep `ASSISTANT_TOOL_SCHEMAS` and `data-tools.ts` execution unchanged.
5. Global CSS (`src/styles.css`).
   Additive only: safe-area insets for notch/Dynamic Island/home indicator, `100dvh` sheet heights, removal of hover-only affordances on coarse pointers, system-font stack preference on native, overscroll/bounce tuning. No token changes.
6. File and share flows (`src/features/imports/`, Settings backup/clear).
   Today: `<input type=file>` multi-select (up to 20 files) and browser download for JSON backup. On native these call the adapter (Section 5) instead: native document picker returning readable file URIs piped into the existing PapaParse/Zod preview pipeline; backup JSON written via Filesystem then shared via Share sheet. "Remove import batch" and "clear browser data" semantics stay, but copy must say "app data" on native.

Explicitly not touched: `server/assistant-harness.ts` (stays dev-only), database schema, import validation rules, chart data model.

## 5. Native adapter (the only new abstraction)

New module, conceptually `src/lib/native.ts` (name TBD), exposing platform-agnostic operations with web fallbacks:

- `isNative()`: true only inside Capacitor. All UI branches key off this plus existing responsive breakpoints, never user-agent sniffing alone.
- `pickImportFiles()`: web falls back to file input; native opens the document picker (CSV/JSON UTIs, multi-select up to 20, Files + iCloud Drive). Must preserve per-file failure isolation and cross-file duplicate detection UX.
- `saveBackupFile()` / `shareBackupFile()`: web falls back to download; native writes to app sandbox via Filesystem then invokes Share. Must handle large JSON without blocking the WebView and surface cancellation cleanly.
- `getApiKey()` / `setApiKey()` / `deleteApiKey()`: web keeps current localStorage settings (`ASSISTANT_SETTINGS_KEY`); native stores hosted provider keys in Keychain via secure storage, never in plain IndexedDB/localStorage. Deleting app data must wipe the Keychain entry too.
- `haptic(kind)`: no-op on web; light/medium/success on bulk assign, shared-split toggle, save, apply-proposal.
- `lockWithBiometrics()`: optional Face ID/Touch ID gate before showing finance data, with passcode fallback and a clear "off" setting. Must not lock the user out if biometrics change.

Rules: features never import Capacitor directly; they import the adapter. The adapter is the only file allowed to import Capacitor plugins. This keeps web tests (jsdom, no native runtime) green and makes the native surface auditable.

Plugins anticipated (names may shift with Capacitor versions): Filesystem, Share, Dialog, Haptics, App (deep-link/open-in handling), and a secure-storage/biometrics plugin. No custom Swift in v1 except config/entitlements.

## 6. iOS UX pass (where "native feel" actually comes from)

Native feel is navigation + sheets + touch, not a rewrite. Planned deltas, all responsive (desktop unchanged):

- Navigation: bottom tab bar with the 5-7 existing destinations (Overview, Net worth, Transactions, Groups, Budgets, + More for Imports/Settings). Large titles, sticky section headers, swipe-back where the router supports it. Reuse `navigation` labels/icons from `src/app/app-shell.tsx:27-35`.
- Sheets not modals: transaction add/edit, filters, import preview/confirm, budget editors, assistant panel become swipe-dismissable bottom sheets with `100dvh` caps and keyboard avoidance. The resizable floating `AssistantPanel` (`assistant-window` in `src/styles.css`, resize drag in `assistant-panel.tsx`) is desktop-only; on native it is full-screen or sheet.
- Touch patterns: 44pt minimum targets, swipe-to-edit/delete on transaction rows, pull-to-refresh on lists, segmented control for 1M/3M/6M/YTD/1Y/All, native-style date picker trigger, long-press context menus where useful. Remove hover-only affordances.
- Inputs: `inputMode`, `enterKeyHint`, numeric keyboards for amounts, Files/iCloud picker trigger labeled honestly ("Browse Files"), camera not needed in v1.
- Feedback: haptics on the actions above, skeleton placeholders for chart/table loads, optimistic UI for add/edit/delete with existing confirmations intact.
- Charts on small screens: keep Recharts, but disable animation on native/low-power, reduce point density for long histories, ensure legends/labels wrap or collapse, verify tooltips work with touch (tap-to-inspect fallback). Virtualize the transaction list.
- System integration: follow iOS light/dark automatically (with manual override retained), Dynamic Type should not break layouts (test largest text), VoiceOver labels on tab bar/sheets/charts (reuse existing aria patterns), safe areas everywhere including sheets and FAB replacement.

## 7. Storage, backup, and data safety on iOS

- Primary store stays Dexie/IndexedDB in WKWebView. Validate on device: quota, persistence across app restarts and iOS updates, behavior under low-storage eviction, and what "clear app data" in Settings wipes.
- Backups become first-class because WebView storage is less durable than users expect: Settings backup writes a versioned JSON bundle (same shape as web backup) to a user-visible location via Filesystem + Share; restore goes through the document picker into the existing import pipeline with the same duplicate/conflict review.
- Origin caution from web (`README.md:102-118`: storage tied to origin, moving hosts needs a backup) maps to native as: WebView scheme/origin must be stable across updates or data looks "lost". This is a release-blocker test: install v1, import, upgrade build, confirm data present without re-import.
- API keys in Keychain only. Finance snapshot sent to hosted models stays capped/aggregated as today; raw file contents never leave the device except the snapshot over HTTPS after opt-in.
- Face ID gate is app-level obscuring (blur + auth challenge), not encryption. Do not claim encryption. Consider Data Protection entitlement (`NSFileProtectionCompleteUntilFirstUserAuthentication` or stronger) as a cheap hardening step; document what it does and does not cover.

## 8. Assistant on iOS (direct providers only)

- Ship state: app is fully usable offline with the assistant disabled. Assistant is an opt-in hosted feature.
- Transport: reuse `requestChatTurn` / `sendToolResults` (`src/features/assistant/provider.ts:256-319`) and `ASSISTANT_TOOL_SCHEMAS` + `executeAssistantTool` (`src/features/assistant/data-tools.ts`) unchanged. Only the base URL/key source changes (HTTPS + Keychain).
- Blocked on native: `opencode-harness` and all `localhost` presets (Section 4.4). The harness Vite middleware and `opencode serve` dependency do not exist on-device. Do not attempt to bundle Node/opencode in v1.
- Privacy: before first hosted call, show what `buildFinanceSnapshot` includes (counts, aggregates, capped top rows, truncated descriptions) and require explicit consent per provider. Persist consent alongside settings. Every answer keeps existing proposal-approval UX (`ProposalCard`: budget/recategorize apply only on tap).
- Networking: all assistant traffic must be HTTPS. No App Transport Security exceptions for production hosts. Timeouts, abort (existing `AbortController` patterns in `assistant-panel.tsx`), and airplane-mode errors must read clearly.
- Future (not v1): thin key-holding relay to avoid BYOK friction; Apple Foundation Models on-device fallback for simple summary Q&A (tool-calling is limited there, so scope to snapshot Q&A, not agent actions).

## 9. Build, signing, and release

- Repo additions: Capacitor config, generated (gitignored, never hand-edited) `ios/` project, scripted native-project patcher landing with the first native change, icons/splash, entitlements, Info.plist usage strings (Face ID only — document-picker reads need none), build docs. Only config + docs + adapter + UI branches are committed.
- Build modes: `pnpm dev` (web, unchanged), `pnpm build` (web/Pages, unchanged), new `pnpm build:ios` (self-bootstraps the platform via `prebuild:ios`, sets Capacitor base, runs `tsc -b && vite build`, syncs to `ios/`). Lint/typecheck/test gates run before any native sync.
- Signing: free-Apple-ID direct install for device testing (no Developer account — App Store/TestFlight indefinitely post-scope, see capacitor-plan §8). Bundle ID `com.cbangera2.budgetlens` shared with Tauri for brand consistency (does NOT share Keychain items — that needs Team ID + access-group entitlements, not configured).
- Device testing first (no TestFlight): install-over-upgrade data retention, Files import, backup share, Face ID, dark mode, largest text, airplane mode, low-storage warning.
- Store submission checklist lives post-scope in capacitor-plan §8. Screenshots and previews use synthetic fixtures only (never real exports, per `README.md:106-109`).

## 10. Privacy and App Store disclosures

- Core app: no account, no analytics, no tracking, no ads (matches `README.md:7-8`). State this in the listing and privacy label.
- Optional assistant: when enabled, a capped snapshot (up to 40 budgets/netWorth rows, 25 top + 100 recent transactions, 90-day daily series, truncated descriptions — exact shapes in capacitor-plan §6.4) leaves the device over HTTPS to the chosen provider (OpenRouter/OpenAI/custom). Disclose per provider, link provider privacy terms, keep consent + Keychain + censored logging (never log keys or snapshot contents).
- Files: document picker reads only user-selected CSVs/JSON; original file contents are not retained beyond the import pipeline (same guarantee as web import metadata).
- Screenshots, previews, and device-test notes use synthetic demo data only.

## 11. Performance and compatibility targets

- Devices: last 3 major iPhone generations + current SE, latest two iOS majors. Verify the supported device list at build time; do not hard-code it here.
- Cold start to interactive Overview on a mid-range device: snappy on cached launch; warm chart interactions at 60fps feel (disable Recharts animation on native if needed).
- Histories: 1M-All ranges over multi-year CSVs must scroll/zoom without jank; cap rendered points on small screens while keeping aggregates exact.
- Memory: 20-file multi-import + large JSON bundle must not OOM the WebView; reuse existing per-file isolation and stream where PapaParse allows.
- Battery: no background work in v1; assistant aborts cleanly on sheet dismiss.

## 12. Testing plan

- Existing gates must stay green: `format:check`, `lint`, `typecheck`, `test`, `test:coverage`, `build`, `test:browser`.
- New native-aware unit tests (jsdom with adapter mocked): router history selection, preset filtering on native vs web, Keychain-vs-localStorage key routing, backup share cancellation, biometric-off fallback.
- Device matrix (physical phones, not just Simulator): fresh install, upgrade retention, Files + iCloud import (CSV, legacy CSV, 20x JSON, bundle), backup export + re-import, Face ID on/off, dark/light, largest Dynamic Type, VoiceOver pass on tabs/sheets, airplane mode for core + assistant, low-storage warning path.
- Evals: existing `pnpm eval:assistant` stays dev-only; add a hosted-provider smoke eval against the capped snapshot with synthetic fixtures only.
- Release checklist: origin-stability upgrade test, Keychain wipe on data-clear test, synthetic-only screenshots, device-test notes with known limits (no harness, no localhost models, backups are manual in v1).

## 13. Rollout (phased, each shippable)

- Phase 0 — PWA rehearsal (hours): deploy static build, Add to Home Screen, smoke fullscreen/offline/iPhone-viewport issues. Informs the sheet/tab-bar pass. No repo changes required.
- Phase 1 — Capacitor shell + parity (days): config, icons, `build:ios`, WebView loads bundle, router/base fix, adapter skeleton with web fallbacks, Simulator device-tester build. No assistant on native yet; core + imports + backups working.
- Phase 2 — Native feel pass (days): tab bar, sheets, touch targets, safe areas, haptics, virtualized lists, Recharts mobile tuning, Face ID gate, Keychain settings. This is the "feels native" milestone.
- Phase 3 — Hosted assistant opt-in (days): preset filtering, BYOK + Keychain + consent screen, HTTPS-only, abort/offline states, smoke eval. Harness stays desktop-dev-only.
- Phase 4 — Hardening + submission (days): performance pass, accessibility pass, privacy label, store listing with synthetic data, TestFlight external, submit. Relay service and on-device model explicitly deferred.

## 14. Risks and mitigations

| Risk                                                             | Effect                               | Mitigation                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| WKWebView storage eviction / scheme-origin change across updates | Looks like data loss                 | Origin-stability upgrade test as release blocker; first-class manual backup/restore; document Data Protection entitlement |
| Router deep-link reload fails in bundle                          | Blank screen on restart/restore      | Hash/memory history on native + state-restore test; keep browser history on web                                           |
| Recharts touch perf on old phones                                | Janky charts                         | Disable animation on native, decimate rendered points, virtualize lists; measure on oldest supported phone                |
| dnd-kit reorder unusable on touch                                | Dashboard/chart reorder feels broken | Replace with simple up/down/move controls or native-friendly drag on small screens; keep dnd-kit on desktop               |
| Apple "just a website" rejection                                 | Submission blocked                   | Offline-first + Files/Share/Haptics/Biometrics/Keychain integration; honest native value statement                        |
| BYOK friction / key phishing appearance                          | Users abandon assistant              | System browser sheet for provider signup docs, paste-once Keychain flow, clear data-leaves-device consent                 |
| Snapshot over-sharing                                            | Privacy incident                     | Keep caps/truncation, consent screen quoting snapshot shape, censored logs, HTTPS-only, no raw file upload                |
| Scope creep to native rewrite                                    | Months lost                          | Hard gate: v1 is wrapper + adaptive shell; Expo/SwiftUI only if widgets/watch demand it                                   |

## 15. Open questions (for reviewer)

1. Capacitor local scheme + Vite `base`: exact `VITE_BASE` value for the native bundle so lazy chunks, `BASE_URL` citation stripping, and PWA manifest (if any) all agree?
2. Router history choice on native: hash vs memory given Tabs + share-sheet deep links ("Open in BudgetLens")? What restores after process kill?
3. IndexedDB durability target on iOS 17/18 WKWebView: measured eviction behavior, and does the Data Protection entitlement change anything?
4. Document picker UTIs + 20-file multi-select limits on real Files/iCloud: max bytes before the WebView bridge needs chunked handoff?
5. Backup share destination default (Files vs iCloud Drive) and filename/versioning so web and iOS bundles stay interchangeable?
6. Keychain plugin choice (Capacitor version compat) and wipe-on-clear semantics?
7. Face ID: Dillon — gate on foreground every time, after timeout, or per-launch? Fallback when biometrics unavailable?
8. Minimum iPhone/iOS version and oldest physical test device for perf sign-off?
9. Privacy label wording for optional hosted inference + Keychain + Files access?
10. Do we need an `NSBonjourServices`/local-network exception at all in v1, or do we ban non-HTTPS assistant endpoints outright on native?

## 16. Definition of done (v1 iOS)

- `pnpm dev/build/test/test:browser` green; native sync reproducible from a clean checkout.
- TestFlight build installs, imports (CSV + JSON + bundle via Files), manages transactions/budgets/groups, renders all ranges, exports + re-imports a backup, survives upgrade without data loss.
- Bottom tabs + sheets + safe areas + dark/light + largest text + VoiceOver pass on a physical phone.
- Assistant hidden until opt-in; hosted BYOK over HTTPS with consent; no harness/localhost paths reachable on native.
- Store listing + privacy label accurate; screenshots synthetic-only; review notes explain offline-first + native integrations.
