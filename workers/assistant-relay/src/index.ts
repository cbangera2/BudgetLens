import { isDemoModelAllowed } from "../../../src/features/assistant/demo-models"
import {
  buildCorsHeaders,
  createRateLimiter,
  parseAllowedOrigins,
} from "../../../src/features/assistant/relay-policy"

// BudgetLens demo relay: keeps the OpenRouter key server-side so the Pages
// bundle carries no secret. POST /v1/chat/completions mirrors OpenRouter's
// endpoint (POST /chat/completions is accepted as an alias, since the app
// appends "/chat/completions" to the relay base URL).
//
// Privacy: logs carry counts/metadata only (event, status, latency, client
// ip for abuse triage). NEVER log request/response bodies, prompts, or keys.

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
const DEFAULT_ALLOWED_ORIGINS = "https://cbangera2.github.io,http://localhost:*"
const RATE_LIMIT_PER_MINUTE = 30
const RATE_WINDOW_MS = 60_000
const MAX_BODY_BYTES = 256_000

interface RelayEnv {
  /** Worker secret (`wrangler secret put OPENROUTER_KEY`). Never in code/bundle. */
  OPENROUTER_KEY?: string
  /** Comma-separated extra origins; defaults cover Pages + localhost dev. */
  ALLOWED_ORIGINS?: string
}

// Per-isolate fixed window (v1: no KV yet). Throttles casual abuse; promote
// to KV/Durable Objects if limits must hold globally.
const limiter = createRateLimiter({ limit: RATE_LIMIT_PER_MINUTE, windowMs: RATE_WINDOW_MS })

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function json(
  status: number,
  body: unknown,
  cors: Record<string, string>,
  extra?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors, ...extra },
  })
}

function clientIP(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown"
}

function requestModel(raw: string): unknown {
  try {
    const parsed: unknown = JSON.parse(raw) as unknown
    return isRecord(parsed) ? parsed.model : undefined
  } catch {
    return undefined
  }
}

export default {
  async fetch(request: Request, env: RelayEnv): Promise<Response> {
    const url = new URL(request.url)
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS)
    const cors = buildCorsHeaders(request.headers.get("origin"), allowedOrigins)

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type, authorization",
          "access-control-max-age": "86400",
        },
      })
    }

    // No key needed: uptime monitoring.
    if (request.method === "GET" && url.pathname === "/healthz") {
      return json(200, { ok: true }, cors)
    }

    if (
      request.method !== "POST" ||
      (url.pathname !== "/v1/chat/completions" && url.pathname !== "/chat/completions")
    ) {
      return json(404, { error: "Not found." }, cors)
    }

    const apiKey = env.OPENROUTER_KEY?.trim()
    if (!apiKey) {
      console.log(JSON.stringify({ event: "misconfigured", path: url.pathname }))
      return json(500, { error: "Relay is not configured." }, cors)
    }

    const ip = clientIP(request)
    const verdict = limiter.check(ip)
    if (!verdict.allowed) {
      console.log(JSON.stringify({ event: "rate_limited", ip, retryAfterMs: verdict.retryAfterMs }))
      return json(429, { error: "Demo rate limit exceeded. Try again shortly." }, cors, {
        "retry-after": String(Math.max(1, Math.ceil(verdict.retryAfterMs / 1000))),
      })
    }

    // Read as text and forward verbatim: streaming (SSE) and non-streaming
    // bodies both pass through untouched.
    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) {
      return json(413, { error: "Request body too large." }, cors)
    }
    const model = requestModel(raw)
    if (!isDemoModelAllowed(model)) {
      console.log(JSON.stringify({ event: "model_rejected", ip }))
      return json(400, { error: "Demo mode only allows allowlisted :free models." }, cors)
    }

    const started = Date.now()
    let upstream: Response
    try {
      upstream = await fetch(OPENROUTER_CHAT_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: raw,
        signal: request.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return new Response(null, { status: 499, headers: cors })
      }
      console.log(JSON.stringify({ event: "upstream_error", ip }))
      return json(502, { error: "Upstream request failed." }, cors)
    }

    console.log(
      JSON.stringify({ event: "chat", ip, status: upstream.status, ms: Date.now() - started }),
    )
    // Pass OpenRouter's status/body through; pipe the stream untouched.
    const headers = new Headers(cors)
    const contentType = upstream.headers.get("content-type")
    if (contentType) headers.set("content-type", contentType)
    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
