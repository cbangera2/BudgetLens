# BudgetLens Desktop Plan

Status: draft for review (no code yet). Reviewed 2026-09-06 — P0 holes fixed.
Goal: ship BudgetLens as a one-click desktop download with silent auto-update from GitHub Releases, keeping the local-first guarantees and the direct-provider assistant (Option 1). No assistant sidecar, no backend server.

## 1. Context: what BudgetLens is today

- Static Vite + React 19 + TypeScript app (`package.json:1-15`). `pnpm build` emits static assets; no app server, no auth, no database service. Snapshot Sep 2026 (will rot — re-measure before sizing work): `pnpm build` ~2.2s, `dist/` ~1.4MB, 116 `src` files, `node_modules` ~272MB.
- Client routing via TanStack Router, browser history, base path synced with Vite base (`src/app/router.tsx:57-62`, `vite.config.ts:15-19`). 8 routes under one `AppShell` (`src/app/router.tsx:12-53`; nav array `src/app/app-shell.tsx:27-35` has 7 entries — Group detail has no nav item): Overview, Net worth, Transactions, Groups, Group detail, Budgets, Imports, Settings.
- Shell is desktop-first: sticky header, collapsible sidebar nav, footer, floating assistant FAB/panel (`src/app/app-shell.tsx:92-187`).
- Persistence is local-first via Dexie/IndexedDB, schema v3, 7 tables (`src/db/database.ts:14-43`). Repositories abstract access (`src/db/repositories.ts`, `src/domain/repositories.ts`).
- Imports/exports are pure client parsing: PapaParse + Zod, multi-file preview, duplicate skip, per-file failure isolation, JSON bundle backup, destructive-action confirmations (`README.md:15-37`, `src/features/imports/`).
- Charts are Recharts 3 + shadcn composition (`README.md:~144-152`). Drag reorder via dnd-kit (`package.json:22-24`).
- Styling is Tailwind v4 + CSS variables with `.dark` variant (`src/styles.css:1-63`).
- Assistant has two transports (`src/features/assistant/provider.ts:25-82`, `src/features/assistant/assistant-panel.tsx`, `server/assistant-harness.ts`):
  - (a) `opencode-harness`: browser `POST /api/chat` to a Vite-dev-only middleware (`server/assistant-harness.ts:530-574`) which drives local `opencode serve` (`OPENCODE_BASE_URL`, default `http://127.0.0.1:4096`) using `@tanstack/ai` + `@tanstack/ai-opencode` + local-process sandbox. Explicitly dev-only; never in the static build (`provider.ts:32`: "never works from the static Pages build").
  - (b) Direct OpenAI-compatible providers: `opencode-bridge` (`http://127.0.0.1:11435/v1`), `ollama` (`http://localhost:11434/v1`), `lmstudio` (`http://localhost:1234/v1`), `openrouter`, `openai`, `custom`. Browser `fetch` to `/chat/completions`, tools executed locally against Dexie (`src/features/assistant/data-tools.ts`, `src/features/assistant/provider.ts:256-319`). Tool rows capped (`MAX_TOOL_ROWS = 50`), finance snapshot is aggregates-only.
- Key hygiene today is good and is a hard constraint going forward: API keys stay in memory only, never persisted (`src/features/assistant/assistant-panel.tsx:337-342`). Settings (provider/baseURL/model, no key) persist in `localStorage` (`ASSISTANT_SETTINGS_KEY`). Remembered keys in the binary live in OS keychain + RAM only — never `localStorage`/`store.json`/exports/logs. The web fallback `defaultSettingsFor("opencode-bridge")` stays; the binary defaults to `ollama` at a runtime-gated settings layer, not by changing the global default.
- Quality gates: `pnpm format:check`, `lint`, `typecheck`, `test`, `test:browser` (desktop Chromium + iPhone-sized viewport), `build` (`README.md:~120-130`).
- Deploy today: GitHub Pages static (`.github/workflows/deploy.yml`), `VITE_BASE=/BudgetLens/` when `GITHUB_ACTIONS=true` (`vite.config.ts:16`).

Implication: the only portable-to-desktop parts without a server are the static bundle + Dexie + direct-provider assistant path (b). The harness path (a) stays dev-only. No code changes ship with this plan.

## 2. Decision: Tauri 2 wrapper + direct-provider assistant (Option 1)

### Chosen: Tauri 2 (stable) around the existing Vite build

How it works, conceptually:

