# BudgetLens Capacitor Implementation Plan

Status: detailed draft, no code yet. Companion to `docs/ios/plan.md` (strategy) — this doc is the build order.
Revised after subagent review (2026-09-05): backup-restore gap, Keychain premise, subtle crypto, config pinning, CORS ordering, open-in keys, privacy specifics folded in.

## 0. Ground rules

- Web stays shippable at every step. Every native behavior is behind a runtime `isNative()` check with a web fallback. `pnpm dev / build / test / test:browser` must stay green.
- No SwiftUI, no Expo port, no backend, no sync server, no on-device LLM in v1.
- New native surface lives in one adapter module (name TBD, e.g. `src/lib/native.ts`). Features never import Capacitor plugins directly.
- `capacitor.config.ts` is committed. The generated `ios/` project is NOT committed as a whole (see §2.4 for what is committed vs scripted). Only config + adapter + guarded UI branches are committed.
- Synthetic fixtures only in screenshots, TestFlight notes, evals.

## 1. Phase 0 — kill-the-risk spikes (do these before any UI work)

Each spike is a day-or-less experiment on a real device/Simulator. Do not start Phase 1 until all seven answer clean. Decisions are recorded in §12.

### Spike 1: router history + Vite base + lazy chunks + citations + open-in

Load-bearing files: `src/app/router.tsx:57-62`, `vite.config.ts:15-19`, `index.html:14`, `src/features/assistant/citations.ts:86-93`, `src/features/assistant/assistant-panel.tsx:249-259,278`.

Questions to close:
1. What `VITE_BASE` does the Capacitor bundle use so that (a) hashed assets, (b) `lazyRouteComponent` chunks for all 8 routes, (c) `import.meta.env.BASE_URL` citation stripping, and (d) `index.html` entry resolve? Candidates are `/` vs `./`. The current derivation `BASE_URL.replace(/\/$/, "") || "/"` maps `"./"` to `"."` which breaks TanStack Router — the derivation itself needs a native-aware fix, not just a base value.
2. Hash history (likely) vs memory history on native. Memory history kills URL-based deep-link restore after process kill; hash history puts routes after `#` and interacts with citation href construction (`${base}transactions?...`) and the `startsWith(base)` / `slice(base.length - 1)` stripping logic, which breaks for `"./"` and `#` cases. The `show_transactions_view` navigation path must be covered too.
3. "Open in BudgetLens" needs `CFBundleURLTypes` + `CFBundleDocumentTypes` (CSV/JSON + backup bundle UTIs) + `LSSupportsOpeningDocumentsInPlace` + an `App.addListener('appUrlOpen')` handler. List the exact plist keys now — this is the most likely place the "no custom Swift" assumption dies, and it must be known in Phase 0, not Phase 1.
4. Add regression tests: route tree identical in both history modes + citation base-stripping parity in both modes.

Exit criteria: documented base value + history choice + derivation fix design + open-in plist entries + passing parity tests on device.

### Spike 2: hosted-LLM reachability from the Capacitor scheme (raw fetch first)

Files: `src/features/assistant/provider.ts:222-254` (`fetch` to `/chat/completions`).

The plan assumes `requestChatTurn` / `sendToolResults` work unchanged with a new baseURL. Unverified: CORS from the Capacitor scheme (`Origin: capacitor://localhost`) to `api.openai.com` / `openrouter.ai`. Test with a RAW `fetch` POST to both hosts from the real scheme on Simulator + physical device FIRST — before any Keychain exists (the previous version of this spike incorrectly ordered Keychain before the reachability test).

- If CORS passes: keep `fetch`, enforce HTTPS-only programmatically.
- If CORS fails: spec a native HTTP plugin path now (CapacitorHttp/community, bypasses CORS). This adds a plugin + `allowNavigation`/ATS design work and invalidates the "no custom Swift" estimate, so the transport decision must land before Phase 3 is costed.

### Spike 3: storage durability + secure context (`randomUUID` AND `subtle`) + persistence

