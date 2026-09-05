import {
  DEFAULT_THINKING_LEVEL,
  THINKING_LEVELS,
  type ThinkingLevel,
} from "@/features/assistant/thinking-select"

export type AssistantProviderId =
  | "opencode-harness"
  | "opencode-bridge"
  | "ollama"
  | "lmstudio"
  | "openrouter"
  | "openai"
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
    id: "custom",
    label: "Custom OpenAI-compatible",
    baseURL: "http://localhost:4000/v1",
    model: "custom-model",
    needsKey: false,
    hint: "vLLM, LiteLLM proxy, or anything speaking /chat/completions.",
  },
]

export interface AssistantSettings {
  provider: AssistantProviderId
  baseURL: string
  model: string
  apiKey: string
  thinking: ThinkingLevel
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

export function readAssistantSettings(storage: Pick<Storage, "getItem">): AssistantSettings {
  const fallback = defaultSettingsFor("opencode-bridge")
  try {
    const raw = storage.getItem(ASSISTANT_SETTINGS_KEY)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return fallback
    const provider = isAssistantProviderId(parsed.provider) ? parsed.provider : fallback.provider
    const preset = presetFor(provider)
    return {
      provider,
      baseURL: asText(parsed.baseURL, preset.baseURL),
      model: asText(parsed.model, preset.model),
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      thinking: asThinkingLevel(parsed.thinking),
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

async function postChatCompletions(options: {
  baseURL: string
  apiKey: string
  model: string
  messages: ChatCompletionsMessage[]
  tools?: ChatFunctionTool[]
  signal?: AbortSignal
}): Promise<unknown> {
  const response = await fetch(joinURL(options.baseURL, "/chat/completions"), {
    method: "POST",
    ...(options.signal ? { signal: options.signal } : {}),
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

  const payload = await postChatCompletions({
    baseURL: options.baseURL,
    apiKey: options.apiKey,
    model: options.model,
    messages,
    tools: options.tools,
    ...(options.signal ? { signal: options.signal } : {}),
  })
  return extractTurnMessage(payload)
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
