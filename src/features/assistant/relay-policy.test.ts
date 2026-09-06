import { describe, expect, it } from "vitest"

import {
  buildCorsHeaders,
  createRateLimiter,
  isOriginAllowed,
  isRetryableUpstreamStatus,
  parseAllowedOrigins,
  parseRetryAfterMs,
  upstreamRetryDelayMs,
} from "@/features/assistant/relay-policy"

describe("relay rate limiter", () => {
  it("allows up to the limit, then rejects with a retry hint", () => {
    let at = 0
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => at })
    expect(limiter.check("1.2.3.4")).toEqual({ allowed: true, retryAfterMs: 0 })
    expect(limiter.check("1.2.3.4")).toEqual({ allowed: true, retryAfterMs: 0 })
    expect(limiter.check("1.2.3.4")).toEqual({ allowed: true, retryAfterMs: 0 })
    const blocked = limiter.check("1.2.3.4")
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBe(60_000)
    expect(limiter.check("9.9.9.9").allowed).toBe(true)
    expect(limiter.size()).toBe(2)
  })

  it("resets after the window (fake clock)", () => {
    let at = 1_000
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => at })
    expect(limiter.check("ip").allowed).toBe(true)
    expect(limiter.check("ip").allowed).toBe(false)
    at += 60_001
    expect(limiter.check("ip")).toEqual({ allowed: true, retryAfterMs: 0 })
  })
})

describe("relay CORS", () => {
  it("parses the origins env", () => {
    expect(parseAllowedOrigins("https://a.test, http://localhost:* ,")).toEqual([
      "https://a.test",
      "http://localhost:*",
    ])
    expect(parseAllowedOrigins(undefined)).toEqual([])
    expect(parseAllowedOrigins("")).toEqual([])
  })

  it("allows exact origins and localhost any-port, nothing else", () => {
    const allowed = ["https://cbangera2.github.io", "http://localhost:*"]
    expect(isOriginAllowed("https://cbangera2.github.io", allowed)).toBe(true)
    expect(isOriginAllowed("http://localhost:5173", allowed)).toBe(true)
    expect(isOriginAllowed("http://localhost:4173", allowed)).toBe(true)
    expect(isOriginAllowed("https://evil.github.io", allowed)).toBe(false)
    expect(isOriginAllowed("http://localhost:5173.evil.test", allowed)).toBe(false)
    expect(isOriginAllowed("http://127.0.0.1:5173", allowed)).toBe(false)
    expect(isOriginAllowed("", allowed)).toBe(false)
  })

  it("builds reflect-origin headers only for allowed origins", () => {
    const allowed = ["https://cbangera2.github.io", "http://localhost:*"]
    expect(buildCorsHeaders("https://cbangera2.github.io", allowed)).toMatchObject({
      "access-control-allow-origin": "https://cbangera2.github.io",
    })
    expect(buildCorsHeaders("https://evil.test", allowed)).toEqual({})
    expect(buildCorsHeaders(null, allowed)).toEqual({})
  })
})

describe("relay upstream retry", () => {
  it("retries rate limits and server errors, nothing else", () => {
    expect(isRetryableUpstreamStatus(429)).toBe(true)
    expect(isRetryableUpstreamStatus(500)).toBe(true)
    expect(isRetryableUpstreamStatus(502)).toBe(true)
    expect(isRetryableUpstreamStatus(503)).toBe(true)
    expect(isRetryableUpstreamStatus(400)).toBe(false)
    expect(isRetryableUpstreamStatus(401)).toBe(false)
    expect(isRetryableUpstreamStatus(404)).toBe(false)
    expect(isRetryableUpstreamStatus(200)).toBe(false)
  })

  it("parses Retry-After seconds, rejecting junk", () => {
    expect(parseRetryAfterMs("2")).toBe(2_000)
    expect(parseRetryAfterMs("  30 ")).toBe(30_000)
    expect(parseRetryAfterMs(null)).toBeNull()
    expect(parseRetryAfterMs("")).toBeNull()
    expect(parseRetryAfterMs("soon")).toBeNull()
    expect(parseRetryAfterMs("-5")).toBeNull()
  })

  it("honors Retry-After within a cap, else backs off exponentially", () => {
    expect(upstreamRetryDelayMs(0, 2_000)).toBe(2_000)
    expect(upstreamRetryDelayMs(0, 120_000)).toBe(10_000)
    expect(upstreamRetryDelayMs(0, null)).toBe(500)
    expect(upstreamRetryDelayMs(1, null)).toBe(1_000)
    expect(upstreamRetryDelayMs(5, null)).toBe(5_000)
  })
})
