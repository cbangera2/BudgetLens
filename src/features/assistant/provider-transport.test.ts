import { afterEach, describe, expect, it, vi } from "vitest"

import {
  isLocalBaseURL,
  listProviderModels,
  readAssistantSettings,
  requestChatTurn,
} from "@/features/assistant/provider"

interface StubResponse {
  ok: boolean
  status: number
  statusText: string
  text: () => Promise<string>
  json: () => Promise<unknown>
}

function stubFetch(
  impl: (url: string, init?: { body?: unknown }) => StubResponse | Promise<StubResponse>,
) {
  const mock = vi.fn<(url: string, init?: { body?: unknown }) => Promise<StubResponse>>(
    (url: string, init?: { body?: unknown }) => Promise.resolve(impl(url, init)),
  )
  vi.stubGlobal("fetch", mock)
  return mock
}

function jsonResponse(payload: unknown): StubResponse {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: () => Promise.resolve(""),
    json: () => Promise.resolve(payload),
  }
}

function errorResponse(status: number, detail: string): StubResponse {
  return {
    ok: false,
    status,
    statusText: "Error",
    text: () => Promise.resolve(detail),
    json: () => Promise.resolve({}),
  }
}

function chatPayload(content: string): unknown {
  return { choices: [{ message: { content, tool_calls: undefined } }] }
}

const memoryStorage = () => {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("isLocalBaseURL", () => {
  it("treats loopback hosts as local", () => {
    expect(isLocalBaseURL("http://localhost:11434/v1")).toBe(true)
    expect(isLocalBaseURL("http://127.0.0.1:11435/v1")).toBe(true)
    expect(isLocalBaseURL("http://[::1]:11434/v1")).toBe(true)
  })

  it("treats hosted providers as cloud", () => {
    expect(isLocalBaseURL("https://openrouter.ai/api/v1")).toBe(false)
    expect(isLocalBaseURL("https://api.openai.com/v1")).toBe(false)
    expect(isLocalBaseURL("http://192.168.1.10:11434/v1")).toBe(false)
  })

  it("falls back to substring matching for invalid URLs", () => {
    expect(isLocalBaseURL("not a url localhost")).toBe(true)
    expect(isLocalBaseURL("not a url")).toBe(false)
  })
})

describe("listProviderModels (web transport)", () => {
  it("parses OpenAI-shaped listings and dedupes ids", async () => {
    stubFetch(() => jsonResponse({ data: [{ id: "b" }, { id: "a" }, { id: "b" }, { id: 7 }] }))
    await expect(listProviderModels({ baseURL: "https://x.test/v1", apiKey: "" })).resolves.toEqual(
      ["b", "a"],
    )
  })

  it("throws on empty listings and HTTP errors", async () => {
    stubFetch(() => jsonResponse({ data: [] }))
    await expect(listProviderModels({ baseURL: "https://x.test/v1", apiKey: "" })).rejects.toThrow(
      "listed no models",
    )

    stubFetch(() => errorResponse(401, "invalid key"))
    await expect(
      listProviderModels({ baseURL: "https://x.test/v1", apiKey: "bad" }),
    ).rejects.toThrow("Provider 401")
  })
})

describe("requestChatTurn tool fallback (web transport)", () => {
  const tools = [
    {
      type: "function" as const,
      function: { name: "ping", description: "ping", parameters: {} },
    },
  ]

  it("retries without tools when the provider rejects tool calls", async () => {
    const calls: unknown[] = []
    stubFetch((_url, init) => {
      const raw = typeof init?.body === "string" ? init.body : "{}"
      calls.push(JSON.parse(raw) as unknown)
      if (calls.length === 1) return errorResponse(400, "tools not supported")
      return jsonResponse(chatPayload("plain answer"))
    })
    const turn = await requestChatTurn({
      baseURL: "https://x.test/v1",
      apiKey: "",
      model: "m",
      system: "s",
      history: [{ role: "user", content: "hi" }],
      tools,
    })
    expect(turn.content).toBe("plain answer")
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ tools })
    expect(calls[1]).not.toHaveProperty("tools")
  })

  it("retries server errors, then surfaces them without tool fallback", async () => {
    const mock = stubFetch(() => errorResponse(500, "boom"))
    await expect(
      requestChatTurn({
        baseURL: "https://x.test/v1",
        apiKey: "",
        model: "m",
        system: "s",
        history: [{ role: "user", content: "hi" }],
        tools,
      }),
    ).rejects.toThrow("Provider 500")
    expect(mock).toHaveBeenCalledTimes(3)
  })

  it("recovers when a retry succeeds", async () => {
    let calls = 0
    stubFetch(() => {
      calls += 1
      return calls === 1 ? errorResponse(500, "boom") : jsonResponse(chatPayload("recovered"))
    })
    const turn = await requestChatTurn({
      baseURL: "https://x.test/v1",
      apiKey: "",
      model: "m",
      system: "s",
      history: [{ role: "user", content: "hi" }],
      tools,
    })
    expect(turn.content).toBe("recovered")
  })

  it("does not retry rate limits or client errors", async () => {
    const mock = stubFetch(() => errorResponse(429, "slow down"))
    await expect(
      requestChatTurn({
        baseURL: "https://x.test/v1",
        apiKey: "",
        model: "m",
        system: "s",
        history: [{ role: "user", content: "hi" }],
        tools: [],
      }),
    ).rejects.toThrow("Provider 429")
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it("retries dropped connections", async () => {
    let calls = 0
    stubFetch(() => {
      calls += 1
      if (calls === 1) return Promise.reject(new TypeError("fetch failed"))
      return jsonResponse(chatPayload("reconnected"))
    })
    const turn = await requestChatTurn({
      baseURL: "https://x.test/v1",
      apiKey: "",
      model: "m",
      system: "s",
      history: [{ role: "user", content: "hi" }],
      tools,
    })
    expect(turn.content).toBe("reconnected")
  })

  it("stays aborted instead of retrying", async () => {
    const controller = new AbortController()
    controller.abort()
    const mock = stubFetch(() => errorResponse(500, "boom"))
    await expect(
      requestChatTurn({
        baseURL: "https://x.test/v1",
        apiKey: "",
        model: "m",
        system: "s",
        history: [{ role: "user", content: "hi" }],
        tools,
        signal: controller.signal,
      }),
    ).rejects.toThrow("Aborted")
    expect(mock).toHaveBeenCalledTimes(1)
  })
})

describe("rememberKey setting", () => {  it("defaults to false on web and parses stored values", () => {
    expect(readAssistantSettings(memoryStorage()).rememberKey).toBe(false)
    const storage = {
      getItem: () => JSON.stringify({ provider: "openai", rememberKey: true, apiKey: "x" }),
    }
    const parsed = readAssistantSettings(storage)
    expect(parsed.rememberKey).toBe(true)
    // Keys themselves are never trusted from storage shape beyond a string.
    expect(parsed.apiKey).toBe("x")
  })
})

describe("requestChatTurn abort compatibility (no AbortSignal.any)", () => {
  it("propagates a pre-aborted signal as AbortError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
        // Mimic spec fetch: an already-aborted signal rejects immediately.
        if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError")
        return jsonResponse(chatPayload("late"))
      }),
    )
    const controller = new AbortController()
    controller.abort()
    await expect(
      requestChatTurn({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: "test",
        model: "openai/gpt-5-mini",
        system: "diag",
        history: [{ role: "user", content: "hi" }],
        tools: [],
        signal: controller.signal,
      }),
    ).rejects.toThrow(DOMException)
  })
})
