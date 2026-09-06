import { invoke } from "@tauri-apps/api/core"

import {
  DEMO_DIRECT_BASE_URL,
  DEMO_PROVIDER_ID,
  isDemoModeAvailable,
  isDemoRequest,
} from "@/features/assistant/demo-endpoint"
import { DEMO_DEFAULT_MODEL, isDemoModelAllowed } from "@/features/assistant/demo-models"
import {
  DEFAULT_THINKING_LEVEL,
  THINKING_LEVELS,
  type ThinkingLevel,
} from "@/features/assistant/thinking-select"
import { isTauriSync } from "@/lib/isTauri"

export type AssistantProviderId =
  | "opencode-harness"
  | "opencode-bridge"
  | "ollama"
  | "lmstudio"
  | "openrouter"
  | "openai"
  | "openrouter-demo"
  | "custom"

export interface AssistantProviderPreset {
  id: AssistantProviderId
  label: string
  baseURL: string
  model: string
  needsKey: boolean
  hint: string
}

export const ASSISTANT_PRESETS: readonly AssistantProviderPreset[] = [
  {
    id: "opencode-harness",
    label: "Opencode agent (local harness)",
    baseURL: "/api/chat",
    model: "opencode/muse-spark-1.3-contributor-free",
    needsKey: false,
    hint: "Drives your opencode account (no API key) through a dev-server endpoint. Needs `pnpm dev`; never works from the static Pages build.",
  },
  {
    id: "opencode-bridge",
    label: "OpenCode bridge (local test)",
    baseURL: "http://127.0.0.1:11435/v1",
    model: "opencode-default",
    needsKey: false,
    hint: "Any OpenAI-compatible bridge in front of `opencode serve`. Override model + port below.",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseURL: "http://localhost:11434/v1",
    model: "llama3.1",
    needsKey: false,
    hint: "Run `OLLAMA_ORIGINS=http://localhost:5173 ollama serve` so the browser can reach it.",
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    baseURL: "http://localhost:1234/v1",
    model: "local-model",
    needsKey: false,
    hint: "Enable CORS in LM Studio server settings.",
  },
  {
    id: "openrouter",
    label: "OpenRouter (hosted)",
    baseURL: "https://openrouter.ai/api/v1",
    model: "openai/gpt-5-mini",
    needsKey: true,
    hint: "One key for 300+ models. Data leaves your machine.",
  },
  {
    id: "openai",
    label: "OpenAI (hosted)",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    needsKey: true,
    hint: "Data leaves your machine. Prefer local for sensitive finances.",
  },
  {
    id: DEMO_PROVIDER_ID,
    label: "Demo (free models, shared key)",
    baseURL: DEMO_DIRECT_BASE_URL,
    model: DEMO_DEFAULT_MODEL,
    needsKey: false,
    hint: "Zero setup: shared key, free models only. Your finance snapshot is sent to OpenRouter.",
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    baseURL: "http://localhost:4000/v1",
    model: "custom-model",
    needsKey: false,
    hint: "vLLM, LiteLLM proxy, or anything speaking /chat/completions.",
  },
]

/**
 * Presets the user may pick right now. The demo preset is hidden unless a
 * demo key was baked in at build time (VITE_OPENROUTER_DEMO_KEY), so local
 * dev without the key behaves exactly as before.
 */
export function visibleAssistantPresets(): readonly AssistantProviderPreset[] {
  if (isDemoModeAvailable()) return ASSISTANT_PRESETS
  return ASSISTANT_PRESETS.filter((preset) => preset.id !== DEMO_PROVIDER_ID)
}

export interface AssistantSettings {
  provider: AssistantProviderId
  baseURL: string
  model: string
  apiKey: string
  thinking: ThinkingLevel
  /**
   * Desktop only: persist the key in the OS keychain. Always true on first
   * run in the binary (owner decision 2026-09-06); the checkbox opts out to
   * memory-only. Ignored on web, where keys are never persisted.
   */
  rememberKey: boolean
}

export const ASSISTANT_SETTINGS_KEY = "budgetlens.assistant.v1"
export const ASSISTANT_OPEN_KEY = "budgetlens.assistant.open.v1"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function isAssistantProviderId(value: unknown): value is AssistantProviderId {
  return typeof value === "string" && ASSISTANT_PRESETS.some((preset) => preset.id === value)
}

function presetFor(provider: AssistantProviderId): AssistantProviderPreset {
  const fallback = ASSISTANT_PRESETS[0]
  if (!fallback) throw new Error("Assistant presets are not configured.")
  return ASSISTANT_PRESETS.find((item) => item.id === provider) ?? fallback
}

export function defaultSettingsFor(provider: AssistantProviderId): AssistantSettings {
  const preset = presetFor(provider)
  return {
    provider: preset.id,
    baseURL: preset.baseURL,
    model: preset.model,
    apiKey: "",
    thinking: DEFAULT_THINKING_LEVEL,
    rememberKey: isTauriSync(),
  }
}

function asThinkingLevel(value: unknown): ThinkingLevel {
  return (
    THINKING_LEVELS.find((level): level is ThinkingLevel => level === value) ??
    DEFAULT_THINKING_LEVEL
  )
}