Files: `src/db/database.ts:14-43` (`budgetlens` DB), `src/features/assistant/thread-store.ts:51-69` (`budgetlens-assistant` DB), `src/db/repositories.ts:18-26`, `src/features/imports/import-service.ts:29-40`, `src/features/imports/parser.ts:148-151`, `src/features/demo/demo-seed.ts:35,42`, `src/features/budgets/budgets-page.tsx:65`, `src/features/charts/chart-workspace.tsx:522`, `src/features/assistant/assistant-panel.tsx:167-169`.

Verify on device:
1. `isSecureContext`, `globalThis.crypto.randomUUID`, AND `crypto.subtle.digest('SHA-256')` in the Capacitor WKWebView. The previous plan scoped only `randomUUID` (only `thread-store.ts:75-85` has a fallback; all other call sites throw). But `repositories.ts:22-26`, `import-service.ts:37-40`, and `parser.ts:148-151` also need `subtle` for fingerprints/`sourceHash` — imports/dedup break even with a UUID polyfill. Decide fail-closed vs polyfill for each, and spread the `thread-store` fallback pattern to every `randomUUID` call site if needed.
2. IndexedDB persistence across restart, iOS update, and low-storage pressure for BOTH Dexie DBs. Request `navigator.storage.persist()` and record whether it is granted. Note the realistic WKWebView quota band (tens of MB to ~1 GB depending on device/free space) and design the low-storage UX now, not at submission.
3. Pin `appId` + `iosScheme` + `hostname` in Capacitor config (proposed: record exact values in §12; presumption is `capacitor://localhost` but it must be written down, not assumed) and forbid future changes — changing any of them orphans all WebView storage (same class of bug as the web origin warning in `README.md:102-118`, now native). Upgrade-retention (install v1, import, install v2, confirm data present) is a release blocker.

### Spike 4: file bridge sizes + backup export AND restore (restore first)

Files: `src/features/imports/import-page.tsx:67,138` (`await file.text()`), `src/features/imports/types.ts:20-25` (10 MB/file, 50 MB total, 100k rows, 20 files), `src/features/imports/parser.ts:51-59,359-370,443` (accepts ONLY `{format:"budgetlens",version:1,...}` or Credit Karma shapes — anything else throws), `src/features/settings/backup.ts:3,27-38` (writes `{format:"budgetlens-backup",version:3,...}`), `src/features/settings/settings-page.tsx:45-62` (Blob + `URL.createObjectURL` + bare `link.click()` with no `appendChild` and immediate `revokeObjectURL`).

Two corrections to the previous plan:
1. **v3 backup has no restore path — on web today, not just native.** `createBackup` writes v3; no `restoreBackup()` exists and the parser rejects v3. The old DoD line "exports + re-imports interchangeably with web" is currently false everywhere. So: implement + test v3 restore FIRST (id remap, duplicate/conflict semantics, budgets/groups/imports handling, v1→v3 migration), then do the Filesystem/Share work. Phase 1 ("core+imports+backup working") is impossible until this lands — phase order in §10 reflects that. Also decouple explicitly: `BACKUP_VERSION = 3` equalling `DATABASE_SCHEMA_VERSION = 3` is coincidence, not a contract.
2. **Export is known-broken in WKWebView** (anchor `download` clicks are ignored) and **import OOM risk is real**: full-file `file.text()` strings plus ~33% base64 inflation over the Filesystem bridge against the 10/50 MB budget will jetsam on old phones. The `ImportFileInput { content: string }` pipeline has no streaming path; PapaParse streaming helps CSV only — `parser.ts` does full-string `JSON.parse`/Papa parse, so JSON bundles have no streaming path at all, and `settings-page.tsx` does a full in-memory `JSON.stringify(null, 2)` on the main thread.

Measure on the oldest supported phone: 10 MB CSV, 20-file multi-select, large bundle restore. Then spec: chunked `readFile`/`writeFile` (or file-URL handoff), `Directory` choice (Documents = user-visible + backed up vs Cache/Data + backup exclusion), Share `url` + cancellation error-code handling, whether native per-file caps must sit below desktop, same-day filename disambiguation (current `budgetlens-backup-YYYY-MM-DD.json` collides on repeat shares), and off-main-thread stringify (worker) for large backups.

