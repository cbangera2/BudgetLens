# Assistant gap analysis vs `rs-4/tanstack-ai-demo`

Source: https://github.com/rs-4/tanstack-ai-demo (TanStack Start + TanStack AI +
Drizzle/Postgres chat template, cloned to `/tmp` for review; no code copied).

Direction of comparison: what the demo has that our floating assistant
(`src/features/assistant/`, `server/assistant-harness.ts`) lacks — plus what
we already do better, so we don't regress. Sketch status: proposal, not a plan
of record. Priorities are P0 (do next) → P2 (someday).

## Where we are already ahead (do not lose)

| Capability        | Ours                                                                              | Demo                                                              |
| ----------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Model list source | Live from `opencode serve` (`/api/models`, enabled-only, 391 models)              | Static hardcoded catalog (5 providers, ~20 models, already stale) |
| Evals             | `pnpm eval:assistant` — 5 deterministic cases (task, no-leak, trajectory, resume) | None                                                              |
| Write safety      | Approval-gated budget writes (`propose_budget_change` draft → Approve)            | No tools at all, nothing to gate                                  |
| Privacy shape     | Capped aggregates snapshot; raw Dexie rows never leave the browser                | Sends user content to hosted providers by design                  |
| Widget UX         | Floating, resizable, collapsible; zero layout impact                              | Full-page layout commitment                                       |
| Markdown          | Dependency-free safe renderer (no `react-markdown` CVEs/perf)                     | `react-markdown` + `remark-gfm`                                   |

## 1. Conversation management (biggest UI gap)

We have one ephemeral thread per panel lifetime; the demo treats chats as
first-class objects. Local-first equivalent: a `threads` Dexie table
(id, title, provider, model, preview, pinned, createdAt, updatedAt) +
`messages` persisted per thread (cap e.g. last 100).

| Feature           | Demo reference                                              | Proposal                                                                     | Priority |
| ----------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| Thread list       | `ChatSidebar` pinned + recent-10                            | History view inside widget (slide-over or tab); pin + delete; Dexie-backed   | P0       |
| New chat          | `createChat` server fn                                      | `New chat` button; clears session id (harness sessions are server-local)     | P0       |
| Auto titles       | First user message `slice(0, 50)`                           | Same, or harness-generated on first answer; store on thread                  | P1       |
| Full-text search  | `ChatSearchDialog` ⌘K over chats+messages (debounced 300ms) | ⌘K palette over Dexie threads/messages; reuse `ModelSelect` palette patterns | P1       |
| Rename thread     | — (missing in demo too)                                     | Inline rename; cheap, do it when building the list                           | P2       |
| Export transcript | — (missing in demo too)                                     | Markdown download per thread; feeds eval regressions                         | P2       |

## 2. Composer upgrades

| Feature           | Demo reference                                               | Proposal                                                                                                                                  | Priority |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Multiline input   | `ChatInput` textarea, Enter send / Shift+Enter newline       | Replace our single-line `Input`; keep round send button                                                                                   | P0       |
| Stop generation   | Streaming abort                                              | Already have (AbortController → `/api/chat` abort). Keep.                                                                                 | —        |
| Attachments       | Image attach (picker + drag-drop), gated on `supportsVision` | CSV receipt attach for imports page context; gate on harness capability, render via existing `Attachment` story                           | P1       |
| Capability gating | `supportsVision` / `supportsPDF` per model in catalog        | Serve already returns capabilities; add `vision`/`reasoning`/`context` to `/api/models` and gate UI (attach button, long-context warning) | P1       |
| Cost/latency hint | — (missing)                                                  | Footer line from eval timings (`~7s · free model`); data exists in eval runs                                                              | P2       |

## 3. Message UX

Neither app has these; the demo's absence is not an excuse.

| Feature                | Proposal                                                                                                     | Priority |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| Copy answer            | Copy button per assistant message (`MessageFooter` slot pattern)                                             | P0       |
| Regenerate             | Re-run last turn (fresh harness session, same snapshot); needs threads from §1                               | P1       |
| Thumbs up/down         | One-click feedback → appends failing case to `evals/` dataset (closes the loop the eval literature begs for) | P1       |
| Timestamps + model tag | Small `private · <model>` footer per answer; provenance for shared screenshots                               | P2       |
| Token/cost footer      | Harness `RUN_FINISHED` already returns `usage`; surface `in/out` per answer                                  | P2       |

## 4. Streaming