function asText(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback
}

/**
 * Persistable copy of settings: API keys never touch clear-text storage.
 * localStorage keeps settings with the key blanked; on desktop the OS
 * keychain holds remembered keys. This also guarantees the baked demo key
 * (resolved at send time, never stored in settings) can't leak into storage.
 */
export function toPersistableSettings(settings: AssistantSettings): AssistantSettings {
  return { ...settings, apiKey: "" }
}

export function readAssistantSettings(storage: Pick<Storage, "getItem">): AssistantSettings {
  const fallback = defaultSettingsFor("opencode-bridge")
  try {
    const raw = storage.getItem(ASSISTANT_SETTINGS_KEY)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return fallback
    const storedProvider = isAssistantProviderId(parsed.provider) ? parsed.provider : null
    // A stored demo selection from a keyed build (e.g. Pages) means nothing in
    // a keyless build (local dev): fall back so behavior is exactly as before.
    const provider =
      storedProvider === DEMO_PROVIDER_ID && !isDemoModeAvailable()
        ? fallback.provider
        : (storedProvider ?? fallback.provider)
    const preset = presetFor(provider)
    return {
      provider,
      baseURL: asText(parsed.baseURL, preset.baseURL),
      model: asText(parsed.model, preset.model),
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      thinking: asThinkingLevel(parsed.thinking),
      rememberKey: typeof parsed.rememberKey === "boolean" ? parsed.rememberKey : isTauriSync(),
    }
  } catch {
    return fallback
  }
}

