// Demo-relay policy helpers (dependency-free): the Cloudflare Worker imports
// these for server-side enforcement, and the repo's vitest suite covers them
// here. No imports, no DOM/Node APIs; callers pass plain values in.

export interface RateLimitDecision {
  allowed: boolean
  /** Milliseconds until the window resets; 0 when allowed. */
  retryAfterMs: number
}

export interface RateLimiter {
  check(key: string): RateLimitDecision
  /** Distinct keys currently tracked (monitoring only). */
  size(): number
}

/**
 * Fixed-window per-key rate limiter over an in-memory Map. Good enough for
 * v1 abuse throttling (one Worker isolate each); promote to KV/Durable
 * Objects if limits must hold globally.
 */
export function createRateLimiter(options: {
  limit: number
  windowMs: number
  now?: () => number
}): RateLimiter {
  const { limit, windowMs } = options
  const now = options.now ?? Date.now
  const buckets = new Map<string, { count: number; resetAt: number }>()
  return {
    check(key: string): RateLimitDecision {
      const at = now()
      const bucket = buckets.get(key)
      if (!bucket || at >= bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: at + windowMs })
        return { allowed: true, retryAfterMs: 0 }
      }
      if (bucket.count < limit) {
        bucket.count += 1
        return { allowed: true, retryAfterMs: 0 }
      }
      return { allowed: false, retryAfterMs: Math.max(0, bucket.resetAt - at) }
    },
    size(): number {
      return buckets.size
    },
  }
}

/** Split a comma-separated origins env var into a clean list. */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  if (!raw) return []
  const origins: string[] = []
  for (const part of raw.split(",")) {
    const origin = part.trim().replace(/\/+$/, "")
    if (origin && !origins.includes(origin)) origins.push(origin)
  }
  return origins
}

/**
 * Exact origin match, plus "scheme://host:*" entries matching any numeric port
 * (dev "http://localhost:*"). No other wildcards: a bare "*" never matches,
 * and suffix tricks ("http://localhost:5173.evil.test") are rejected.
 */
export function isOriginAllowed(origin: string, allowedOrigins: readonly string[]): boolean {
  const candidate = origin.trim().replace(/\/+$/, "")
  if (!candidate) return false
  for (const entry of allowedOrigins) {
    if (entry === candidate) return true
    if (entry.endsWith(":*")) {
      const prefix = entry.slice(0, -1)
      if (!candidate.startsWith(prefix)) continue
      const port = candidate.slice(prefix.length)
      if (/^\d+$/.test(port)) return true
    }
  }
  return false
}

/** Reflect-Origin CORS headers for allowed origins, none otherwise. */
export function buildCorsHeaders(
  origin: string | null | undefined,
  allowedOrigins: readonly string[],
): Record<string, string> {
  if (!origin || !isOriginAllowed(origin, allowedOrigins)) return {}
  return { "access-control-allow-origin": origin, vary: "Origin" }
}

export const UPSTREAM_MAX_ATTEMPTS = 3
export const UPSTREAM_MAX_RETRY_AFTER_MS = 10_000
export const UPSTREAM_RETRY_BASE_MS = 500
export const UPSTREAM_RETRY_CAP_MS = 5_000

/** Retryable upstream statuses: rate-limited or server-side failure. */
export function isRetryableUpstreamStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

/** Parse a Retry-After header (seconds) into ms, or null when absent/unusable. */
export function parseRetryAfterMs(value: string | null | undefined): number | null {
  if (!value) return null
  const seconds = Number.parseInt(value.trim(), 10)
  if (!Number.isFinite(seconds) || seconds < 0) return null
  return seconds * 1_000
}

/**
 * Backoff before upstream attempt `attempt` (0-based retry index): honors the
 * server's Retry-After when present (capped), else exponential base.
 */
export function upstreamRetryDelayMs(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs !== null) return Math.min(retryAfterMs, UPSTREAM_MAX_RETRY_AFTER_MS)
  return Math.min(UPSTREAM_RETRY_BASE_MS * 2 ** attempt, UPSTREAM_RETRY_CAP_MS)
}