Demo streams tokens (`StreamingMessage` + `TypingIndicator`); we return one JSON
payload per turn (fine on local harness, ~5–15s).

| Feature                  | Proposal                                                                                                                               | Priority |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Token streaming          | Adopt `useChat` + SSE (`toServerSentEventsResponse`) when the endpoint graduates; keep JSON fallback for OpenAI-compatible direct mode | P1       |
| Mid-stream tool timeline | Render `TOOL_CALL_*` events as they arrive instead of post-hoc (our drain already classifies them)                                     | P1       |
| Thinking/reasoning parts | Stream `thinking` parts for reasoning models (serve advertises `reasoning: true`) into collapsible block                               | P2       |

## 5. Model selector extras

Ours (searchable palette, live enabled-only list, groups, free badges) already
beats the demo's static Radix dropdown. Remaining:

| Feature              | Proposal                                                                                                                               | Priority |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Capability badges    | `vision` / `reasoning` / context-length from serve `capabilities` + `limit` (same payload, ~5 lines)                                   | P0       |
| Recent models        | MRU list (localStorage) above groups; the 391-long list needs it                                                                       | P1       |
| Per-harness grouping | When claude-code/codex land, group by harness (Opencode / Claude Code / Codex / Direct) not just provider                              | P1       |
| Provider icons       | Demo has `ProviderIcons` + colors; we have color dots. Graduate to tiny brand glyphs only if a no-dep icon set appears — dots are fine | P2       |

## 6. Tools (agent capability)

Demo has zero tools — this is where we pull ahead for real. Principles from the
literature review: small scoped catalogs (≤10), `get_` vs `update_` naming,
descriptions that say when NOT to call, structured errors.

| Tool                   | Shape                                                                                                           | Priority |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| `propose_recategorize` | Draft transaction category/label changes → same Approve UI as budgets (read `search_transactions`, write gated) | P0       |
| `propose_group_assign` | Draft group membership moves → Approve UI                                                                       | P1       |
| `explain_variance`     | Pure-math server tool (no PII): month-over-month deltas from snapshot; stops LLM arithmetic hallucinations      | P1       |
| `import_helper`        | Parse pasted CSV snippet → column mapping draft for imports page                                                | P2       |
| Dynamic loading        | Retrieve top-k tools per query instead of all-at-once (only if catalog passes ~10)                              | P2       |
| MCP bridge             | Expose finance tools over MCP for external agents (opencode/codex already speak MCP)                            | P2       |

## 7. Evals (keep extending `evals/assistant.eval.mjs`)

| Idea                     | Notes                                                                               | Priority   |
| ------------------------ | ----------------------------------------------------------------------------------- | ---------- |
| Regression from failures | Every thumbs-down / production embarrassment becomes a case (literature rule #6)    | P0 process |
| Latency + cost table     | Already timed; add `usage` tokens from `RUN_FINISHED` and fail on budget            | P1         |
| Model A/B                | `ASSISTANT_MODEL` env already parametrizes; run matrix nightly over 2–3 free models | P1         |
| Trajectory scoring       | Count + name checks exist; add arg-correctness (e.g. `read` path inside repo)       | P1         |
| LLM-as-judge             | Only for helpfulness/tone; deterministic checks stay primary                        | P2         |
| Golden snapshots         | Freeze one good answer per case; diff on dependency upgrades                        | P2         |

## 8. Persistence & deploy posture

| Decision         | Demo                                             | Ours / proposal                                                                                  |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Thread storage   | Postgres + Drizzle, cascade delete, indexes      | Dexie tables (local-first; no new infra). Migrate `messages` state there in §1.                  |
| Harness sessions | N/A (stateless providers)                        | Singleton serve + `sessionId` resume; document orphan cleanup (`pnpm dev` exit leaves one serve) |
| Deploy           | Docker Compose + what looks like a wrangler file | Keep Pages static for app; harness stays `pnpm dev`-only until a real server target exists       |
| Sharing          | N/A                                              | Export-markdown (§1) before any hosted share feature                                             |

## Suggested build order

1. Threads in Dexie + new-chat + copy button (§1 core, §3 copy).
2. Multiline composer + capability badges + recent models (§2, §5).
3. `propose_recategorize` + `explain_variance` tools with eval cases (§6, §7).
4. ⌘K history search + regenerate + feedback-to-eval loop (§1–§3 loop closure).
5. Streaming upgrade when endpoint leaves dev-only (§4).
