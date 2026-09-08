import { invoke } from "@tauri-apps/api/core"

import {
  DEMO_DIRECT_BASE_URL,
  DEMO_PROVIDER_ID,
  isDemoModeAvailable,
  isDemoRequest,
  isPublicDemoBuild,
} from "@/features/assistant/demo-endpoint"
import { DEMO_DEFAULT_MODEL, isDemoModelAllowed } from "@/features/assistant/demo-models"
import {
  DEFAULT_THINKING_LEVEL,
  THINKING_LEVELS,
  type ThinkingLevel,
} from "@/features/assistant/thinking-select"
import { isNativeCapacitorSync } from "@/lib/isNative"
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
 * Presets the user may pick right now. The demo preset is hidden unless demo
 * mode is available (relay URL or baked key), so keyless local dev behaves
 * exactly as before. The public demo build (GitHub Pages) and the native iOS
 * shell additionally hide local-only presets that cannot work there — the
 * harness needs pnpm dev and loopback URLs are unreachable from the phone;
 * hosted BYOK presets stay as an escape hatch.
 */
export function visibleAssistantPresets(): readonly AssistantProviderPreset[] {
  let presets = ASSISTANT_PRESETS
  if (isPublicDemoBuild() || isNativeCapacitorSync()) {
    presets = presets.filter((preset) => !LOCAL_ONLY_PROVIDER_IDS.has(preset.id))
  }
  if (!isDemoModeAvailable()) {
    presets = presets.filter((preset) => preset.id !== DEMO_PROVIDER_ID)
  }
  return presets
}

const LOCAL_ONLY_PROVIDER_IDS: ReadonlySet<AssistantProviderId> = new Set([
  "opencode-harness",
  "opencode-bridge",
  "ollama",
  "lmstudio",
  "custom",
])

/**
 * Default provider for fresh settings: demo on the public build, demo or
 * OpenRouter on native (loopback bridges are unreachable from the phone),
 * bridge otherwise.
 */
export function defaultProvider(): AssistantProviderId {
  if (isNativeCapacitorSync()) {
    return isDemoModeAvailable() ? DEMO_PROVIDER_ID : "openrouter"
  }
  return isPublicDemoBuild() && isDemoModeAvailable() ? DEMO_PROVIDER_ID : "opencode-bridge"
}