### Spike 5: document picker + open-in plumbing (UTIs, multi-select, cancellation)

Verify UTIs (CSV/JSON + backup bundle), multi-select up to 20 via Files + iCloud Drive, per-file failure isolation preserved, picker cancellation mid-batch, and Share-sheet cancellation codes.

Backup interchange decisions (with compat test): default share destination (Files vs iCloud Drive), filename/versioning, legacy CSV/JSON acceptance matrix for picker-restored bundles. Note: picker open-in-place needs NO iCloud entitlement; sync would need `icloud-services` + container and is out of scope — keep the two distinct in review notes.

### Spike 6: keyboard, viewport, toaster, date, footer links, engine floor

Files: `index.html:5` (viewport lacks `viewport-fit=cover` — safe-area insets stay zero without it), `src/app/app.tsx:10-17` (skip link + sonner `bottom-right`, which collides with tab bar/FAB replacement), `src/features/assistant/composer.tsx` (Enter-to-send, no Keyboard-resize/`visualViewport` avoidance), `src/features/assistant/assistant-panel.tsx` (resize drag is desktop-only, bottom-right anchored, `window.innerWidth` math — must be disabled on touch), `src/components/ui/date-picker.tsx` (custom Radix popover — the "native-style date trigger" needs a concrete design, not a bullet), `src/app/app-footer.tsx` (external links need Browser plugin / `allowNavigation` or they open inside the WebView), `src/styles.css:5-63` (all `oklch()` + `100dvh` — needs an explicit iOS floor such as 17/18, not "verify at build time"), Playwright mobile project (Chromium emulation, not WebKit).

Decide: `viewport-fit=cover` + `theme-color` (+ `apple-touch-icon` if the PWA rehearsal in `plan.md` is kept — it was dropped here without rationale and should either be reinstated as a cheap signal or explicitly cut), Keyboard plugin + resize mode, Toaster repositioning on native, sheet focus-trap + skip-link behavior on native, bounce/overscroll tuning, minimum iOS version, and that all WebView-specific testing happens on WebKit/Simulator/device, never just Chromium emulation.

### Spike 7 (new): backup-restore semantics on web (blocks Phase 1)

Implement and test v3 restore on web BEFORE any native file work: id remap strategy, duplicate/conflict policy interaction, budgets/groups/imports-batch semantics, v1→v3 migration path, and the web↔iOS round-trip compat test. Nothing in Phase 1 is "working" until this passes.

## 2. Scaffolding (after spikes)

1. Add Capacitor to the repo: `capacitor.config.ts` committed with FROZEN `appId`, `appName`, `iosScheme`, `hostname` (values recorded in §12; changing them post-TestFlight wipes user data). Add the `@capacitor/*` dependencies to `package.json` (none exist today).
2. Add `pnpm build:ios` script. It reuses `build`'s `tsc -b && vite build` (do not duplicate the typecheck — define CI order once: gates → web build → Capacitor base build → sync) with the Capacitor base from Spike 1, then Capacitor sync. Wire the same gates into CI so config cannot drift.
3. Generate the `ios/` Xcode project once. Commit `capacitor.config.ts` + a scripted native-project patcher (Trapeze or equivalent config script) checked into the repo; do NOT rely on hand-editing `ios/App` and gitignoring the whole tree, because `PrivacyInfo.xcprivacy`, `Info.plist` edits (`NSFaceIDUsageDescription`, `CFBundleURLTypes`, `CFBundleDocumentTypes`, `LSSupportsOpeningDocumentsInPlace`), entitlements, icons, and splash all live under `ios/App` and regen wipes them. The alternative — explicitly committing `ios/App/App/*` — must be chosen now; the old "gitignore ios/ except config/docs" line was incoherent and is retracted.
4. `PrivacyInfo.xcprivacy`: enumerate the Required-Reason APIs actually touched (audit Filesystem timestamps `C617.1`, UserDefaults `CA92.1`, DiskSpace `E174.1`, SystemBootTime `35F9.1` via WebKit/Capacitor + each plugin), set `NSPrivacyTracking=false` with no tracking domains. Verify against Apple's current list + a plugin audit before submission.
5. Icons, splash, bundle ID reservation, signing (automatic for dev, explicit App ID + provisioning for TestFlight/App Store). StatusBar + SplashScreen plugin config ships here.

