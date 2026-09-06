import { afterEach, describe, expect, it, vi } from "vitest"

import {
  DEMO_DIRECT_BASE_URL,
  DEMO_PROVIDER_ID,
  isDemoModeAvailable,
  isDemoRequest,
  resolveDemoEndpoint,
} from "@/features/assistant/demo-endpoint"
import {
  DEMO_DEFAULT_MODEL,
  DEMO_MODEL_ALLOWLIST,
  isDemoModelAllowed,
} from "@/features/assistant/demo-models"
import {
  defaultSettingsFor,
  defaultProvider,
  readAssistantSettings,
  requestChatTurn,
  toPersistableSettings,
  visibleAssistantPresets,
} from "@/features/assistant/provider"

const SYNTHETIC_DEMO_KEY = "sk-or-v1-synthetic-demo-key-for-tests-only"

function stubFetch(impl: (url: string, init?: { body?: unknown; headers?: unknown }) => unknown) {
  const mock = vi.fn<
    (url: string, init?: { body?: unknown; headers?: unknown }) => Promise<unknown>
  >((url, init) => Promise.resolve(impl(url, init)))
  vi.stubGlobal("fetch", mock)
  return mock
}

function chatPayload(content: string): unknown {
  return { choices: [{ message: { content, tool_calls: undefined } }] }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("demo preset visibility", () => {
  it("hides the demo preset without the env key", () => {
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", "")
    expect(isDemoModeAvailable()).toBe(false)
    expect(resolveDemoEndpoint()).toBeNull()
    expect(visibleAssistantPresets().some((preset) => preset.id === DEMO_PROVIDER_ID)).toBe(false)
  })

  it("shows the demo preset with the env key (label + direct endpoint)", () => {
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", SYNTHETIC_DEMO_KEY)
    expect(isDemoModeAvailable()).toBe(true)
    expect(resolveDemoEndpoint()).toEqual({
      baseURL: DEMO_DIRECT_BASE_URL,
      apiKey: SYNTHETIC_DEMO_KEY,
    })
    const demo = visibleAssistantPresets().find((preset) => preset.id === DEMO_PROVIDER_ID)
    expect(demo).toMatchObject({
      label: "Demo (free models, shared key)",
      baseURL: DEMO_DIRECT_BASE_URL,
      model: DEMO_DEFAULT_MODEL,
      needsKey: false,
    })
  })

  it("falls back from a stored demo selection when the key is absent", () => {
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", "")
    const settings = readAssistantSettings({
      getItem: () => JSON.stringify({ provider: DEMO_PROVIDER_ID }),
    })
    expect(settings.provider).not.toBe(DEMO_PROVIDER_ID)
    expect(settings.provider).toBe("opencode-bridge")
  })
})

describe("demo model allowlist", () => {
  it("allows the default model and every allowlisted id", () => {
    expect(DEMO_MODEL_ALLOWLIST).toContain(DEMO_DEFAULT_MODEL)
    for (const id of DEMO_MODEL_ALLOWLIST) {
      expect(isDemoModelAllowed(id)).toBe(true)
    }
  })

  it("rejects paid and non-free ids", () => {
    expect(isDemoModelAllowed("openai/gpt-5-mini")).toBe(false)
    expect(isDemoModelAllowed("z-ai/glm-5.2")).toBe(false)
    expect(isDemoModelAllowed("anthropic/claude-sonnet-4")).toBe(false)
    expect(isDemoModelAllowed("")).toBe(false)
    expect(isDemoModelAllowed(undefined)).toBe(false)
    expect(isDemoModelAllowed(42)).toBe(false)
  })

  it("rejects sneaky variants of allowlisted ids", () => {
    expect(isDemoModelAllowed("Z-AI/GLM-5.2:FREE")).toBe(false)
    expect(isDemoModelAllowed("openrouter/z-ai/glm-5.2:free")).toBe(false)
    expect(isDemoModelAllowed("z-ai/glm-5.2:free:extra")).toBe(false)
    expect(isDemoModelAllowed("z-ai/glm-5.2:free\n; rm -rf /")).toBe(false)
    expect(isDemoModelAllowed("z-ai/glm-5.2 :free")).toBe(false)
  })

  it("trims incidental outer whitespace before matching", () => {
    expect(isDemoModelAllowed(`  ${DEMO_DEFAULT_MODEL}  `)).toBe(true)
  })
})

describe("demo request path", () => {
  const turnOptions = {
    baseURL: DEMO_DIRECT_BASE_URL,
    system: "s",
    history: [{ role: "user" as const, content: "hi" }],
    tools: [],
  }

  it("sends the env key on the demo path", async () => {
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", SYNTHETIC_DEMO_KEY)
    const seen: Array<{ url: string; init?: { headers?: unknown } }> = []
    stubFetch((url, init) => {
      seen.push({ url, ...(init ? { init } : {}) })
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(""),
        json: () => Promise.resolve(chatPayload("demo answer")),
      }
    })
    const turn = await requestChatTurn({
      ...turnOptions,
      apiKey: SYNTHETIC_DEMO_KEY,
      model: DEMO_DEFAULT_MODEL,
    })
    expect(turn.content).toBe("demo answer")
    expect(seen).toHaveLength(1)
    expect(seen[0]?.url).toBe(`${DEMO_DIRECT_BASE_URL}/chat/completions`)
    expect(seen[0]?.init?.headers).toMatchObject({
      authorization: `Bearer ${SYNTHETIC_DEMO_KEY}`,
    })
  })

  it("rejects non-free models before any network call", async () => {
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", SYNTHETIC_DEMO_KEY)
    const mock = stubFetch(() => {
      throw new Error("must not fetch")
    })
    await expect(
      requestChatTurn({ ...turnOptions, apiKey: SYNTHETIC_DEMO_KEY, model: "openai/gpt-5-mini" }),
    ).rejects.toThrow("Demo mode only allows free models")
    expect(mock).not.toHaveBeenCalled()
  })

  it("detects the demo key even pasted into a BYOK preset", () => {
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", SYNTHETIC_DEMO_KEY)
    expect(isDemoRequest("https://openrouter.ai/api/v1", SYNTHETIC_DEMO_KEY)).toBe(true)
    expect(isDemoRequest("https://api.openai.com/v1", SYNTHETIC_DEMO_KEY)).toBe(true)
    expect(isDemoRequest("https://openrouter.ai/api/v1", "sk-user-key")).toBe(false)
  })

  it("leaves BYOK traffic untouched when no demo key is baked in", async () => {
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", "")
    stubFetch(() => ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(""),
      json: () => Promise.resolve(chatPayload("byok answer")),
    }))
    const turn = await requestChatTurn({
      ...turnOptions,
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-user-key",
      model: "gpt-5-mini",
    })
    expect(turn.content).toBe("byok answer")
  })
})