export interface AssistantSettings {
  provider: AssistantProviderId
  baseURL: string
  model: string
  apiKey: string
  thinking: ThinkingLevel
  /**
   * Desktop and native only: persist the key in the OS keychain. Always true
   * on first run in the binary or shell (owner decision 2026-09-06); the
   * checkbox opts out to memory-only. Ignored on web, where keys are never
   * persisted.
   */
  rememberKey: boolean
  /**
   * Explicit opt-in before the first hosted send (any non-loopback,
   * non-harness provider). Persisted once approved; revoke by toggling the
   * provider or clearing site data. Local-only providers never need it.
   */
  hostedConsent: boolean
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
    rememberKey: isTauriSync() || isNativeCapacitorSync(),
    hostedConsent: false,
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
  const fallback = defaultSettingsFor(defaultProvider())
  try {
    const raw = storage.getItem(ASSISTANT_SETTINGS_KEY)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return fallback
    const storedProvider = isAssistantProviderId(parsed.provider) ? parsed.provider : null
    // A stored selection hidden in this build (demo without credentials, or
    // a local-only preset on the public build) falls back to the default, so
    // the panel always opens on something that works here.
    const visibleIds = new Set(visibleAssistantPresets().map((preset) => preset.id))
    const provider =
      storedProvider && visibleIds.has(storedProvider) ? storedProvider : fallback.provider
    const preset = presetFor(provider)
    return {
      provider,
      baseURL: asText(parsed.baseURL, preset.baseURL),
      model: asText(parsed.model, preset.model),
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      thinking: asThinkingLevel(parsed.thinking),
      rememberKey:
        typeof parsed.rememberKey === "boolean"
          ? parsed.rememberKey
          : isTauriSync() || isNativeCapacitorSync(),
      hostedConsent: parsed.hostedConsent === true,
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

/** Progressive content callback: invoked with the full content accumulated so far. */
export type ChatStreamProgress = (contentSoFar: string) => void

function attachPartialContent(error: unknown, partialContent: string): Error {
  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" && error ? error : "Stream failed")
  try {
    ;(err as Error & { partialContent?: string }).partialContent = partialContent
  } catch {
    // Read-only error shape: fall through with the bare error.
  }
  return err
}

/**
 * Partial content accumulated before a mid-stream failure or abort. The panel
 * uses this as a fallback when its own streaming snapshot is stale, so what
 * arrived is still surfaced alongside the error.
 */
export function getPartialContent(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null
  const partial: unknown = (error as { partialContent?: unknown }).partialContent
  return typeof partial === "string" ? partial : null
}

function errorName(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null
  const name: unknown = (error as { name?: unknown }).name
  return typeof name === "string" ? name : null
}

/**
 * Realm-safe abort check: fetch/stream aborts can come from another
 * DOMException realm (undici vs jsdom), where `instanceof DOMException`
 * fails despite the AbortError contract. The name is the stable signal.
 */
function isAbortError(error: unknown): boolean {
  return errorName(error) === "AbortError"
}

function normalizedAbortError(partialContent: string): DOMException {
  const err = new DOMException("Aborted", "AbortError")
  try {
    ;(err as DOMException & { partialContent?: string }).partialContent = partialContent
  } catch {
    // Read-only error shape: fall through with the bare abort.
  }
  return err
}

/**
 * A provider rejected `stream: true` (unknown field, unsupported, disabled).
 * Requires a stream mention plus a 4xx/unsupported signal so ordinary tool
 * errors keep flowing to the tool fallback instead of the stream fallback.
 */
function isStreamNotSupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  return (
    /stream/i.test(message) &&
    /Provider 4\d\d|unsupported|unknown|unrecognized|invalid|not supported/i.test(message)
  )
}

interface StreamToolState {
  id: string
  name: string
  arguments: string
}

interface StreamAccumulator {
  content: string
  tools: StreamToolState[]
}

function streamErrorDetail(errorValue: unknown): string {
  if (typeof errorValue === "string" && errorValue) return errorValue
  if (isRecord(errorValue)) {
    const message: unknown = errorValue.message
    if (typeof message === "string" && message) return message
  }
  return "stream failed"
}

function ensureToolState(acc: StreamAccumulator, index: number): StreamToolState {
  while (acc.tools.length <= index) acc.tools.push({ id: "", name: "", arguments: "" })
  const state = acc.tools[index]
  if (!state) throw new Error("Stream tool state is missing.")
  return state
}

function applyStreamDelta(
  acc: StreamAccumulator,
  event: unknown,
  onContent?: ChatStreamProgress,
): void {
  if (!isRecord(event)) return
  const choices: unknown = event.choices
  if (!Array.isArray(choices)) return
  const first: unknown = choices[0]
  if (!isRecord(first)) return
  const delta: unknown = first.delta
  if (!isRecord(delta)) return
  const content: unknown = delta.content
  if (typeof content === "string" && content) {
    acc.content += content
    onContent?.(acc.content)
  }
  const toolCalls: unknown = delta.tool_calls
  if (!Array.isArray(toolCalls)) return
  for (const entry of toolCalls) {
    if (!isRecord(entry)) continue
    const index = typeof entry.index === "number" && Number.isFinite(entry.index) ? entry.index : 0
    if (index < 0) continue
    const state = ensureToolState(acc, index)
    if (typeof entry.id === "string" && entry.id && !state.id) state.id = entry.id
    const fn: unknown = entry.function
    if (!isRecord(fn)) continue
    if (typeof fn.name === "string" && fn.name && !state.name) state.name = fn.name
    if (typeof fn.arguments === "string" && fn.arguments) state.arguments += fn.arguments
  }
}

function finalizeStreamAccumulator(acc: StreamAccumulator): ProviderTurnResult {
  const toolCalls: ProviderToolCall[] = []
  for (let index = 0; index < acc.tools.length; index += 1) {
    const state = acc.tools[index]
    if (!state || !state.name) continue
    toolCalls.push({
      id: state.id || `stream-call-${index}`,
      name: state.name,
      args: parseToolArgs(state.arguments),
    })
  }
  return { content: acc.content, toolCalls }
}

function throwIfAborted(signal: AbortSignal, partialContent: string): void {
  if (!signal.aborted) return
  // Timeouts keep their semantics (surfaced, not silently swallowed as Stop).
  if (errorName(signal.reason) === "TimeoutError") {
    throw attachPartialContent(
      new DOMException("Assistant request timed out.", "TimeoutError"),
      partialContent,
    )
  }
  throw normalizedAbortError(partialContent)
}

async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onContent?: ChatStreamProgress,
): Promise<ProviderTurnResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const acc: StreamAccumulator = { content: "", tools: [] }
  let text = ""
  let cursor = 0
  let done = false
  const handleLine = (line: string): void => {
    const trimmed = line.endsWith("\r") ? line.slice(0, -1).trim() : line.trim()
    if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) return
    const data = trimmed.slice(5).trim()
    if (!data) return
    if (data === "[DONE]") {
      done = true
      return
    }
    let event: unknown
    try {
      event = JSON.parse(data) as unknown
    } catch {
      return
    }
    if (isRecord(event) && "error" in event) {
      throw attachPartialContent(
        new Error(`Provider stream: ${streamErrorDetail(event.error)}`),
        acc.content,
      )
    }
    applyStreamDelta(acc, event, onContent)
    throwIfAborted(signal, acc.content)
  }
  try {
    for (;;) {
      throwIfAborted(signal, acc.content)
      // oxlint-disable-next-line no-await-in-loop -- Sequential stream reads.
      const read = await reader.read()
      if (read.done) break
      text += decoder.decode(read.value, { stream: true })
      let newline = text.indexOf("\n", cursor)
      while (newline >= 0) {
        handleLine(text.slice(cursor, newline))
        cursor = newline + 1
        if (done) break
        newline = text.indexOf("\n", cursor)
      }
      if (done) break
    }
    // Whatever remains at end-of-stream is complete by definition.
    if (!done) handleLine(text.slice(cursor))
    return finalizeStreamAccumulator(acc)
  } catch (error) {
    // Normalize cross-realm aborts so Stop stays recognizable via instanceof.
    if (isAbortError(error)) throw normalizedAbortError(acc.content)
    if (error instanceof DOMException || error instanceof Error) {
      if (getPartialContent(error) === null) throw attachPartialContent(error, acc.content)
      throw error
    }
    throw attachPartialContent(error, acc.content)
  } finally {
    try {
      await reader.cancel()
    } catch {
      // Reader already closed or aborted: nothing to clean up.
    }
  }
}