## 3. Adapter module (the only new abstraction)

One module, web fallbacks for every method, mocked in jsdom tests. Only this module may import Capacitor plugins:

- `isNative()` — runtime check. All UI branches key off this plus responsive breakpoints, never UA sniffing alone.
- `pickImportFiles()` — web: existing file input. Native: document picker result mapped into the existing PapaParse/Zod preview pipeline (same duplicate/conflict review UI). Handles picker cancellation + per-file errors per Spike 5.
- `saveBackup()` / `shareBackup()` — web: existing download (plus the Spike 4 `appendChild`/revoke-timing fix). Native: Filesystem write to the §12-pinned `Directory` + Share sheet with cancellation codes, chunked handoff, and off-thread stringify for large backups.
- `getApiKey()` / `setApiKey()` / `deleteApiKey()` — web: settings blob stays keyless and in-memory-only (see correction below). Native: Keychain-backed secure storage with a FRESH write on first opt-in. There is deliberately NO migration step: the review found the old plan's "split the key out of plaintext localStorage" premise false — `assistant-panel.tsx:337-342` already blanks `apiKey` before persisting and `provider.ts:131-150` reads it back as `""`. Matrix row corrected in §5.
- `haptic(kind)` — no-op on web; light/medium/success on bulk assign, split toggle, save, proposal apply.
- `requestBiometricUnlock()` — Face ID/Touch ID challenge with passcode fallback and a clear off switch. App-level obscuring only; never claim encryption.

Pinned plugin list (exact package + version recorded in §12 before Phase 2): Filesystem, Share, Haptics, App, Keyboard, Browser (provider signup docs — promised in the strategy risk table and missing from the old list), StatusBar, SplashScreen, Dialog ONLY if a flow needs it (custom `<dialog>` already covers `import-page.tsx:641-648` and `chart-workspace.tsx:417-422` — default to not adding it), and ONE secure-storage/biometrics community plugin (no official Capacitor biometrics plugin exists — candidates are community packages; record `kSecAttrAccessible` value, Keychain-sync vs ThisDeviceOnly, biometrics-change/re-enroll invalidation behavior, uninstall-orphan handling, and wipe-on-clear semantics before Phase 2).

## 4. Guarded web edits (small, each with a test)

1. Router (`src/app/router.tsx`): native-aware history selection + basepath derivation fix per Spike 1. Web path byte-identical behavior. Covers the `"./"` → `"."` bug.
2. Shell (`src/app/app-shell.tsx:27-35,92-187`): reuse the `navigation` array but decide membership NOW — 7 tabs do not fit; default to 5 + More (record labels/icons/a11y in §12). Sidebar on `lg` web, tab bar on native/small viewport. Assistant FAB becomes a tab or sheet handle on native; footer condensed or hidden with external links routed to Browser plugin; skip link and Toaster position adapt per Spike 6.
3. Styles (`src/styles.css`): additive safe-area insets, `dvh` sheet heights, coarse-pointer hover removal, overscroll tuning. No token changes. iOS floor pinned per Spike 6.
4. Assistant gating (§6): preset filter + code-path gates + error-copy rewrite (not just hiding presets) + stored-settings force-reset.
5. Crypto hardening per Spike 3: `randomUUID` fallback spread + `subtle` fail-closed/polyfill decision. Imports, budgets, demo seed, charts, and assistant IDs all depend on this.
6. dnd-kit touch (`src/features/charts/chart-workspace.tsx:486-489`, `src/features/dashboard/customization/sortable-dashboard.tsx:169-172`): both use `PointerSensor(distance 6)` + keyboard only with a `touch-none` grip that hijacks touch-scroll. Up/down buttons ALREADY exist (`chart-workspace.tsx:311-330`, `sortable-dashboard.tsx:90-109`), so "button controls on native v1" is nearly free — state it as the decision. Additionally: explicitly disable the pointer-drag grip on coarse pointers (or add `TouchSensor` with delay/press handling) plus a scroll-conflict test. Revisit true touch-drag later.