1. Keep developing the web app exactly as today.
2. Add `src-tauri/` (Rust shell + `tauri.conf.json` + `capabilities/`). Its web root points at the Vite production output (`frontendDist: ../dist`, `devUrl: http://localhost:5173`, `beforeBuildCommand: pnpm build`).
3. Tauri bundles a per-OS binary (research estimate ~5-15MB typical, verify on first build) hosting the WebView: WKWebView (macOS), WebView2 (Windows 10/11 — see §4.3 bootstrapper note). No bundled Chromium. No Linux WebView in v1.
4. Ship via GitHub Releases with `tauri-action`: `.dmg` (manual) + `.app.tar.gz` (updater) on mac, NSIS `-setup.exe` (manual + updater) on Windows, plus `latest.json` manifest. No `.deb`/`.AppImage` in v1.
5. App checks `latest.json` on launch + Settings "Check for Updates", verifies minisign signature, installs, relaunches. GitHub Releases _is_ the update server.
6. Web code detects "running in Tauri" at runtime via `isTauri()` from `@tauri-apps/api/core` (async) with sync `!!window.__TAURI_INTERNALS__` fallback — NOT the v1 `window.__TAURI__` global (removed in v2, always false). Gate desktop behaviors (hash history, Rust proxy, keychain, updater UI) on it; add `src/lib/isTauri.ts` + unit test mocking both paths. Web behavior when absent, so GitHub Pages is unaffected. Mirror the iOS adapter pattern: features never import Tauri APIs directly — go through `llmClient`/`desktop` adapters so web tests stay green.