export const PROVIDER_REQUEST_TIMEOUT_MS = 120_000
const PROVIDER_MAX_ATTEMPTS = 3
const PROVIDER_RETRY_BASE_MS = 500
const PROVIDER_RETRY_CAP_MS = 1_500

/**
 * Retryable transport failures: dropped connections and server-side errors.
 * Never 4xx (the provider/relay told us no: bad key, bad model, or our own
 * rate limit told us to back off) and never aborts (user hit Stop, or the
 * request timed out).
 */
function isRetryableTransportError(error: unknown): boolean {
  const name = errorName(error)
  if (name === "AbortError" || name === "TimeoutError") return false
  if (error instanceof TypeError) return true
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  return /Provider 5\d\d/.test(message)
}

function transportRetryDelayMs(attempt: number): number {
  return Math.min(PROVIDER_RETRY_BASE_MS * 2 ** attempt, PROVIDER_RETRY_CAP_MS)
}

/** Backoff sleep that stays abortable so Stop stays responsive mid-retry. */
function retrySleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"))
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

/**
 * Free-model allowlist gate: whenever the shared demo key is active, reject
 * anything but an allowlisted ":free" id. The baked key is extractable from
 * the JS bundle, so this (plus the capped OpenRouter key) is what keeps theft
 * harmless. Single choke point: both requestChatTurn and sendToolResults go
 * through postChatCompletions/postChatCompletionsStream, which both enforce
 * this gate.
 */