## 5. Storage, backup, wipe matrix (must be exact)

Two Dexie DBs plus scattered localStorage keys exist. The wipe/backup spec covers all of them, not just finance tables. Correction from review: the API-key row previously claimed a localStorage→Keychain migration; there is none (see §3).

| Data | Lives in | Backed up? | Wiped by "clear data"? |
|---|---|---|---|
| Transactions, wealth, breakdown, accounts, imports, budgets, groups | `budgetlens` DB (`src/db/database.ts`, `backup.ts:createBackup`) | Yes (v3 bundle, once Spike 7 restore lands) | Yes (`clearAllData`) |
| Assistant threads + messages | `budgetlens-assistant` DB (`thread-store.ts:51-69`) | No — document as lost on reinstall OR extend format (decide before Phase 1) | Must be added to clear |
| Theme, sidebar/assistant-open/layout prefs, chart configs, dashboard customization, model recents (`model-select.tsx:67`), feedback (`assistant-panel.tsx:99`), layout (`:102`) | `localStorage` `budgetlens.*` keys (`theme-provider`, `app-shell.tsx:37,53-59`, `assistant-panel.tsx:98-102`, `chart-workspace`, `editable-chart-renderer`, `model-select`) | No — document as device-local OR namespace and include | Must be added to clear |
| Hosted API key | Web: in-memory only (blanked on persist). Native: Keychain (fresh write, §3) | Never | Web: nothing stored. Native: delete Keychain entry |

Also: `ensureDemoData()` auto-seeds the golden bundle on first launch (`src/features/demo/demo-seed.ts`, called from `app-shell.tsx:85-87`). A reviewer seeing unexplained demo data reads it as fake functionality — keep the demo banner + obvious reset path, label demo data in TestFlight notes (noting `VITE_DISABLE_DEMO_DATA` is test-only), and keep screenshots synthetic-only.