Why Tauri 2 over the alternatives (researched Sep 2026, estimates — don't gate on exact numbers):

- Wails v2 is stable but maintenance-only; v3 is beta with a brand-new updater. Auto-update + keychain would be hand-rolled or beta. Community smaller than Tauri's. Pick Wails only if the team already loves Go and tolerates beta churn. Go builds are faster, but that is the only win.
- Electron gives bundled Chromium (identical rendering, no CORS proxy needed) + mature updater — but an order of magnitude larger download. Revisit if WebKitGTK gaps block Linux.
- Capacitor desktop has no first-party story (community Electron/Tauri bridges). Capacitor is the right _mobile_ shell (see `docs/ios/plan.md`), not the desktop shell.
- Single-file localhost server (`bun compile` / Node SEA): easiest build, but no dock icon, no installer, no WebView persistence story, updater is hand-rolled. Deferred as a fallback if WebView blockers appear.
- PWA/service-worker: zero work, but no dock presence, weaker persistence guarantees, no Keychain. Worth doing as a rehearsal (manifest + icons), not the deliverable.

Reference OSS running this exact shape: Jan (local/cloud LLM chat, closest to our assistant), Hoppscotch (Rust HTTP to bypass CORS), GitButler, Cap, Spacedrive.

### Non-goals for v1

- No assistant sidecar, no bundled `opencode serve`, no prod `/api/chat` server. Harness stays `pnpm dev`-only. Note: `tauri dev` DOES run Vite `configureServer`, so the harness probe succeeding under `tauri dev` is fine and expected — the gate is for the packaged binary only.
- No bundled Ollama weights or engine. Require separate `ollama serve` + `ollama pull`; detect and guide.
- No on-device LLM bundled in the installer.
- No IndexedDB-to-SQLite migration. Dexie stays; request `navigator.storage.persist()`, check the result, nudge JSON backup when not granted; keep JSON backup/restore.
- No mobile shipping in this plan. Mobile is a second shell (Capacitor per `docs/ios/plan.md`), reusing the same `dist/`. Intentional divergence: desktop defaults to `ollama` (localhost reachable), iOS hides localhost presets and defaults to hosted — document both.
- No universal macOS binary and no Intel leg. Ship Apple Silicon only (owner call 2026-09-06): one `.dmg`, cleaner matrix.
- No Linux binary in v1 (owner call 2026-09-06: Linux users out of scope). Ship mac + Windows only; Linux deferred to later (baseline when revived: `ubuntu-22.04` + WebKitGTK 4.1). No Linux QA, no `.deb`/`.AppImage` in v1 `latest.json`.
- No paid signing in v1. Ship unsigned with documented Gatekeeper/SmartScreen bypass; add signing in v1.1 (see §9).
- No file-association handling in v1 (opening a CSV with the app does not import it — explicitly deferred). Single-instance is implemented: a second launch focuses the running window. Window floor: `title`, `minWidth` ~1024 for the sidebar shell.

## 3. Architecture

```
BudgetLens repo
├── src/
│   ├── lib/isTauri.ts          # NEW: isTauri() + sync fallback + tests
│   ├── lib/llmClient.ts        # NEW: LLM transport abstraction (web fetch vs Rust proxy)
│   └── ...                     # unchanged web app (React, Dexie, providers)
├── dist/                       # vite build output (frontendDist)
├── src-tauri/
│   ├── Cargo.toml              # tauri + plugins: updater, store, dialog, process, opener (+ http ONLY if fallback chosen, see §3.1)
│   ├── Cargo.lock              # COMMITTED, audited (cargo audit/deny in release.yml)
│   ├── tauri.conf.json         # identifier (never change), version sync, bundle, updater, CSP, windows
│   ├── capabilities/
│   │   └── default.json        # window label "main" + scoped per-plugin permissions (deny by default)
│   ├── icons/                  # COMMITTED, generated via `tauri icon` from 1024x1024 source (alpha OK on desktop)
│   └── src/
│       └── lib.rs              # primary: keyring get/set/delete + llm proxy (reqwest). No fs read needed for v1.
├── .github/workflows/
│   ├── ci.yml                  # unchanged (PR fast path)
│   ├── deploy.yml              # unchanged (Pages)
│   └── release.yml             # NEW: app-v* tag-triggered desktop matrix
└── docs/desktop/plan.md        # this file
```

### 3.1 Tauri config (no code yet, values to use)

Phase-1 checklist (all required before first `tauri build`):

- `identifier`: reverse-DNS (e.g. `com.<owner>.budgetlens`) — reserve NOW, never change. It is the macOS/Keychain/Windows-AppUserModelID/updater identity; changing it orphans keychain entries and breaks update continuity.
- Version sync (manual step before every tag): `package.json` ↔ `tauri.conf.json:version` ↔ `Cargo.toml:version` ↔ `app-v*` tag. With tag `app-v1.0.0`, `app-v__VERSION__` → `1.0.0`.
- `bundle.category`: `"Finance"`. `bundle.targets`: `"all"` (yields mac `.dmg`+`.app.tar.gz`, Windows NSIS `-setup.exe`, Linux `.deb`+`.AppImage`).
- `app.windows[0].label`: `"main"`, matching `capabilities/default.json: {"windows": ["main"]}`.
- `app.windows[]`: pin `useHttpsScheme: false` (default). The main document URL in Tauri 2 is `http://tauri.localhost` (or `https://` if flipped) — NOT `asset://` (`asset://` is the `convertFileSrc` asset protocol). IDB/`localStorage` are origin-bound: never flip the scheme between releases or it looks like data loss. Write OLLAMA_ORIGINS/CSP copy around `http://tauri.localhost`.
- `build.beforeDevCommand`: `pnpm dev`, `devUrl`: `http://localhost:5173`. `vite.config.ts` needs `server: { port: 5173, strictPort: true }` (host default; `TAURI_DEV_HOST` only for LAN testing).
- `build.beforeBuildCommand`: `pnpm build`, `frontendDist`: `../dist`. Do NOT double-build frontend in CI.
- `bundle.createUpdaterArtifacts`: `true` (not `v1Compatible`).
- `plugins.updater`: `pubkey` = contents of `.key.pub`; `endpoints`: `["https://github.com/cbangera2/BudgetLens/releases/latest/download/latest.json"]`; `windows.installMode`: `passive`.
- `bundle.windows.webview2InstallMode`: embed bootstrapper or offline installer — "preinstalled on 10/11" fails on LTSC/offline/fresh images; set explicitly or document the failure copy.
- Capabilities (`src-tauri/capabilities/default.json`): `{"identifier": "main-cap", "windows": ["main"], "permissions": [...]}`. Decision: **Rust `reqwest` proxy is primary → zero HTTP allowlist needed** (strictly better: no Origin, full header control, key never in JS). Only if the `plugin-http` fallback is chosen, scope explicitly per installed `@tauri-apps/plugin-http` v2 docs (roughly `http:allow-fetch` with per-URL `allow: [{url}]` — verify with `pnpm dlx @tauri-apps/cli@2 info`; the opaque `http:default`-with-URLs sketch does not compile). Scope `process` to allow-relaunch/restart only (not full `process:default`). Needed: `updater` (scoped), `process` (relaunch only), `dialog` (open/save), `store` (non-secret prefs/model cache only), `opener`. NO `fs` permission in v1 (see §3.4), NO `shell` exec.
- `app.security.csp` (prod) vs `app.security.devCsp` (HMR WS — looser). Rust-proxy path keeps prod `connect-src` to `'self' ipc: http://ipc.localhost` only. Resolve the old contradiction in favor of proxy-needs-none.
- Icons: `tauri icon app-icon.png` from 1024×1024. Commit `icons/`. `target/` + `dist/` stay gitignored.
- npm scripts (add for reproducibility, keep `ci.yml` untouched): `tauri`, `tauri:dev`, `tauri:build`, `build:desktop` (`VITE_BASE=/ tsc -b && vite build`).

### 3.2 Router + base path (required change, small)

- Today: browser history + `basepath` synced to `import.meta.env.BASE_URL` (`src/app/router.tsx:57-62`), Vite `base` = `/BudgetLens/` on Pages CI.
- Desktop binary has no history fallback. Rule (same as iOS plan): **desktop = hash history now**; leave iOS's hash-vs-memory question to that plan.
- Implementation: in `src/app/router.tsx`, `import { createHashHistory } from "@tanstack/react-router"`, pass `history: isTauriSync() ? createHashHistory() : createHistory()` to `createRouter`, force `basepath="/"` under Tauri. Gate on the §2 runtime check, not a build flag, so one `dist/` serves both. Regression test: same route tree builds in both modes.
- Harness probes (`assistant-panel.tsx:352-369` `/api/models`, and `/api/chat` send) must be gated to non-Tauri packaged builds only — under `http://tauri.localhost` the relative fetch resolves against the custom scheme and hangs until the 6s abort on every launch when the harness preset is selected.
- Release workflow must force `VITE_BASE=/` for desktop (Pages uses `/BudgetLens/`). GitHub runners always set `GITHUB_ACTIONS=true`, so `beforeBuildCommand: pnpm build` WILL leak the Pages base into `dist/index.html` (`src="/BudgetLens/assets/…"`) without the override → blank window on both artifacts. Keep `env: VITE_BASE=/` in `release.yml` AND add a post-build assertion: `grep -q '/BudgetLens/' dist/index.html && exit 1`.

### 3.3 Assistant: direct-provider path in the binary

Keep the exact provider model (`provider.ts:25-82`) and tool loop (`requestChatTurn` → local Dexie tools → `sendToolResults`). Changes are transport + secrets only. Decision: **Rust proxy primary, `plugin-http` fallback only**.

1. **Stop using `window.fetch` for LLM calls in Tauri.** WebView origin `http://tauri.localhost` triggers CORS preflight; Ollama rejects unknown origins (403 unless `OLLAMA_ORIGINS` includes it); `HTTP-Referer`/`User-Agent` are forbidden headers in webviews.
   - Primary: Rust `#[tauri::command]` proxy with `reqwest` (no Origin, full header/streaming control via Channel, key never enters JS). Frontend keeps `llmClient.ts`; swap implementation by runtime. Needs zero HTTP allowlist.
   - Fallback only: `@tauri-apps/plugin-http` `fetch` with explicitly scoped allowlist (see §3.1).
   - Do NOT adopt `cors-fetch` monkey-patches (fragile).
   - SSRF/timeout contract for the Rust command (required): enforce request timeouts, keep TLS verification on, cap body size, block cloud-metadata/link-local targets for `custom` baseURLs (`169.254.169.254/`, `fd00::/8`, etc.) or require the §3.1 explicit-confirm step; `custom http://` gets a mixed-content-equivalent warning; never log key/headers; zeroize key memory.
2. **OpenRouter attribution (missing today):** add `HTTP-Referer: https://github.com/cbangera2/BudgetLens` + `X-Title: BudgetLens` in the Rust layer. Trivial in a Rust command; needs `unsafe-headers` feature if the `plugin-http` fallback is used.
3. **Keys: remember-me ON by default (owner call 2026-09-06), OS keychain.**
   - Web keeps today's behavior (memory only, re-enter per session).
   - Desktop persists to OS keychain by default with explicit first-run copy ("Stored in macOS Keychain / Windows Credential Manager") + always-visible `[Forget]` / opt-out toggle that deletes the secret and reverts to memory-only. Primary: DIY Rust `keyring` crate commands (`get_secret`/`set_secret`/`delete_secret`) — no official Tauri 2 keychain plugin ships; verify any third-party `keyring-store`/`secure-storage` name against crates.io before pinning, and treat the DIY path as canonical. Do NOT use `tauri-plugin-store` (plaintext JSON) for keys; do NOT start on `stronghold` (deprecation status unverified — confirm or drop; DIY avoids the question).
   - UI shows `Connected · sk-…4f2a [Forget]`, never the value. Never log keys, never include in settings export/telemetry. Linux deferred in v1, so no secret-daemon fallback needed yet (when Linux returns: refuse to store with `gnome-keyring`/`kwallet` install hint rather than cleartext).
4. **Model listing for direct providers (missing today — only harness has `/api/models`):** per-provider semantics, not one generic call:
   - Universal probe `GET {baseURL}/v1/models` (OpenAI shape `{data:[{id}]}`) for Ollama/LM Studio/OpenRouter/hosted; Ollama emptiness via native `GET /api/tags`; expect 401/404/empty-`data` from private BYOK gateways.
   - Cache only non-secret IDs in `plugin-store` (TTL 1-24h, stale-while-revalidate) + manual Refresh. Always offer `Custom…` free-text. Persist `lastUsedModel` per provider. `Test key`: green `n models`; 401 = invalid (don't save); network error ≠ invalid key (different copy).
5. **Localhost discovery + setup hints:**
   - Probe in parallel with 2.5s `AbortController` timeout (Rust side once proxy exists): `GET /v1/models` on `11434` (Ollama), `1234` (LM Studio), plus `opencode-bridge` `127.0.0.1:11435` if enabled. Cache working baseURL + provider type.
   - First-run "doctor": not reachable → `Install Ollama` link (`ollama.com/download`) + copy-paste install command; reachable but `GET /api/tags` empty → hint `ollama pull qwen2.5:7b` / `llama3.1:8b`. Suggest tool-capable small models only: `qwen2.5:7b`, `llama3.1:8b`, `mistral-nemo:12b`, `qwen3:8b`. `gpt-oss:20b` only with a RAM caveat (~16GB+ — don't list alongside 7-8B without the note). Avoid non-tool models (`mistral:latest`, `gemma2:2b`, R1 distills without template override).
   - CORS copy is fallback only (proxy is default, needs no setup): if direct-fetch 403, show `Run: OLLAMA_ORIGINS=http://tauri.localhost ollama serve and retry`. LM Studio: `Developer → Server → Enable CORS + Start Server`. `https→http` mixed-content note applies to Pages web only, not the binary.
6. **Tool-call body compat (local models often lie):** send minimal body first (`tools` + `tool_choice:auto` only); `parallel_tool_calls:false`. On 400/unsupported/no `tool_calls` in response, retry same messages without `tools` as plain completion, then regex-parse fallback or ReAct-JSON prompt. Cap 4 tool calls/turn (today's loop already caps), never crash the agent loop. Needs a matrix test (Ollama/LM Studio/bridge), not just code. Capability-gate via allowlist or `GET /api/show` where available.
7. **Privacy UX:** per-request badge `Local: qwen2.5:7b` vs `Cloud: gpt-5-mini`; hosted requires explicit opt-in `Data leaves this machine`. Harness preset stays visible but disabled outside `pnpm dev` via the existing `harnessAvailable` check.

### 3.4 Persistence + files in the binary (v1: zero new fs permissions)

- Dexie/IndexedDB works unchanged in WebViews and survives updates (wiped on uninstall). Request `navigator.storage.persist()`, check the boolean result, nudge JSON backup when not granted. Quota on WKWebView/WebKitGTK is pressure-evictable — treat spot figures as estimates, not guarantees. Dexie v3 schema stays — no migration. Keep the existing Settings JSON backup/restore as the supported migration path (browser profile → desktop → back); origins differ so IDB never auto-migrates.
- File imports v1: **keep the existing `<input type=file>`** — zero `fs` permissions needed, PapaParse+Zod unchanged. Do NOT ship the hybrid "`dialog.open` paths read by JS" (paths are unreadable without an `fs` grant). `dialog.open` + scoped `fs:allow-read-file` (or a Rust `read_csv_file` command) and `dialog.save` + write are Phase-2 options with explicit permissions. `opener` covers "show in folder". Validate MIME/extension/size before parse; existing per-file isolation + duplicate-skip unchanged.
- Origin stability is a release blocker: `useHttpsScheme: false` pinned (§3.1); never flip scheme/origin between releases.

## 4. Release engineering

### 4.1 New workflow: `release.yml` (tag-triggered, NOT on every PR)

- Trigger: **unified to `app-v*` everywhere**: `push: tags: ["app-v*"]`, `tagName: app-v__VERSION__` (so `app-v1.0.0` → version `1.0.0`). PRs keep today's fast `ci.yml`; desktop never slows PRs. Reserve the pattern in Phase 0.
- Permissions: workflow `contents: read`, `contents: write` on the build job only (else `Resource not accessible` on upload).
- Matrix (`fail-fast: false`, v1 = Apple-Silicon mac + Windows only; Intel + Linux deferred):
  - `macos-latest --target aarch64-apple-darwin`
  - `windows-latest`
- Steps per leg: checkout (pinned SHA, like existing workflows) → `pnpm/action-setup` (pinned, `run_install: false`, respects `packageManager: pnpm@11.15.1`) → `setup-node` (**Node 24** to match `ci.yml`/`deploy.yml`, `cache: pnpm`) → `pnpm install --frozen-lockfile` → Rust toolchain (**pinned version**, not floating `stable`, with mac targets) → `rust-cache` (pinned SHA, `workspaces: ./src-tauri -> target`) → `tauri-action` (pinned SHA, v1 line) with `tagName: app-v__VERSION__`, `releaseDraft: true`, `includeUpdaterJson: true` (NOT `uploadUpdaterJson`), `args: ${{ matrix.args }}`. Prerelease/beta legs use `prerelease: true` + `includeUpdaterJson: false` so betas never clobber `latest.json`.
- Env: `GITHUB_TOKEN`, `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (if the key has one), `VITE_BASE=/`, plus the §3.2 post-build assertion (`grep -q '/BudgetLens/' dist/index.html && exit 1`).
- Post-matrix validation job (required, fails the workflow instead of shipping silently): `jq` assert `version == tag`, `pub_date` ISO8601, `platforms` contains both v1 entries (`darwin-aarch64`, `windows-x86_64`), every URL + `.sig` exists (HEAD 200).
- Commit `Cargo.lock`; run `cargo audit`/`cargo deny` in `release.yml`.
- Keep Pages `deploy.yml` untouched. Desktop (`app-v*`) and Pages (branch push) never share a tag that overwrites `latest.json` with a non-updater release. Publish the draft only after ALL legs green; `latest.json` must list every arch or that arch gets no update.
- Rollback runbook: never mutate a published `latest.json` in place; roll forward with an `app-vN+1` hotfix; `allowDowngrades` stays off.

### 4.2 Signing keys (do once, guard forever)

- Generate: `cargo tauri signer generate -w ~/.tauri/budgetlens.key` (minisign pair). `pubkey` goes into `tauri.conf.json`; private key → GitHub secret `TAURI_SIGNING_PRIVATE_KEY` (+ password secret if set). Losing the private key bricks the update chain for existing installs — back it up offline (1Password secure note + paper).
- v1 ships **unsigned** (documented bypass below). v1.1 adds:
  - macOS: Apple Developer $99/yr, `Developer ID Application` cert + `notarytool` + hardened runtime. Secrets: `APPLE_CERTIFICATE` (base64 `.p12`), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID` + app-specific `APPLE_PASSWORD` + `APPLE_TEAM_ID`. Local dev uses `"signingIdentity": "-"` ad-hoc. Verify with `spctl -a -vvv` + `stapler validate`.
  - Windows: Azure Trusted Signing (`signCommand` with `artifact-signing-cli`) or legacy PFX (`certificateThumbprint`/`timestampUrl`). Note: EV no longer bypasses SmartScreen by itself — needs reputation + `wdsi/filesubmission`. Unsigned shows blue `Unknown publisher → More info → Run anyway` (acceptable for OSS v1).
  - Linux: deferred with the platform (GPG optional when revived).

### 4.3 Unsigned v1 UX (copy to put in README/Releases)

- macOS Sequoia/Sonoma: `App is damaged / can't be opened → Move to Trash` → tell users: System Settings → Privacy & Security → Allow, or right-click Open. Ad-hoc sign (`"-"`) avoids the Apple-Silicon `damaged` crash but still needs the allow step.
- Windows: `Windows protected your PC` → `More info → Run anyway`. Set `bundle.windows.webview2InstallMode` (§3.1) so LTSC/offline/fresh images get the runtime instead of a silent launch failure.
- Linux: out of scope in v1 (no artifacts, no docs). When revived: system WebKit required at runtime for both `.deb` (declares deps) and `.AppImage` (Tauri does NOT bundle WebKit) — tell AppImage users the `apt install libwebkit2gtk-4.1-0` line.

## 5. Build times (measured + expected — estimates, don't gate on them)

| Step                                  | Time                                    |
| ------------------------------------- | --------------------------------------- |
| `pnpm install` (cached / cold)        | ~30s / 1-2min                           |
| `pnpm build` (this repo, snapshot)    | ~2.2s                                   |
| Tauri Rust cold per OS                | research estimate 6-15min (mac slowest) |
| Tauri Rust warm (`rust-cache`) per OS | research estimate 2-5min                |
| Upload (small Tauri artifacts)        | seconds                                 |

Wall-clock for a tagged release ≈ slowest matrix leg ≈ **~6-10min warm (estimate, mac+Windows only)**. PRs are unaffected (no desktop on PR).

Keep it fast: release-only trigger, always `rust-cache`, single mac target, defer `lto=true / codegen-units=1 / panic=abort` size opts until size matters (they roughly double Rust time), `fail-fast: false` so one OS flake doesn't kill the rest.

## 6. App UX for updates + first run

- Settings → `Check for Updates` button + silent startup check with opt-out toggle. Silent check fails quiet offline (no error toast every launch); surface errors only on manual check. Use `check()` → show `version/notes/pub_date` → `downloadAndInstall(progress)` → prompt `Restart now / Later` → `relaunch()` (required mac, auto-quit Windows). Render notes with the existing dependency-free Markdown renderer — never raw HTML. Handle `204 No Content` (no update), `404` (release still Draft — tell user to wait, not "broken").
- Staged rollouts: static `latest.json` has no %-rollout. Emulate: `releaseDraft:true` → QA on both v1 artifacts → publish; ship betas as `prerelease:true` with `includeUpdaterJson: false` (never overwrite `latest.json`); separate beta channel only if demand appears (second endpoint + runtime channel switch, or CrabNebula Cloud).
- First-run assistant doctor (see §3.3.5): provider defaults to `ollama` on desktop (offline, free — owner-confirmed local-first default); hosted keys behind explicit consent + keychain-remembered by default with `[Forget]`/opt-out; `Test key` before save. Schedule the import-wizard copy + Settings JSON backup→restore as the _supported_ browser→desktop migration (not a callout).
- One-click download surface: `Releases/latest` page + README badge + (optional) landing link on the Pages site. Do not auto-redirect Pages users to desktop — origins differ, IDB does not migrate without the JSON backup step (call it out).

## 7. Security model

- Tauri capabilities are deny-by-default. Only `main` window gets the permissions in §3.1. No `shell` exec, no `fs` in v1 (§3.4). CSV parsing stays in JS with Zod; never `eval` model output (existing dependency-free Markdown renderer stays).
- Keys: OS keychain remembered by default (owner call 2026-09-06) with `[Forget]`/opt-out to memory-only. No keys in `store.json`, logs, exports, telemetry. Rust holds the key for the proxy path; frontend never sees it when remembered. Shared-device risk accepted by owner — mitigate with first-run copy + always-visible Forget.
- Updates: minisign enforced, cannot disable. `allowDowngrades` off; rollback = roll-forward hotfix (§4.1).
- CSP: `app.security.csp` (prod, tight: Rust proxy needs only `'self' ipc: http://ipc.localhost`) vs `app.security.devCsp` (HMR WS, looser, scoped by `TAURI_DEV_HOST`).
- Supply chain: pin ALL actions by SHA (existing repo does; extend to Rust toolchain, `rust-cache`, `tauri-action`), keep `private: true` + `pnpm audit --prod` in CI, commit + audit `Cargo.lock` (`cargo audit`/`deny`), pin plugins to `~2.x.y` (minors can break).

## 8. Testing plan

- Keep all existing gates green (`format:check`, `lint`, `typecheck`, `test`, `test:browser`, `build`).
- New manual matrix per release candidate (both v1 artifacts: mac-aarch64, Windows): install, import 20-file mix, budgets/groups/charts, backup → clear → restore, assistant turn on Ollama + hosted, + offline launch.
- Updater e2e: install vN-1 → publish vN draft → publish → assert `check()` offers vN, progress shows, relaunch lands on vN, IDB intact. Test missing-arch `latest.json` (that arch must report no-update, not error) and Draft-404 copy. Include the §4.1 `latest.json` jq validation in CI.
- Failure drills: wrong key (401 copy), Ollama down (doctor copy), direct-fetch 403 CORS (origins copy — fallback path only), LM Studio CORS off (toggle copy), offline startup (quiet, no toast). No Linux secret-daemon drill in v1.
- Compat matrix for §3.3.6: Ollama vs LM Studio vs bridge, with/without `tools` fields.
- Perf: cold start target <1s desktop; IDB seed of 10k synthetic txns must stay interactive (existing fixtures only, never real exports).

## 9. Rollout phases

- **Phase 0 — keys + repo (30min, no code):** generate minisign pair, store both secrets, reserve `app-v*` pattern + `identifier`, write Releases download copy + unsigned-bypass docs.
- **Phase 1 — shell (1-2 days):** `src-tauri/` init (`identifier`, `category`, `targets`, `main` label, `useHttpsScheme: false`, `webview2InstallMode`, icons, `Cargo.lock`), `VITE_BASE=/` + assertion, hash-history gate (`createHashHistory`, `basepath="/"`), `isTauri.ts` + `llmClient`/`desktop` adapters, `vite server.strictPort`, new npm scripts (`tauri`, `tauri:dev`, `tauri:build`, `build:desktop`), `navigator.storage.persist()` + check, `tauri dev` + `tauri build` locally on one OS.
- **Phase 2 — assistant transport (1-2 days):** Rust proxy command (SSRF/timeout contract) + keyring get/set/delete, `/models` per-provider listing + cache + `Custom…` + `Test key`, probe + doctor copy, minimal-body + tool-fallback, OpenRouter headers, privacy badges, harness gates. Harness stays dev-only.
- **Phase 3 — release lane (half day):** `release.yml` matrix + pinned SHAs + caches, `includeUpdaterJson` split (stable true / prerelease false), draft → QA → publish drill, `latest.json` jq validation, `cargo audit`/`deny`.
- **Phase 4 — hardening (as needed):** local e2e matrix (both v1 artifacts), unsigned-bypass docs, README badge, migration wizard UI, optional PWA rehearsal.
- **v1.1 — signing:** Apple cert + notarization + Windows Trusted Signing; then size opts (`lto` etc.) if wanted. Explicitly deferred: file-association, `dialog`+`fs` picker upgrade, Linux port.

## 10. Alternatives considered (and why deferred)

| Option                      | Verdict                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wails v3                    | Faster Go builds, but updater/keychain beta/DIY, small community. Revisit if team goes Go.                                                                                           |
| Electron                    | Best compat (bundled Chromium, no proxy), most mature updater — but far larger download. Revisit if desktop WebView gaps block (Linux would be the trigger, currently out of scope). |
| Bun/Node single-file server | No installer/dock/updater; useful fallback, not v1.                                                                                                                                  |
| Capacitor desktop           | No first-party desktop; mobile shell lives in `docs/ios/plan.md`.                                                                                                                    |
| PWA                         | Good rehearsal, not the deliverable.                                                                                                                                                 |

## 11. Open questions (need owner call)

1. Unsigned v1 acceptable, or block on Apple $99 + Windows signing before first binary? (Still open.)
2. ~~Default assistant provider in the binary~~ — DECIDED 2026-09-06: `ollama`, local-first story.
3. ~~Linux scope~~ — DECIDED 2026-09-06: out of scope for v1 (mac + Windows only). Baseline if revived: `ubuntu-22.04` + WebKitGTK 4.1.
4. Tag pattern: confirm `app-v*` unified (trigger + `tagName` + version sync)? Proposal: yes (§4.1).
5. ~~Remember-me default~~ — DECIDED 2026-09-06: ON by default (keychain) with `[Forget]`/opt-out to memory-only.

## 12. Sources + prior art

- Tauri 2 docs: updater, `http`, `store`, capabilities/CSP (`csp` vs `devCsp`), `tauri-action` (`includeUpdaterJson`, `tagName: app-v__VERSION__`); `@tauri-apps/api/core:isTauri()`; `keyring` crate (primary — verify any third-party plugin name on crates.io); `stronghold`/keyring-plugin claims unverified — confirm or drop before pinning.
- Wails v3 docs: updater tutorial, `providers/github`, `zalando/go-keyring`.
- Ollama: `AllowedOrigins`, `OLLAMA_ORIGINS`, `OLLAMA_HOST`, `/api/tags` vs `/v1/models`; LM Studio server CORS toggle.
- OpenRouter attribution: `HTTP-Referer` (primary) + `X-Title`.
- OSS: Jan (BYOK+local LLM reference), AnythingLLM Desktop (`safeStorage`), LibreChat (encrypt-at-rest pattern), Atlas/JarvisAI (Ollama doctor UX), Cap/solidtime-desktop (updater + `latest.json` flow).
- Review pass 2026-09-06: corrected origin (`http://tauri.localhost`), capability scoping, `includeUpdaterJson`, password secret, WebKit-bundling myth, WebView2 bootstrapper, prerelease clobbering, SSRF contract, toolchain pinning, `Cargo.lock` audit, migration scheduling, offline updater behavior.