function assertDemoModelAllowed(baseURL: string, apiKey: string, model: string): void {
  if (!isDemoRequest(baseURL, apiKey) || isDemoModelAllowed(model)) return
  throw new Error(
    `Demo mode only allows free models (got ${JSON.stringify(model)}). Pick one of the allowlisted :free models.`,
  )
}

/**
 * Combine a caller signal with a timeout without AbortSignal.any/timeout,
 * which are missing on older WebKit (iOS 17 ships neither reliably).
 * Semantics match: caller abort wins as AbortError, timeout surfaces as
 * TimeoutError, and the timer is cleared as soon as either fires.
 */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Assistant request timed out.", "TimeoutError"))
  }, timeoutMs)
  if (!signal) return controller.signal
  if (signal.aborted) {
    clearTimeout(timer)
    controller.abort(signal.reason)
    return controller.signal
  }
  signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer)
      controller.abort(signal.reason)
    },
    { once: true },
  )
  return controller.signal
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

function chatRequestBody(
  model: string,
  messages: ChatCompletionsMessage[],
  tools: ChatFunctionTool[] | undefined,
  stream: boolean,
): string {
  return JSON.stringify({
    model,
    messages,
    ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    temperature: 0.2,
    ...(stream ? { stream: true } : {}),
  })
}

function chatRequestHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  }
}

async function throwProviderError(response: Response): Promise<never> {
  const detail = await response.text().catch(() => "")
  throw new Error(
    `Provider ${response.status}: ${detail.slice(0, 300) || response.statusText || "request failed"}`,
  )
}

async function withTransportRetry<T>(
  signal: AbortSignal,
  retryable: (error: unknown) => boolean,
  run: () => Promise<T>,
): Promise<T> {
  let attempt = 0
  for (;;) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- Sequential retry attempts.
      return await run()
    } catch (error) {
      if (attempt + 1 >= PROVIDER_MAX_ATTEMPTS || !retryable(error)) throw error
      attempt += 1
      // oxlint-disable-next-line no-await-in-loop -- Sequential retry attempts.
      await retrySleep(transportRetryDelayMs(attempt - 1) + Math.floor(Math.random() * 250), signal)
    }
  }
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

  const signal = withTimeout(options.signal, options.timeoutMs ?? PROVIDER_REQUEST_TIMEOUT_MS)
  const url = joinURL(options.baseURL, "/chat/completions")
  const init = {
    method: "POST",
    signal,
    headers: chatRequestHeaders(options.apiKey),
    body: chatRequestBody(options.model, options.messages, options.tools, false),
  }
  return await withTransportRetry(signal, isRetryableTransportError, async () => {
    const response = await fetch(url, init)
    if (!response.ok) await throwProviderError(response)
    return (await response.json()) as unknown
  })
}

/**
 * Streaming `/chat/completions` transport (`stream: true` + hand-rolled SSE
 * over fetch + TextDecoder, no library). Content deltas accumulate into
 * progressive `onContent` updates; `tool_calls` deltas accumulate by index
 * (concatenating `arguments` fragments) and only reconstruct complete calls
 * on `[DONE]` — partial calls are never executed. Mid-stream failures keep
 * what arrived via `partialContent` on the thrown error; aborts stay
 * AbortError so Stop halts cleanly. Temperature and tool envelope match the
 * non-streaming path exactly.
 */