Data Protection entitlement is encryption-at-rest hardening, not a durability fix — do not present it as eviction mitigation (the old plan's risk table blurred this; corrected here). Schedule the entitlement LEVEL choice in §2. Durability comes from Spike 3 pinning + `persist()` + first-class manual backup/restore. Document uninstall-wipes-everything, iPhone-Storage-offload behavior, and manual-backup-only risk honestly.

## 6. Assistant lockdown on native

1. Hide on native: `opencode-harness`, `opencode-bridge`, `ollama`, `lmstudio`, any non-HTTPS custom URL. Default native fresh install to `openrouter` with empty key + explicit opt-in (note: `readAssistantSettings` falls back to `opencode-bridge` today — needs a native-default override AND a force-reset for stored web settings carrying custom `http://`/`localhost` URLs, e.g. `custom` default `http://localhost:4000/v1`).
2. Gate the code paths, not just the presets: `fetch("/api/models")` and `fetch("/api/chat")` in `assistant-panel.tsx:357,561,610` plus the `pnpm dev` / `--cors` error copy (`:1411-1412`) must be unreachable on native and replaced with offline/airplane messaging.
3. Keys: NO migration (see §3/§5). Web stays in-memory-only; native writes fresh to Keychain. Enforce HTTPS + programmatically block `http://`/`localhost` custom URLs (users can type anything today). Wipe deletes the Keychain entry.
4. Consent screen before first hosted call, split by transport (the old plan's single "up to 40 budgets/netWorth" line matched neither path — corrected here):
   - Snapshot builder (harness-shaped reference): budgets slice 30, netWorth slice 24, top 25 / recent 100 transaction rows, 60-char description truncation, 20 category buckets, extremes, `transactionCount`, `previousSpending` double-send where present (`data-tools.ts:5-11,216,292-300,407,518-519,578,600,688,703`, harness zod caps).
   - Hosted live tools (what iOS actually calls): `budget_status` uncapped, `spending_by_category` 20 buckets, `search_transactions` 50 rows, 8k-char tool-output slices per message, ≤4 tool calls per turn, last-10 history window (`data-tools.ts:5`, `provider.ts:304-307`, `assistant-panel.tsx:666`).
   Threads persist in plaintext IndexedDB; Face ID is obscuring-only. Quote the hosted numbers on the consent screen.
5. Keep proposal-approval UX (`ProposalCard`: budget/recategorize apply only on tap), existing `AbortController` patterns (including abort-on-sheet-dismiss), `MAX_BODY_BYTES` thinking on any future relay.
6. Evals stay dev-only (`pnpm eval:assistant` needs `pnpm dev` + `opencode serve`). Any hosted smoke eval uses synthetic fixtures only with cost/rate-limit notes.
7. Deferred: key-holding relay (avoids BYOK friction at the cost of a server), Apple Foundation Models fallback (snapshot Q&A only — tool-calling too limited for agent actions).

## 7. UX pass (scoped to fit estimates)

`plan.md` Phase 2 as written (tabs + large titles + swipe-back + sheets + 44pt + swipe-to-edit + pull-to-refresh + segmented ranges + native date + long-press + skeletons + optimistic UI + Dynamic Type + VoiceOver on charts) is not "days" — VoiceOver on Recharts SVGs and largest-text layouts alone are fiddly. Scope v1 to:

- Must: 5+More tab bar (§4.2), sheets, safe areas, 44pt targets, segmented ranges, readable charts with tap-to-inspect fallback (Recharts Tooltip is mouse-centric), virtualized transaction list (new dep — none in `package.json` today; add `@tanstack/virtual` or equivalent), point decimation for multi-year ranges where aggregates stay exact, dark/light follows system with manual override, Composer keyboard avoidance, native date-trigger design (§Spike 6).
- Nice: swipe-to-edit, pull-to-refresh, skeletons, haptics everywhere, long-press menus.
- Accessibility floor: tab bar/sheets labeled (reuse existing aria patterns), largest Dynamic Type does not break layouts, VoiceOver passes on navigation + sheets; full chart-SVG narration deferred with a data-table alternative. iPad/split layout is test-only in v1 (no dedicated layout).

## 8. Privacy, signing, submission

- Core listing: no account, no analytics, no tracking, no ads (matches `README.md:7-8`). Set `NSPrivacyTracking=false` with no tracking domains; `PrivacyInfo.xcprivacy` audited per §2.4.
- Nutrition label: do NOT claim "data not collected" while the app initiates hosted inference carrying finance aggregates to third parties. Draft the precise wording before submission: Financial Info / Identifiers / Usage Data as applicable, per-provider (OpenRouter/OpenAI/custom) privacy links, plus Keychain/Files disclosures. Keep consent + censored logging (never keys or snapshot contents).
- Category Finance, age rating, support URL, demo video/screenshots synthetic-only, TestFlight notes label demo data.
- Rejection pre-emption beyond the "just a website" defense (offline-first + Files/Share/Haptics/Biometrics/Keychain): Guideline 4.2 (minimum functionality — offline core must satisfy it with assistant disabled), 5.1.1 (consent + per-provider links), BYOK external-purchase confusion (state no IAP in v1), demo-data labeling.
- Ban non-HTTPS assistant endpoints on native outright — no `NSBonjourServices`/local-network exception in v1.

## 9. Testing

- Existing gates stay green: `format:check`, `lint`, `typecheck`, `test`, `test:coverage`, `build`, `test:browser`. Add a separate WebKit project (`playwright install webkit`; today's iPhone project is Chromium emulation overriding the iPhone 13 descriptor) plus a Capacitor-served (synced bundle on device/Simulator) leg for anything WebView-specific.
- New unit tests (adapter mocked): history selection, route-tree parity, citation parity, preset filtering native-vs-web, stored-settings force-reset, key routing Keychain-vs-in-memory (no migration test — the migration does not exist), backup v3 restore + round-trip web↔iOS, share/picker cancellation codes, biometric-off fallback, `randomUUID` + `subtle` behavior, wipe matrix coverage for both DBs + all `budgetlens.*` keys + Keychain.
- Device matrix (physical phones, oldest supported first): fresh install, upgrade retention (blocker), Files + iCloud import (CSV, legacy CSV, 20x JSON, v1 + v3 bundles), backup export + re-import interchange with web, Face ID on/off + re-enroll, dark/light, largest text, VoiceOver on tabs/sheets, airplane mode (core works, assistant explains), low-storage path, picker cancellation, Share cancellation, kill/background restore per the Spike 1 history choice, cold-start/perf on oldest phone, abort-on-dismiss.
- Backup compat test: v1 and v3 bundles restore across web ↔ iOS both directions (blocked on Spike 7).

## 10. Rollout (reordered: restore and shell precede TestFlight)

- Phase 0: spikes above, including Spike 7 (v3 restore on web). Blockers resolved, decisions recorded in §12.
- Phase 1: restore + shell + parity. v3 restore lands on web first; then config, `build:ios`, WebView loads bundle, router/base fix, adapter skeleton. Tab bar + sheets land BEFORE internal TestFlight (testers should not validate a desktop shell in a WebView). No assistant on native yet; core + imports + backup working.
- Phase 2: feel + safety. Touch, safe areas, haptics, virtualization, chart tuning, Face ID, Keychain settings, wipe matrix, demo-data labeling.
- Phase 3: hosted assistant opt-in. Preset/code gates, stored-settings reset, BYOK + consent, HTTPS-only, abort/offline states, smoke eval. Transport decision from Spike 2 determines whether a native-HTTP plugin is in scope.
- Phase 4: hardening + submission. Perf pass on oldest phone, a11y pass, privacy label, listing, external TestFlight, submit.

## 11. Definition of done

- `pnpm dev/build/test/test:browser` green (incl. new WebKit leg); `build:ios` reproducible from clean checkout; CI runs gates before every native sync with the §2 order (no duplicated typecheck).
- v3 restore works on web; TestFlight build installs, imports via Files (CSV, legacy CSV, 20x JSON, v1 + v3 bundles), manages all entities, renders all ranges, exports + re-imports backup interchangeably with web, survives upgrade without re-import.
- Physical-phone pass: tabs, sheets, safe areas, dark/light, largest text, VoiceOver on nav/sheets, airplane mode, picker/share cancellation, kill/restore.
- Assistant hidden until opt-in; hosted BYOK over HTTPS with accurate per-transport consent; harness/localhost unreachable on native; no stored plaintext keys anywhere; Keychain wiped on clear.
- Listing + label accurate (no "data not collected" while hosted inference exists); screenshots/notes synthetic-only with demo data labeled; review notes cover offline-first + native integrations + no-IAP + Guidelines 4.2/5.1.1.
- This doc updated with every Spike 0–7 decision (§12).

## 12. Decision log (fill during Phase 0 — do not start Phase 1 with blanks)

- Spike 1: `VITE_BASE` value. History choice (hash vs memory). `basepath` derivation fix. Open-in plist keys (`CFBundleURLTypes`, `CFBundleDocumentTypes`, UTIs, `LSSupportsOpeningDocumentsInPlace`) + `appUrlOpen` handler design. Parity tests passing.
- Spike 2: raw-`fetch` CORS result per provider (Simulator + device). Transport: `fetch` vs native HTTP plugin. "No custom Swift" confirmed or retracted.
- Spike 3: `isSecureContext` / `randomUUID` / `subtle` results. Fallback/polyfill design. `persist()` granted? `appId` + `iosScheme` + `hostname` frozen values. Quota band + low-storage UX.
- Spike 4: `Directory` choice. Chunked handoff design. Native caps (same or below desktop?). Filename disambiguation. Worker stringify plan.
- Spike 5: picker UTIs + 20-file behavior + cancellation codes confirmed.
- Spike 6: `viewport-fit`, `theme-color`, Toaster position, Keyboard resize mode, date-trigger design, footer-link handling, iOS floor (e.g. 17/18 for `oklch`/`dvh`).
- Spike 7: v3 restore semantics (id remap, conflicts, budgets/groups/imports, v1 migration) + round-trip test green.
- §2–§3 pins: exact plugin packages + versions, `kSecAttrAccessible`, sync vs ThisDeviceOnly, re-enroll + uninstall + wipe semantics, `PrivacyInfo` API reasons, tab membership (5+More), nutrition-label wording.
