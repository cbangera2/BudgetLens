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
