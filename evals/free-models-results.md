# Free-model eval results — 2026-09-09

One-time benchmark run across every `:free` model on OpenRouter, using
`evals/free-models.eval.mjs` (7 realistic BudgetLens finance cases per model:
spending summary, over-budget, fastest-grower, what-if math, largest
transaction, chart fence, tool-call probe; temperature 0.2, streaming for
TTFT + tokens/sec). Raw JSON is gitignored under `evals/results/`; this file
is the tracked summary.

Command:

```sh
cp .env.example .env   # set OPENROUTER_KEY
node evals/free-models.eval.mjs --concurrency=2 --delay-ms=1000 \
  --out=evals/results/free-models-2026-09-09.json
```

Rerun after the daily quota resets (or with `--allowlist-only`):

```sh
node evals/free-models.eval.mjs --allowlist-only
```

## ⚠️ Partial run — quota exhausted midway

Fresh OpenRouter keys are capped at ~50 free-model requests/day and 20/min.
A full run needs 18 models × 7 cases = 126 requests, so the account hit
`free-models-per-day` partway through (first at
`nvidia/nemotron-3-ultra-550b-a55b` tool-probe) and everything after that is
quota noise, **not** model quality. The eval script now classifies failures
(`rate_limited` / `unsupported` / `timeout` / `quality`) and stops early on
daily-quota errors instead of burning requests — rerun with the current
script for a clean pass.

Failure causes below are from the run output: `rate_limited` = HTTP 429
(OpenRouter or upstream provider), `unsupported` = 403/404 (model refuses
direct API or tool use), `quality` = a real wrong answer.

## Results (pass desc, avg latency asc)

| model                                              | pass | avg total | avg TTFT | failures                                                                                                                       |
| -------------------------------------------------- | ---- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| cohere/north-mini-code:free                        | 7/7  | 11187ms   | 10652ms  | —                                                                                                                              |
| dots-studio/dots-3-note-preview:free               | 7/7  | 15674ms   | 14908ms  | —                                                                                                                              |
| nvidia/nemotron-3-super-120b-a12b:free             | 7/7  | 38631ms   | 38229ms  | —                                                                                                                              |
| nex-agi/nex-n2.5-mini:free                         | 5/7  | 6863ms    | 7498ms   | 1x rate_limited, 1x quality (chart ignored snapshot)                                                                           |
| nvidia/nemotron-3-ultra-550b-a55b:free             | 5/7  | 38235ms   | 43567ms  | 1x rate_limited, 1x quality (fastest-grower blank)                                                                             |
| nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free | 5/7  | 78045ms   | 72176ms  | 2x quality (empty budget answer; largest-tx picked -$165,000 expense over $3,150 income)                                       |
| nex-agi/nex-n2.5-pro:free                          | 4/7  | 77632ms   | 27873ms  | 3x timeout (120s)                                                                                                              |
| liquid/lfm-2.5-2.6b:free                           | 3/7  | 6614ms    | 6849ms   | 1x rate_limited, 3x quality (no currency; wrong largest-tx; proprietary `<\|tool_call_start\|>` chart syntax instead of fence) |
| inclusionai/ling-3.0-flash-sante:free              | 2/7  | 1829ms    | 1508ms   | 5x rate_limited (both passing cases were fast: fastest-grower 1725ms, chart 1747ms)                                            |
| google/gemma-4-26b-a4b-it:free                     | 0/7  | —         | —        | 7x rate_limited (upstream provider + per-min)                                                                                  |
| google/gemma-4-31b-it:free                         | 0/7  | —         | —        | 7x rate_limited (upstream provider + per-min)                                                                                  |
| inclusionai/ling-3.0-flash-fin:free                | 0/7  | —         | —        | 7x rate_limited (untested — quota)                                                                                             |
| nvidia/nemotron-3.5-content-safety:free            | 0/7  | —         | —        | 6x rate_limited (untested — quota) + 1x unsupported (404: no endpoints support tool use)                                       |
| nvidia/nemotron-3.5-lightning:free                 | 0/7  | —         | —        | 7x rate_limited (untested — quota; current demo default)                                                                       |
| poolside/laguna-s-2.1:free                         | 0/7  | —         | —        | 7x rate_limited (untested — quota)                                                                                             |
| poolside/laguna-xs-2.1:free                        | 0/7  | —         | —        | 7x rate_limited (untested — quota)                                                                                             |
| thinkingmachines/inkling-small:free                | 0/7  | —         | —        | 7x unsupported (403: agentic harnesses only)                                                                                   |
| thinkingmachines/inkling:free                      | 0/7  | —         | —        | 7x unsupported (403: agentic harnesses only)                                                                                   |

## Takeaways

- **TTFT ≈ total time on every model** (e.g. 10.6s of 11.2s). Free-tier
  requests queue before first token, so "speed" here mostly measures queue
  wait, not generation — per-case tokens/sec (in raw JSON) is the cleaner
  generation-speed signal: liquid ~75–140 tok/s, dots ~40–95 tok/s,
  cohere ~9–56 tok/s, nemotron reasoning ~2–15 tok/s.
- **Best clean signal: `cohere/north-mini-code:free` 7/7 at ~11s avg.**
  `dots-studio/dots-3-note-preview:free` also 7/7 at ~16s. Both are already
  on the demo allowlist.
- **Demo default (`nemotron-3.5-lightning`) never got tested** — quota died
  before its turn. Do not read its 0/7 as a quality verdict; rerun needed.
- **Allowlist flags:** both `thinkingmachines/inkling*` models 403 on the
  direct API ("only available on agentic harnesses") — removed from
  `DEMO_MODEL_ALLOWLIST` in this PR since the relay forwards to the same
  endpoint and would fail identically. Same for
  `nemotron-3.5-content-safety` (not allowlisted, correctly) which has no
  tool-capable endpoints.
- **New candidates worth a clean rerun:** `nex-agi/nex-n2.5-mini` (5/6
  answered, fastest non-trivial answers ~2.6–3.2s) and
  `inclusionai/ling-3.0-flash-sante` (2/2 answered, both <2s, 106–181 tok/s).
- **Slow / flaky:** nemotron reasoning/super/ultra all ≥38s avg with 76–115s
  worst cases; nex-pro timed out 3/7 at the 120s cap.
- **Gemma pair** was upstream rate-limited at the provider, not OpenRouter —
  retry on another day before judging.
