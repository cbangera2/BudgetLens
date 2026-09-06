# BudgetLens assistant relay (Cloudflare Worker)

Demo-mode relay that keeps the OpenRouter key server-side. The Pages bundle
carries no secret once the app points at this Worker.

- `POST /v1/chat/completions` mirrors OpenRouter's endpoint (`POST
/chat/completions` is accepted as an alias, since the app appends
  `/chat/completions` to the relay base URL). Streaming (SSE) and
  non-streaming bodies pass through verbatim; aborts forward; OpenRouter
  status/body pass through; our own JSON `429` when rate-limited.
- Server-side enforcement: the shared allowlist from
  `src/features/assistant/demo-models.ts` plus per-IP fixed-window rate
  limiting (in-memory `Map`, 30 req/min; no KV yet).
- Upstream retries: 429/5xx from OpenRouter retry up to 3 attempts total,
  honoring `Retry-After` (capped at 10s) with exponential backoff + jitter.
  Other statuses pass straight through. The app's own transport also retries
  dropped connections and 5xx (never 4xx/429/aborts).
- `GET /healthz` returns `{ "ok": true }` with no key (monitoring).
- CORS: `https://cbangera2.github.io` plus `http://localhost:*` for dev,
  via `ALLOWED_ORIGINS`.
- Privacy: logs carry counts/metadata only (event, status, latency, client
  IP for abuse triage). Never request/response bodies, prompts, or keys.

## Human setup (one time)

1. Cloudflare account, then provision a token with Workers deploy rights and
   add it as the repo secret `CLOUDFLARE_API_TOKEN`.
2. `npx -y wrangler@4.129.0 login` (or `wrangler login`).
3. From this directory, store the capped ($0-5) OpenRouter key as a Worker
   secret (never in code, never in the bundle):
   `wrangler secret put OPENROUTER_KEY`
4. First deploy to learn the workers.dev URL:
   `wrangler deploy`
   (or push to `feat/assistant-relay` / `main`, which runs
   `.github/workflows/deploy-relay.yml`).
5. Copy the workers.dev origin (bare origin, no path, e.g.
   `https://budgetlens-assistant-relay.<your-subdomain>.workers.dev`) into
   the repo secret `VITE_ASSISTANT_RELAY_URL`. The next Pages build picks it
   up and demo traffic moves behind the relay. Until that secret exists, the
   app keeps using the baked-key direct path (progressive enhancement).

## App-side knob

- `VITE_ASSISTANT_RELAY_URL`: when set, the demo preset resolves to
  `{relayURL, no key}`; when unset, it keeps the baked-key direct behavior.
  See `src/features/assistant/demo-endpoint.ts` (the only client seam).

## Manual smoke (wrangler dev)

`wrangler dev` serves locally; then:

- `curl -i http://localhost:8787/healthz` expects `200 {"ok":true}`.
- `curl -i -X POST http://localhost:8787/v1/chat/completions -H
'content-type: application/json' -d '{"model":"not-allowed","messages":[]}'`
  expects `400` (allowlist enforced before any upstream call).
- With `OPENROUTER_KEY` set via a local `.dev.vars` file
  (`OPENROUTER_KEY=dummy`), a `z-ai/glm-5.2:free` body forwards upstream;
  expect the upstream status/body passed through.