describe("demo relay switchover", () => {
  it("prefers the relay URL with no key when set", () => {
    vi.stubEnv("VITE_ASSISTANT_RELAY_URL", "https://relay.test/")
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", SYNTHETIC_DEMO_KEY)
    expect(resolveDemoEndpoint()).toEqual({ baseURL: "https://relay.test", apiKey: "" })
    expect(isDemoModeAvailable()).toBe(true)
  })

  it("treats relay traffic as demo traffic (client allowlist still applies)", () => {
    vi.stubEnv("VITE_ASSISTANT_RELAY_URL", "https://relay.test")
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", "")
    expect(isDemoRequest("https://relay.test", "")).toBe(true)
    expect(isDemoRequest("https://relay.test/", "")).toBe(true)
    expect(isDemoRequest("https://other.test", "")).toBe(false)
  })

  it("keeps direct baked-key behavior when the relay URL is unset", () => {
    vi.stubEnv("VITE_ASSISTANT_RELAY_URL", "")
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", SYNTHETIC_DEMO_KEY)
    expect(resolveDemoEndpoint()).toEqual({
      baseURL: DEMO_DIRECT_BASE_URL,
      apiKey: SYNTHETIC_DEMO_KEY,
    })
  })
})

describe("demo key storage hygiene", () => {
  it("never persists keys (demo or BYOK) to storage-shaped settings", () => {
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", SYNTHETIC_DEMO_KEY)
    const persisted = toPersistableSettings({
      ...defaultSettingsFor(DEMO_PROVIDER_ID),
      apiKey: SYNTHETIC_DEMO_KEY,
    })
    expect(persisted.apiKey).toBe("")
    expect(JSON.stringify(persisted)).not.toContain(SYNTHETIC_DEMO_KEY)
  })

  it("never injects the env key into settings defaults", () => {
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", SYNTHETIC_DEMO_KEY)
    expect(defaultSettingsFor(DEMO_PROVIDER_ID).apiKey).toBe("")
    expect(resolveDemoEndpoint()?.apiKey).toBe(SYNTHETIC_DEMO_KEY)
  })
})

describe("public demo build", () => {
  it("defaults fresh settings to demo and hides local-only presets", () => {
    vi.stubEnv("VITE_PUBLIC_DEMO", "true")
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", SYNTHETIC_DEMO_KEY)
    expect(defaultProvider()).toBe(DEMO_PROVIDER_ID)
    expect(visibleAssistantPresets().map((preset) => preset.id)).toEqual([
      "openrouter",
      "openai",
      DEMO_PROVIDER_ID,
    ])
    expect(readAssistantSettings({ getItem: () => null }).provider).toBe(DEMO_PROVIDER_ID)
  })

  it("respects a stored hosted-BYOK selection", () => {
    vi.stubEnv("VITE_PUBLIC_DEMO", "true")
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", SYNTHETIC_DEMO_KEY)
    const settings = readAssistantSettings({
      getItem: () => JSON.stringify({ provider: "openrouter" }),
    })
    expect(settings.provider).toBe("openrouter")
  })

  it("falls back from a stored local-only selection to demo", () => {
    vi.stubEnv("VITE_PUBLIC_DEMO", "true")
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", SYNTHETIC_DEMO_KEY)
    const settings = readAssistantSettings({
      getItem: () => JSON.stringify({ provider: "ollama" }),
    })
    expect(settings.provider).toBe(DEMO_PROVIDER_ID)
  })

  it("leaves local dev untouched (bridge default, all presets visible)", () => {
    vi.stubEnv("VITE_PUBLIC_DEMO", "")
    vi.stubEnv("VITE_OPENROUTER_DEMO_KEY", SYNTHETIC_DEMO_KEY)
    expect(defaultProvider()).toBe("opencode-bridge")
    expect(visibleAssistantPresets()).toHaveLength(8)
    expect(readAssistantSettings({ getItem: () => null }).provider).toBe("opencode-bridge")
  })
})