async function postChatCompletionsStream(options: {
  baseURL: string
  apiKey: string
  model: string
  messages: ChatCompletionsMessage[]
  tools?: ChatFunctionTool[]
  signal?: AbortSignal
  timeoutMs?: number
  onContent?: ChatStreamProgress
}): Promise<ProviderTurnResult> {
  assertDemoModelAllowed(options.baseURL, options.apiKey, options.model)
  // Desktop binary stays non-streaming through the Rust proxy (matching the
  // Tauri command today).
  if (isTauriSync()) {
    const payload = await postChatCompletions({
      baseURL: options.baseURL,
      apiKey: options.apiKey,
      model: options.model,
      messages: options.messages,
      ...(options.tools ? { tools: options.tools } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    })
    return extractTurnMessage(payload)
  }

  const signal = withTimeout(options.signal, options.timeoutMs ?? PROVIDER_REQUEST_TIMEOUT_MS)
  const url = joinURL(options.baseURL, "/chat/completions")
  const init = {
    method: "POST",
    signal,
    headers: chatRequestHeaders(options.apiKey),
    body: chatRequestBody(options.model, options.messages, options.tools, true),
  }
  // What already streamed must surface, never retry into a duplicate.
  const retryable = (error: unknown): boolean => {
    const partial = getPartialContent(error)
    return !(partial && partial.length > 0) && isRetryableTransportError(error)
  }
  return await withTransportRetry(signal, retryable, async () => {
    const response = await fetch(url, init)
    if (!response.ok) await throwProviderError(response)
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Test doubles stub fetch without a full Response body.
    const streamBody = (response as unknown as { body?: ReadableStream<Uint8Array> | null }).body
    if (!streamBody) {
      // Buffered mock or non-streaming proxy: parse the JSON payload as a turn.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Test doubles stub fetch without a full Response shape.
      const payload = await (response as unknown as { json: () => Promise<unknown> }).json()
      const turn = extractTurnMessage(payload)
      options.onContent?.(turn.content)
      return turn
    }
    const contentType =
      response.headers instanceof Headers ? (response.headers.get("content-type") ?? "") : ""
    if (contentType.includes("application/json")) {
      // Provider ignored `stream: true` and answered buffered JSON.
      const payload = (await response.json()) as unknown
      const turn = extractTurnMessage(payload)
      options.onContent?.(turn.content)
      return turn
    }
    return await readSSEStream(streamBody, signal, options.onContent)
  })
}

async function postTurnJson(
  baseURL: string,
  apiKey: string,
  model: string,
  messages: ChatCompletionsMessage[],
  tools: ChatFunctionTool[],
  signal: AbortSignal | undefined,
): Promise<ProviderTurnResult> {
  try {
    const payload = await postChatCompletions({
      baseURL,
      apiKey,
      model,
      messages,
      tools,
      ...(signal ? { signal } : {}),
    })
    return extractTurnMessage(payload)
  } catch (error) {
    // Local proxies often 400 on unknown fields (tools/tool_choice) or on
    // models without function calling: retry the same turn as plain completion.
    if (tools.length > 0 && isRetryableToolError(error)) {
      const payload = await postChatCompletions({
        baseURL,
        apiKey,
        model,
        messages,
        ...(signal ? { signal } : {}),
      })
      return extractTurnMessage(payload)
    }
    throw error
  }
}

async function streamFirstJsonFallback<T>(
  stream: () => Promise<T>,
  json: () => Promise<T>,
): Promise<T> {
  try {
    return await stream()
  } catch (error) {
    // Aborts and mid-stream failures (partial content present) surface as-is:
    // what arrived stays visible via onContent/partialContent, never retried.
    if (error instanceof DOMException || isAbortError(error)) throw error
    const partial = getPartialContent(error)
    if (partial && partial.length > 0) throw error
    // Provider rejected `stream: true`: retry once without it.
    if (isStreamNotSupportedError(error)) return await json()
    throw error
  }
}

export async function requestChatTurn(options: {
  baseURL: string
  apiKey: string
  model: string
  system: string
  history: Array<{ role: "user" | "assistant"; content: string }>
  tools: ChatFunctionTool[]
  signal?: AbortSignal
  onContent?: ChatStreamProgress
}): Promise<ProviderTurnResult> {
  const messages: ChatCompletionsMessage[] = [
    { role: "system", content: options.system },
    ...options.history.map((item) => ({ role: item.role, content: item.content })),
  ]

  const withTools = options.tools.length > 0
  const streamBase = {
    baseURL: options.baseURL,
    apiKey: options.apiKey,
    model: options.model,
    messages,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.onContent ? { onContent: options.onContent } : {}),
  }
  return await streamFirstJsonFallback(
    async () => {
      try {
        return await postChatCompletionsStream({ ...streamBase, tools: options.tools })
      } catch (error) {
        // Local proxies often 400 on unknown fields (tools/tool_choice):
        // retry the same turn streaming as a plain completion before giving up.
        if (
          withTools &&
          !(error instanceof DOMException) &&
          !isAbortError(error) &&
          !getPartialContent(error) &&
          isRetryableToolError(error)
        ) {
          return await postChatCompletionsStream({ ...streamBase })
        }
        throw error
      }
    },
    async () =>
      await postTurnJson(
        options.baseURL,
        options.apiKey,
        options.model,
        messages,
        options.tools,
        options.signal,
      ),
  )
}

