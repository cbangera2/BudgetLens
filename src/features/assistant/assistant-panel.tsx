import {
  Bot,
  FileText,
  MessageCircle,
  Pencil,
  Search,
  Send,
  Settings,
  Square,
  Terminal,
  Trash2,
  Wrench,
  X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { repositories } from "@/db/repositories"
import {
  ASSISTANT_SYSTEM_PROMPT,
  ASSISTANT_TOOL_SCHEMAS,
  buildFinanceSnapshot,
  executeAssistantTool,
  parseBudgetProposal,
  type BudgetProposal,
} from "@/features/assistant/data-tools"
import { Markdown } from "@/features/assistant/markdown"
import { ModelSelect } from "@/features/assistant/model-select"
import {
  ASSISTANT_PRESETS,
  ASSISTANT_SETTINGS_KEY,
  isAssistantProviderId,
  readAssistantSettings,
  requestChatTurn,
  sendToolResults,
  type AssistantProviderId,
  type AssistantSettings,
} from "@/features/assistant/provider"

interface ToolTrace {
  id: string
  name: string
  summary: string
}

interface PanelMessage {
  id: string
  role: "user" | "assistant"
  content: string
  trace?: ToolTrace[]
}

const SUGGESTIONS = [
  "Where did my money go last month?",
  "Am I over budget anywhere?",
  "How is my net worth trending?",
]

function messageId(): string {
  return globalThis.crypto.randomUUID()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseHarnessResponse(payload: unknown): {
  content: string
  trace: ToolTrace[]
  sessionId?: string
} | null {
  if (!isRecord(payload)) return null
  if (typeof payload.content !== "string") return null
  const trace: ToolTrace[] = []
  if (Array.isArray(payload.toolEvents)) {
    for (const entry of payload.toolEvents) {
      if (!isRecord(entry) || typeof entry.name !== "string") continue
      trace.push({
        id: typeof entry.id === "string" ? entry.id : messageId(),
        name: entry.name,
        summary: typeof entry.summary === "string" ? entry.summary : entry.name,
      })
    }
  }
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : undefined
  return sessionId
    ? { content: payload.content, trace, sessionId }
    : { content: payload.content, trace }
}

function toolIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes("read") || lower.includes("glob") || lower.includes("file")) return FileText
  if (lower.includes("edit") || lower.includes("write") || lower.includes("patch")) return Pencil
  if (lower.includes("bash") || lower.includes("shell") || lower.includes("exec")) return Terminal
  if (lower.includes("grep") || lower.includes("search") || lower.includes("find")) return Search
  return Wrench
}

interface HarnessModelOption {
  id: string
  name: string
  provider: string
  free?: boolean
}

function summarizeToolOutput(name: string, output: unknown): string {
  const text = JSON.stringify(output)
  return `${name}: ${text.length > 220 ? `${text.slice(0, 220)}…` : text}`
}