export interface ChatFunctionTool {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

interface ChatCompletionsMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: Array<{
    id: string
    type: "function"
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

export interface ProviderToolCall {
  id: string
  name: string
  args: unknown
}

export interface ProviderTurnResult {
  content: string
  toolCalls: ProviderToolCall[]
}

function joinURL(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/+$/, "")}${path}`
}

function parseToolArgs(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw) return {}
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return {}
  }
}

function extractTurnMessage(payload: unknown): ProviderTurnResult {
  if (!isRecord(payload)) return { content: "", toolCalls: [] }
  const choices = payload.choices
  if (!Array.isArray(choices)) return { content: "", toolCalls: [] }
  const first: unknown = choices[0]
  if (!isRecord(first)) return { content: "", toolCalls: [] }
  const message: unknown = first.message
  if (!isRecord(message)) return { content: "", toolCalls: [] }
  const content = typeof message.content === "string" ? message.content : ""
  const toolCalls: ProviderToolCall[] = []
  if (Array.isArray(message.tool_calls)) {
    for (const entry of message.tool_calls) {
      if (!isRecord(entry)) continue
      const fn: unknown = entry.function
      if (typeof entry.id !== "string" || !isRecord(fn)) continue
      if (typeof fn.name !== "string") continue
      toolCalls.push({ id: entry.id, name: fn.name, args: parseToolArgs(fn.arguments) })
    }
  }
  return { content, toolCalls }
}

function extractContent(payload: unknown): string {
  return extractTurnMessage(payload).content
}

export const PROVIDER_REQUEST_TIMEOUT_MS = 120_000

/**
 * Free-model allowlist gate: whenever the shared demo key is active, reject
 * anything but an allowlisted ":free" id. The baked key is extractable from
 * the JS bundle, so this (plus the capped OpenRouter key) is what keeps theft
 * harmless. Single choke point: both requestChatTurn and sendToolResults go
 * through postChatCompletions.
 */
function assertDemoModelAllowed(baseURL: string, apiKey: string, model: string): void {
  if (!isDemoRequest(baseURL, apiKey) || isDemoModelAllowed(model)) return
  throw new Error(
    `Demo mode only allows free models (got ${JSON.stringify(model)}). Pick one of the allowlisted :free models.`,
  )
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/**
 * This @tauri-apps/api version has no invoke-level AbortSignal support, so
 * race the command against the caller's signal. The Rust side still enforces
 * its own timeout; a late resolution is dropped here so Stop stays responsive.
 */
function invokeWithAbort<T>(
  command: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("Aborted", "AbortError"))
    }
    signal.addEventListener("abort", onAbort, { once: true })
    invoke<T>(command, args).then(
      (value) => {
        signal.removeEventListener("abort", onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort)
        reject(error)
      },
    )
  })
}

async function postChatCompletions(options: {
  baseURL: string
  apiKey: string
  model: string
  messages: ChatCompletionsMessage[]
  tools?: ChatFunctionTool[]
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<unknown> {
  assertDemoModelAllowed(options.baseURL, options.apiKey, options.model)
  // Desktop binary: route through the Rust proxy (no WebView Origin, so no
  // CORS preflight; keys stay out of the JS bundle when remembered).
  if (isTauriSync()) {
    return await invokeWithAbort<unknown>(
      "llm_chat",
      {
        baseUrl: options.baseURL,
        apiKey: options.apiKey || null,
        model: options.model,
        messages: options.messages,
        tools: options.tools && options.tools.length > 0 ? options.tools : null,
      },
      withTimeout(options.signal, options.timeoutMs ?? PROVIDER_REQUEST_TIMEOUT_MS),
    )
  }

  const response = await fetch(joinURL(options.baseURL, "/chat/completions"), {
    method: "POST",
    signal: withTimeout(options.signal, options.timeoutMs ?? PROVIDER_REQUEST_TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      ...(options.tools && options.tools.length > 0
        ? { tools: options.tools, tool_choice: "auto" }
        : {}),
      temperature: 0.2,
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(
      `Provider ${response.status}: ${detail.slice(0, 300) || response.statusText || "request failed"}`,
    )
  }
  return (await response.json()) as unknown
}

export async function requestChatTurn(options: {
  baseURL: string
  apiKey: string
  model: string
  system: string
  history: Array<{ role: "user" | "assistant"; content: string }>
  tools: ChatFunctionTool[]
  signal?: AbortSignal
}): Promise<ProviderTurnResult> {
  const messages: ChatCompletionsMessage[] = [
    { role: "system", content: options.system },
    ...options.history.map((item) => ({ role: item.role, content: item.content })),
  ]

  const withTools = options.tools.length > 0
  try {
    const payload = await postChatCompletions({
      baseURL: options.baseURL,
      apiKey: options.apiKey,
      model: options.model,
      messages,
      tools: options.tools,
      ...(options.signal ? { signal: options.signal } : {}),
    })
    return extractTurnMessage(payload)
  } catch (error) {
    // Local proxies often 400 on unknown fields (tools/tool_choice) or on
    // models without function calling: retry the same turn as plain completion.
    if (withTools && isRetryableToolError(error)) {
      const payload = await postChatCompletions({
        baseURL: options.baseURL,
        apiKey: options.apiKey,
        model: options.model,
        messages,
        ...(options.signal ? { signal: options.signal } : {}),
      })
      return extractTurnMessage(payload)
    }
    throw error
  }
}

function isRetryableToolError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Provider 4\d\d|tool_choice|function.?call|unsupported/i.test(message)
}

function isLoopbackHost(host: string): boolean {
  const bare = host.toLowerCase().replace(/^\[|\]$/g, "")
  return bare === "localhost" || bare === "127.0.0.1" || bare === "::1"
}

/** True for loopback base URLs (desktop Ollama/LM Studio/bridge): data stays local. */
export function isLocalBaseURL(baseURL: string): boolean {
  try {
    return isLoopbackHost(new URL(baseURL).hostname)
  } catch {
    return baseURL.includes("localhost") || baseURL.includes("127.0.0.1")
  }
}

/**
 * List model ids from any OpenAI-compatible base (`GET {base}/models`).
 * Desktop goes through the Rust proxy; web uses fetch. Throws on HTTP
 * errors (401 = invalid key: don't save) and on empty listings.
 */
export async function listProviderModels(options: {
  baseURL: string
  apiKey: string
  signal?: AbortSignal
}): Promise<string[]> {
  if (isTauriSync()) {
    return await invokeWithAbort<string[]>(
      "llm_models",
      { baseUrl: options.baseURL, apiKey: options.apiKey || null },
      withTimeout(options.signal, 15_000),
    )
  }

  const headers: Record<string, string> = {}
  if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`
  const response = await fetch(joinURL(options.baseURL, "/models"), {
    method: "GET",
    ...(options.signal ? { signal: options.signal } : {}),
    headers,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(
      `Provider ${response.status}: ${detail.slice(0, 300) || response.statusText || "request failed"}`,
    )
  }
  const payload: unknown = (await response.json()) as unknown
  const ids = extractModelIds(payload)
  if (ids.length === 0) throw new Error("Provider listed no models.")
  return ids
}

function extractModelIds(payload: unknown): string[] {
  if (!isRecord(payload)) return []
  const data = payload.data
  if (!Array.isArray(data)) return []
  const ids: string[] = []
  for (const entry of data) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id) continue
    if (!ids.includes(entry.id)) ids.push(entry.id)
    if (ids.length >= 500) break
  }
  return ids
}

export async function sendToolResults(options: {
  baseURL: string
  apiKey: string
  model: string
  system: string
  history: Array<{ role: "user" | "assistant"; content: string }>
  pendingAssistantContent: string
  pendingToolCalls: ProviderToolCall[]
  toolOutputs: Array<{ id: string; name: string; output: unknown }>
  signal?: AbortSignal
}): Promise<string> {
  const messages: ChatCompletionsMessage[] = [
    { role: "system", content: options.system },
    ...options.history.map((item) => ({ role: item.role, content: item.content })),
    {
      role: "assistant",
      content: options.pendingAssistantContent || null,
      tool_calls: options.pendingToolCalls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
      })),
    },
    ...options.toolOutputs.map((item) => ({
      role: "tool" as const,
      content: JSON.stringify(item.output).slice(0, 8_000),
      tool_call_id: item.id,
    })),
  ]

  const payload = await postChatCompletions({
    baseURL: options.baseURL,
    apiKey: options.apiKey,
    model: options.model,
    messages,
    ...(options.signal ? { signal: options.signal } : {}),
  })
  return extractContent(payload) || "Done."
}

export function formatMinor(amountMinor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)
}