function isRetryableToolError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Provider 4\d\d|tool_choice|function.?call|unsupported/i.test(message)
}

function isLoopbackHost(host: string): boolean {
  const bare = host.toLowerCase().replace(/^\[|\]$/g, "")
  return bare === "localhost" || bare === "::1" || bare.startsWith("127.")
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
 * Whether sending with these settings requires explicit hosted-data consent
 * first: any non-loopback, non-harness provider without a recorded opt-in.
 * Local-only providers never need it.
 */
export function needsHostedConsent(
  settings: Pick<AssistantSettings, "provider" | "baseURL" | "hostedConsent">,
): boolean {
  if (settings.hostedConsent) return false
  if (settings.provider === "opencode-harness") return false
  return !isLocalBaseURL(settings.baseURL)
}

/**
 * Native (Capacitor) transport guard. Returns a user-facing reason when the
 * configured provider cannot send from this device, or null when sending may
 * proceed. The dev harness needs pnpm dev on a computer; loopback servers are
 * unreachable from the phone; non-HTTPS custom endpoints are blocked outright.
 */
export function describeNativeBlock(
  settings: Pick<AssistantSettings, "provider" | "baseURL">,
): string | null {
  if (settings.provider === "opencode-harness") {
    return "The local agent harness needs pnpm dev on a computer and never runs on this device."
  }
  let url: URL | null = null
  try {
    url = new URL(settings.baseURL)
  } catch {
    url = null
  }
  if (!url) return "That base URL is not valid."
  if (isLoopbackHost(url.hostname)) {
    return "Local servers are unreachable from this device. Use demo mode or a hosted provider."
  }
  if (url.protocol !== "https:") {
    return "Only HTTPS endpoints are allowed on this device."
  }
  return null
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
  onContent?: ChatStreamProgress
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

  return await streamFirstJsonFallback(
    async () => {
      const turn = await postChatCompletionsStream({
        baseURL: options.baseURL,
        apiKey: options.apiKey,
        model: options.model,
        messages,
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.onContent ? { onContent: options.onContent } : {}),
      })
      return turn.content || "Done."
    },
    async () => {
      const payload = await postChatCompletions({
        baseURL: options.baseURL,
        apiKey: options.apiKey,
        model: options.model,
        messages,
        ...(options.signal ? { signal: options.signal } : {}),
      })
      return extractContent(payload) || "Done."
    },
  )
}

export function formatMinor(amountMinor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)
}