export function AssistantFab({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      size="icon"
      aria-label="Open assistant"
      title="Ask about your finances"
      onClick={onOpen}
      className="fixed right-5 bottom-5 z-50 size-14 rounded-full shadow-xl transition-transform hover:scale-105"
    >
      <MessageCircle className="size-6" aria-hidden="true" />
    </Button>
  )
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<AssistantSettings>(() =>
    readAssistantSettings(window.localStorage),
  )
  const [showSettings, setShowSettings] = useState(false)
  const [messages, setMessages] = useState<PanelMessage[]>([])
  const [harnessSessionId, setHarnessSessionId] = useState<string | undefined>(undefined)
  const [harnessModels, setHarnessModels] = useState<HarnessModelOption[] | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [customModel, setCustomModel] = useState(false)
  const [proposal, setProposal] = useState<(BudgetProposal & { id: string }) | null>(null)
  const [proposalState, setProposalState] = useState<"idle" | "applied" | "applying">("idle")
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    window.localStorage.setItem(ASSISTANT_SETTINGS_KEY, JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, busy])

  useEffect(() => () => abortRef.current?.abort(), [])

  function updateSettings(patch: Partial<AssistantSettings>) {
    setSettings((current) => ({ ...current, ...patch }))
  }

  function selectProvider(provider: AssistantProviderId) {
    const preset = ASSISTANT_PRESETS.find((item) => item.id === provider)
    if (!preset) return
    setCustomModel(false)
    setHarnessSessionId(undefined)
    setSettings((current) => ({
      ...current,
      provider,
      baseURL: preset.baseURL,
      model: preset.model,
    }))
  }

  const modelsRequestedRef = useRef(false)

  const loadHarnessModels = useCallback(async () => {
    setModelsLoading(true)
    setModelsError(null)
    try {
      const response = await fetch("/api/models")
      const payload: unknown = (await response.json()) as unknown
      if (!response.ok || !isRecord(payload) || !Array.isArray(payload.models)) {
        const detail = isRecord(payload) && typeof payload.error === "string" ? payload.error : null
        throw new Error(detail ?? `Model list responded ${response.status}.`)
      }
      const models: HarnessModelOption[] = []
      for (const entry of payload.models) {
        if (!isRecord(entry) || typeof entry.id !== "string") continue
        models.push({
          id: entry.id,
          name: typeof entry.name === "string" ? entry.name : entry.id,
          provider: typeof entry.provider === "string" ? entry.provider : "other",
          ...(entry.free === true ? { free: true as const } : {}),
        })
      }
      setHarnessModels(models)
      if (!models.some((model) => model.id === settings.model)) setCustomModel(true)
    } catch (caught) {
      setModelsError(caught instanceof Error ? caught.message : "Could not load opencode models.")
      setCustomModel(true)
    } finally {
      setModelsLoading(false)
    }
  }, [settings.model])

  useEffect(() => {
    if (showSettings && settings.provider === "opencode-harness" && !modelsRequestedRef.current) {
      modelsRequestedRef.current = true
      void loadHarnessModels()
    }
  }, [showSettings, settings.provider, loadHarnessModels])

  async function handleHarnessSend(nextMessages: PanelMessage[], controller: AbortController) {
    const snapshot = await buildFinanceSnapshot(repositories)
    const history = nextMessages
      .filter((item) => item.content)
      .slice(-10)
      .map((item) => ({ role: item.role, content: item.content }))

    const response = await fetch("/api/chat", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: history,
        snapshot,
        model: settings.model || undefined,
        ...(harnessSessionId ? { sessionId: harnessSessionId } : {}),
      }),
    })
    const payload: unknown = (await response.json()) as unknown
    if (!response.ok) {
      const detail = isRecord(payload) && typeof payload.error === "string" ? payload.error : null
      throw new Error(detail ?? `Harness endpoint ${response.status}. Run \`pnpm dev\` locally.`)
    }
    const turn = parseHarnessResponse(payload)
    if (!turn) throw new Error("Harness returned an unreadable response.")
    if (turn.sessionId) setHarnessSessionId(turn.sessionId)
    setMessages((current) => [
      ...current,
      {
        id: messageId(),
        role: "assistant",
        content: turn.content || "The harness returned no text.",
        ...(turn.trace.length > 0 ? { trace: turn.trace } : {}),
      },
    ])
  }

  async function handleSend(event?: React.FormEvent, presetText?: string) {
    event?.preventDefault()
    const question = (presetText ?? input).trim()
    if (!question || busy) return
    setError(null)
    setProposalState("idle")
    const userMessage: PanelMessage = { id: messageId(), role: "user", content: question }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput("")
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      if (settings.provider === "opencode-harness") {
        await handleHarnessSend(nextMessages, controller)
        return
      }
      const history = nextMessages
        .filter((item) => item.content)
        .slice(-10)
        .map((item) => ({ role: item.role, content: item.content }))

      const turn = await requestChatTurn({
        baseURL: settings.baseURL,
        apiKey: settings.apiKey,
        model: settings.model,
        system: ASSISTANT_SYSTEM_PROMPT,
        history,
        tools: ASSISTANT_TOOL_SCHEMAS,
        signal: controller.signal,
      })

      if (turn.toolCalls.length === 0) {
        setMessages((current) => [
          ...current,
          {
            id: messageId(),
            role: "assistant",
            content: turn.content || "No response from provider.",
          },
        ])
        return
      }

      const trace: ToolTrace[] = []
      const toolOutputs: Array<{ id: string; name: string; output: unknown }> = []
      for (const call of turn.toolCalls.slice(0, 4)) {
        // oxlint-disable-next-line no-await-in-loop -- Tool calls run in model order for a readable trace.
        const output = await executeAssistantTool(repositories, call.name, call.args)
        trace.push({
          id: call.id,
          name: call.name,
          summary: summarizeToolOutput(call.name, output),
        })
        toolOutputs.push({ id: call.id, name: call.name, output })
        if (call.name === "propose_budget_change") {
          const draft = parseBudgetProposal(output)
          if (draft) {
            setProposal({ ...draft, id: messageId() })
            setProposalState("idle")
          }
        }
      }

      const finalAnswer = await sendToolResults({
        baseURL: settings.baseURL,
        apiKey: settings.apiKey,
        model: settings.model,
        system: ASSISTANT_SYSTEM_PROMPT,
        history,
        pendingAssistantContent: turn.content,
        pendingToolCalls: turn.toolCalls,
        toolOutputs,
        signal: controller.signal,
      })

      setMessages((current) => [
        ...current,
        { id: messageId(), role: "assistant", content: finalAnswer, trace },
      ])
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return
      setError(caught instanceof Error ? caught.message : "Assistant request failed.")
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  async function applyProposal() {
    if (!proposal || proposalState !== "idle") return
    setProposalState("applying")
    try {
      const timestamp = new Date().toISOString()
      await repositories.budgets.put({
        id: messageId(),
        category: proposal.category,
        amountMinor: proposal.amountMinor,
        period: proposal.period,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      setProposalState("applied")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not apply budget.")
      setProposalState("idle")
    }
  }

  const preset = ASSISTANT_PRESETS.find((item) => item.id === settings.provider)

  return (
    <section
      aria-label="BudgetLens assistant"
      className="assistant-window fixed inset-x-4 bottom-4 z-50 flex h-[min(40rem,calc(100dvh-6rem))] max-h-[calc(100dvh-3rem)] min-h-[22rem] [resize:both] flex-col overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[26rem] sm:max-w-[calc(100vw-2rem)] sm:min-w-[20rem]"
    >
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <Bot className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Assistant</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${busy ? "animate-pulse bg-amber-500" : "bg-emerald-500"}`}
            />
            {busy ? "Thinking…" : (preset?.label ?? settings.provider)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Assistant settings"
          title="Assistant settings"
          aria-expanded={showSettings}
          onClick={() => setShowSettings((value) => !value)}
        >
          <Settings className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Clear conversation"
          title="Clear conversation"
          onClick={() => {
            setMessages([])
            setProposal(null)
            setHarnessSessionId(undefined)
            setError(null)
          }}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Close assistant"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>

      {showSettings && (
        <div className="grid gap-2 border-b p-4 text-xs">
          <label className="grid gap-1" htmlFor="assistant-provider">
            <span className="font-medium">Provider preset</span>
            <select
              id="assistant-provider"
              className="h-9 rounded-xl border border-input bg-background px-2"
              value={settings.provider}
              onChange={(event) => {
                if (isAssistantProviderId(event.target.value)) selectProvider(event.target.value)
              }}
            >
              {ASSISTANT_PRESETS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {settings.provider === "opencode-harness" ? (
            <div className="grid gap-1">
              <span id="assistant-model-label" className="font-medium">
                Opencode model
              </span>
              {harnessModels && !customModel ? (
                <ModelSelect
                  models={harnessModels}
                  value={settings.model}
                  onChange={(id) => updateSettings({ model: id })}
                  onCustom={() => setCustomModel(true)}
                />
              ) : (
                <Input
                  id="assistant-model"
                  aria-labelledby="assistant-model-label"
                  value={settings.model}
                  onChange={(event) => updateSettings({ model: event.target.value })}
                  placeholder="provider/model"
                />
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={modelsLoading}
                  onClick={() => {
                    modelsRequestedRef.current = true
                    void loadHarnessModels()
                  }}
                >
                  {modelsLoading ? "Loading…" : "Reload models"}
                </Button>
                {harnessModels && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full"
                    onClick={() => setCustomModel((value) => !value)}
                  >
                    {customModel ? "Pick from list" : "Custom id"}
                  </Button>
                )}
              </div>
              {harnessModels && (
                <span className="text-muted-foreground">
                  {harnessModels.length} models from your enabled opencode providers
                </span>
              )}
              {modelsError && <p className="text-muted-foreground">{modelsError}</p>}
            </div>
          ) : (
            <label className="grid gap-1" htmlFor="assistant-model">
              <span className="font-medium">Model</span>
              <Input
                id="assistant-model"
                value={settings.model}
                onChange={(event) => updateSettings({ model: event.target.value })}
              />
            </label>
          )}
          {settings.provider !== "opencode-harness" && (
            <>
              <label className="grid gap-1" htmlFor="assistant-base-url">
                <span className="font-medium">Base URL (OpenAI-compatible)</span>
                <Input
                  id="assistant-base-url"
                  value={settings.baseURL}
                  onChange={(event) => updateSettings({ baseURL: event.target.value })}
                  placeholder="http://127.0.0.1:11435/v1"
                  inputMode="url"
                />
              </label>
              <label className="grid gap-1" htmlFor="assistant-key">
                <span className="font-medium">API key (optional)</span>
                <Input
                  id="assistant-key"
                  type="password"
                  autoComplete="off"
                  value={settings.apiKey}
                  onChange={(event) => updateSettings({ apiKey: event.target.value })}
                  placeholder="sk-…"
                />
              </label>
            </>
          )}
          {preset?.hint && <p className="text-muted-foreground">{preset.hint}</p>}
        </div>
      )}

      <div
        ref={logRef}
        role="log"
        aria-label="Assistant conversation"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && !busy && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-muted">
              <Bot className="size-6 text-muted-foreground" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold">How can I help?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                I query your local data with capped tools. Nothing is written without approval.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    void handleSend(undefined, suggestion)
                  }}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((item) =>
          item.role === "user" ? (
            <div key={item.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                {item.content}
              </p>
            </div>
          ) : (
            <div key={item.id} className="flex justify-start">
              <div className="max-w-[92%] space-y-2 rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-sm">
                <Markdown text={item.content} id={item.id} />
                {item.trace && item.trace.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">
                      {item.trace.length} tool{item.trace.length > 1 ? "s" : ""} used
                    </summary>
                    <ul className="mt-1.5 space-y-1.5">
                      {item.trace.map((tool) => {
                        const Icon = toolIcon(tool.name)
                        return (
                          <li
                            key={tool.id}
                            title={tool.summary}
                            className="flex items-start gap-2 rounded-lg bg-background/60 p-2"
                          >
                            <Icon
                              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{tool.name}</span>
                              <span className="block truncate text-muted-foreground">
                                {tool.summary}
                              </span>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          ),
        )}

        {busy && (
          <div className="flex justify-start" aria-label="Assistant is thinking">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-muted px-4 py-3">
              <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
              <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
              <span className="typing-dot size-1.5 rounded-full bg-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {proposal && (
        <div className="border-t px-4 py-3">
          <section
            aria-label="Budget proposal awaiting approval"
            className="rounded-2xl border border-dashed p-3 text-xs"
          >
            <p className="font-semibold">
              Proposed budget {proposalState === "applied" ? "applied ✓" : "needs approval"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {proposal.category} · {(proposal.amountMinor / 100).toFixed(2)} · {proposal.period}
            </p>
            {proposalState !== "applied" && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    void applyProposal()
                  }}
                  disabled={proposalState === "applying"}
                >
                  {proposalState === "applying" ? "Applying…" : "Approve + apply"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setProposal(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}
          </section>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mx-4 mb-2 rounded-xl border border-destructive/40 bg-destructive/10 p-2 text-xs"
        >
          {error} Check base URL / model / CORS (opencode serve needs `--cors
          http://localhost:5173`).
        </p>
      )}

      <form
        onSubmit={(event) => {
          void handleSend(event)
        }}
        className="flex items-center gap-2 border-t p-3"
      >
        <Input
          aria-label="Ask the assistant"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about spending, budgets…"
          disabled={busy}
          className="rounded-full"
        />
        {busy ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Stop assistant"
            className="shrink-0 rounded-full"
            onClick={() => abortRef.current?.abort()}
          >
            <Square className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            disabled={!input.trim()}
            className="shrink-0 rounded-full"
          >
            <Send className="size-4" aria-hidden="true" />
          </Button>
        )}
      </form>
    </section>
  )
}
