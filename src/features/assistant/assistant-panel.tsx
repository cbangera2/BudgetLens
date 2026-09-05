import { useRouter } from "@tanstack/react-router"
import {
  Bot,
  FileText,
  History,
  Maximize2,
  MessageCircle,
  Minimize2,
  Pencil,
  Plus,
  Search,
  ServerOff,
  Settings,
  Terminal,
  Wrench,
  X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { repositories } from "@/db/repositories"
import {
  extractCitations,
  rowsFromSnapshot,
  type Cite,
  type CitationRow,
} from "@/features/assistant/citations"
import { Composer } from "@/features/assistant/composer"
import {
  ASSISTANT_SYSTEM_PROMPT,
  ASSISTANT_TOOL_SCHEMAS,
  buildFinanceSnapshot,
  executeAssistantTool,
  parseBudgetProposal,
  parseCreateTransactionProposal,
  parseDeleteTransactionProposal,
  parseRecategorizeProposal,
  type BudgetProposal,
  type CreateTransactionProposal,
  type DeleteTransactionProposal,
  type RecategorizeProposal,
} from "@/features/assistant/data-tools"
import { HistorySearch } from "@/features/assistant/history-search"
import { Markdown } from "@/features/assistant/markdown"
import { MessageActions } from "@/features/assistant/message-actions"
import { ModelSelect } from "@/features/assistant/model-select"
import { ProposalCard } from "@/features/assistant/proposal-card"
import {
  ASSISTANT_PRESETS,
  ASSISTANT_SETTINGS_KEY,
  formatMinor,
  isAssistantProviderId,
  isLocalBaseURL,
  listProviderModels,
  readAssistantSettings,
  requestChatTurn,
  sendToolResults,
  type AssistantProviderId,
  type AssistantSettings,
} from "@/features/assistant/provider"
import {
  THINKING_LEVELS,
  ThinkingSelect,
  type ThinkingLevel,
} from "@/features/assistant/thinking-select"
import { ThreadHistory } from "@/features/assistant/thread-history"
import {
  appendMessage,
  createThread,
  deleteMessages,
  deleteThread,
  listMessages,
  listThreads,
  renameThread,
  setThreadPin,
  type ThreadRecord,
} from "@/features/assistant/thread-store"
import { isTransactionSort } from "@/features/transactions/filtering"
import { clearAssistantKey, loadAssistantKey, saveAssistantKey } from "@/lib/apiKeyStore"
import { isTauriSync } from "@/lib/isTauri"

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
  citedText?: string
  cites?: Cite[]
}

const SUGGESTIONS = [
  "Where did my money go last month?",
  "Am I over budget anywhere?",
  "How is my net worth trending?",
]

const FEEDBACK_STORAGE_KEY = "budgetlens.assistant.feedback.v1"
const FEEDBACK_STORAGE_CAP = 50

const ASSISTANT_LAYOUT_KEY = "budgetlens.assistant.layout.v1"

type AssistantWindowSize = "s" | "m" | "l"

interface AssistantCustomSize {
  width: number
  height: number
}

interface AssistantWindowLayout {
  fullscreen: boolean
  size: AssistantWindowSize
  custom: AssistantCustomSize | null
}

const DEFAULT_ASSISTANT_LAYOUT: AssistantWindowLayout = {
  fullscreen: false,
  size: "m",
  custom: null,
}

const MIN_WINDOW_WIDTH = 320
const MIN_WINDOW_HEIGHT = 420

const ASSISTANT_WINDOW_SIZE_OPTIONS: Array<{ id: AssistantWindowSize; label: string }> = [
  { id: "s", label: "Compact" },
  { id: "m", label: "Regular" },
  { id: "l", label: "Wide" },
]

function isAssistantWindowSize(value: unknown): value is AssistantWindowSize {
  return value === "s" || value === "m" || value === "l"
}

function readAssistantLayout(storage: Storage): AssistantWindowLayout {
  try {
    const raw = storage.getItem(ASSISTANT_LAYOUT_KEY)
    if (!raw) return DEFAULT_ASSISTANT_LAYOUT
    const parsed: unknown = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) return DEFAULT_ASSISTANT_LAYOUT
    const custom = parsed.custom
    return {
      fullscreen: parsed.fullscreen === true,
      size: isAssistantWindowSize(parsed.size) ? parsed.size : "m",
      custom:
        isRecord(custom) &&
        typeof custom.width === "number" &&
        typeof custom.height === "number" &&
        Number.isFinite(custom.width) &&
        Number.isFinite(custom.height)
          ? {
              width: Math.min(Math.max(Math.round(custom.width), MIN_WINDOW_WIDTH), 1600),
              height: Math.min(Math.max(Math.round(custom.height), MIN_WINDOW_HEIGHT), 1200),
            }
          : null,
    }
  } catch {
    return DEFAULT_ASSISTANT_LAYOUT
  }
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return THINKING_LEVELS.some((level) => level === value)
}

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
  vision?: boolean
  reasoning?: boolean
  contextTokens?: number
}

function summarizeToolOutput(name: string, output: unknown): string {
  const text = JSON.stringify(output)
  return `${name}: ${text.length > 220 ? `${text.slice(0, 220)}…` : text}`
}

function historyOf(nextMessages: PanelMessage[]): Array<{
  role: "user" | "assistant"
  content: string
}> {
  return nextMessages
    .filter((item) => item.content)
    .slice(-10)
    .map((item) => ({ role: item.role, content: item.content }))
}

export function AssistantFab({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      size="icon"
      aria-label="Open assistant"
      title="Ask about your finances"
      onClick={onOpen}
      className="fixed right-5 bottom-5 z-40 size-14 rounded-full shadow-xl transition-transform hover:scale-105"
    >
      <MessageCircle className="size-6" aria-hidden="true" />
    </Button>
  )
}

export function AssistantPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const navigateToTransactions = useCallback(
    (href: string) => {
      // Citation hrefs carry the deploy base ("/" locally, "/BudgetLens/" on
      // Pages); strip it so router history pushes the app-relative path with
      // no full-page reload, preserving chat state.
      const base = import.meta.env.BASE_URL
      const internal = href.startsWith(base) ? href.slice(base.length - 1) : href
      router.history.push(internal || "/")
    },
    [router],
  )

  const openTransactionsView = useCallback(
    (args: unknown): Record<string, unknown> => {
      const record = isRecord(args) ? args : {}
      const params = new URLSearchParams()
      const search = typeof record.search === "string" ? record.search.trim().slice(0, 200) : ""
      if (search) params.set("q", search)
      if (Array.isArray(record.categories)) {
        const categories = record.categories.filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        )
        if (categories.length > 0) params.set("categories", categories.join(","))
      }
      const sort =
        typeof record.sort === "string" && isTransactionSort(record.sort)
          ? record.sort
          : "date-desc"
      params.set("sort", sort)
      navigateToTransactions(`${import.meta.env.BASE_URL}transactions?${params.toString()}`)
      return { opened: true, filters: params.toString() }
    },
    [navigateToTransactions],
  )
  const [settings, setSettings] = useState<AssistantSettings>(() =>
    readAssistantSettings(window.localStorage),
  )
  // Desktop binary (Tauri) vs web/Pages. Stable for the session; gates the
  // keychain, Rust transport (see provider.ts), probe, and updater UI.
  const [isDesktop] = useState(() => isTauriSync())
  const [showSettings, setShowSettings] = useState(false)
  const [layout, setLayout] = useState<AssistantWindowLayout>(() =>
    readAssistantLayout(window.localStorage),
  )
  const [messages, setMessages] = useState<PanelMessage[]>([])
  const [harnessSessionId, setHarnessSessionId] = useState<string | undefined>(undefined)
  const [harnessModels, setHarnessModels] = useState<HarnessModelOption[] | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [customModel, setCustomModel] = useState(false)
  // Direct-provider model listing (non-harness): fetched on demand, never persisted.
  const [directModels, setDirectModels] = useState<string[] | null>(null)
  const [directModelsLoading, setDirectModelsLoading] = useState(false)
  const [directModelsError, setDirectModelsError] = useState<string | null>(null)
  // Desktop localhost probe (Ollama/LM Studio/bridge): reachability hint only.
  const [probeStatus, setProbeStatus] = useState<"idle" | "checking" | "ok" | "unreachable">("idle")
  const [probeModels, setProbeModels] = useState(0)
  const [proposal, setProposal] = useState<(BudgetProposal & { id: string }) | null>(null)
  const [proposalState, setProposalState] = useState<"idle" | "applied" | "applying">("idle")
  const [recatProposal, setRecatProposal] = useState<
    (RecategorizeProposal & { id: string }) | null
  >(null)
  const [recatState, setRecatState] = useState<"idle" | "applied" | "applying">("idle")
  const [createProposal, setCreateProposal] = useState<
    (CreateTransactionProposal & { id: string }) | null
  >(null)
  const [createState, setCreateState] = useState<"idle" | "applied" | "applying">("idle")
  const [deleteProposal, setDeleteProposal] = useState<
    (DeleteTransactionProposal & { id: string }) | null
  >(null)
  const [deleteState, setDeleteState] = useState<"idle" | "applied" | "applying">("idle")
  const [threads, setThreads] = useState<ThreadRecord[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contextSummary, setContextSummary] = useState<string | null>(null)
  // null = unchecked, true = local harness endpoint reachable, false = static
  // hosting (e.g. GitHub Pages) where the harness can never run.
  const [harnessAvailable, setHarnessAvailable] = useState<boolean | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)
  const storedIdsRef = useRef<Set<string>>(new Set())
  const citeRowsRef = useRef<CitationRow[]>([])

  function finalizeAssistantMessage(content: string, trace?: ToolTrace[]): PanelMessage {
    const cited = extractCitations(content, citeRowsRef.current, import.meta.env.BASE_URL)
    return {
      id: messageId(),
      role: "assistant",
      content,
      ...(trace && trace.length > 0 ? { trace } : {}),
      ...(cited.cites.length > 0 ? { citedText: cited.text, cites: cited.cites } : {}),
    }
  }

  // Desktop keychain hydration gate: the persist effect below must not write
  // (in particular, must not clear) until the first load attempt resolves,
  // or mounting with an empty field would wipe a remembered key.
  const keySyncReadyRef = useRef(false)

  useEffect(() => {
    // API keys never touch clear-text storage: localStorage keeps settings
    // with the key blanked. On desktop the keychain holds remembered keys.
    const persistedSettings: AssistantSettings = { ...settings, apiKey: "" }
    try {
      window.localStorage.setItem(ASSISTANT_SETTINGS_KEY, JSON.stringify(persistedSettings))
    } catch {
      // Private-mode or quota failures must not break the panel.
    }
    if (isDesktop && keySyncReadyRef.current) {
      if (settings.rememberKey && settings.apiKey) {
        void saveAssistantKey(settings.provider, settings.apiKey)
      } else {
        // Opted out or cleared the field: forget the stored key.
        void clearAssistantKey(settings.provider)
      }
    }
  }, [settings, isDesktop])

  // Desktop: pull the remembered key for this provider into memory.
  useEffect(() => {
    if (!isDesktop) return () => undefined
    if (settings.rememberKey && !settings.apiKey && !keySyncReadyRef.current) {
      let cancelled = false
      void loadAssistantKey(settings.provider).then((key) => {
        if (cancelled) return
        keySyncReadyRef.current = true
        if (key) {
          setSettings((current) => (current.apiKey ? current : { ...current, apiKey: key }))
        }
      })
      return () => {
        cancelled = true
      }
    }
    keySyncReadyRef.current = true
    return () => undefined
  }, [isDesktop, settings.provider, settings.rememberKey, settings.apiKey])

  useEffect(() => {
    try {
      window.localStorage.setItem(ASSISTANT_LAYOUT_KEY, JSON.stringify(layout))
    } catch {
      // Layout persistence is best-effort; never break the chat.
    }
  }, [layout])

  useEffect(() => {
    if (settings.provider !== "opencode-harness") return () => undefined
    setHarnessAvailable(null)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 6000)
    void fetch("/api/models", { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setHarnessAvailable(response.ok)
      })
      .catch(() => {
        if (!controller.signal.aborted) setHarnessAvailable(false)
      })
      .finally(() => window.clearTimeout(timer))
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [settings.provider])

  // Desktop: probe the configured local server (Ollama/LM Studio/bridge) for
  // a first-run reachability hint. Hosted endpoints skip the probe — the Load
  // models button below covers them with the key attached.
  useEffect(() => {
    if (
      !isDesktop ||
      !showSettings ||
      settings.provider === "opencode-harness" ||
      !isLocalBaseURL(settings.baseURL)
    ) {
      setProbeStatus("idle")
      return () => undefined
    }
    setProbeStatus("checking")
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 2500)
    void listProviderModels({
      baseURL: settings.baseURL,
      apiKey: settings.apiKey,
      signal: controller.signal,
    })
      .then((models) => {
        if (controller.signal.aborted) return
        setProbeModels(models.length)
        setProbeStatus("ok")
      })
      .catch(() => {
        if (!controller.signal.aborted) setProbeStatus("unreachable")
      })
      .finally(() => window.clearTimeout(timer))
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [isDesktop, showSettings, settings.provider, settings.baseURL, settings.apiKey])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, busy])

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"
      if (!isCmdK) return
      const target = event.target
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      if (typing) return
      event.preventDefault()
      setShowSearch(true)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  async function refreshThreads(): Promise<void> {
    setThreads(await listThreads())
  }

  // Load most recent thread on mount; otherwise start empty (created on first send).
  useEffect(() => {
    let cancelled = false
    void listThreads().then((records) => {
      if (cancelled) return
      setThreads(records)
      const current = records[0]
      if (!current) return
      setActiveThreadId(current.id)
      void listMessages(current.id).then((stored) => {
        if (cancelled) return
        setMessages(
          stored.map((item) => ({
            id: item.id,
            role: item.role,
            content: item.content,
            ...(item.trace ? { trace: item.trace } : {}),
            ...(item.citedText ? { citedText: item.citedText } : {}),
            ...(item.cites ? { cites: item.cites } : {}),
          })),
        )
        storedIdsRef.current = new Set(stored.map((item) => item.id))
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Persist new messages into the active thread (dedupe via stored ids).
  useEffect(() => {
    if (!activeThreadId) return
    const threadId = activeThreadId
    const pending = messages.filter((item) => item.content && !storedIdsRef.current.has(item.id))
    if (pending.length === 0) return
    for (const item of pending) storedIdsRef.current.add(item.id)
    void (async () => {
      for (const item of pending) {
        // oxlint-disable-next-line no-await-in-loop -- Message order must be preserved.
        await appendMessage(threadId, {
          role: item.role,
          content: item.content,
          ...(item.trace ? { trace: item.trace } : {}),
          ...(item.citedText ? { citedText: item.citedText } : {}),
          ...(item.cites ? { cites: item.cites } : {}),
        })
      }
      await refreshThreads()
    })()
  }, [messages, activeThreadId])

  async function ensureThread(question: string): Promise<string | null> {
    if (activeThreadId) return activeThreadId
    const thread = await createThread({
      title: question.slice(0, 50) || "New chat",
      provider: settings.provider,
      model: settings.model,
    })
    storedIdsRef.current = new Set()
    setActiveThreadId(thread.id)
    await refreshThreads()
    return thread.id
  }

  async function handleNewChat(): Promise<void> {
    abortRef.current?.abort()
    setMessages([])
    storedIdsRef.current = new Set()
    setProposal(null)
    setRecatProposal(null)
    setCreateProposal(null)
    setDeleteProposal(null)
    setHarnessSessionId(undefined)
    setContextSummary(null)
    setError(null)
    setActiveThreadId(null)
    setShowHistory(false)
    await refreshThreads()
  }

  async function handleSelectThread(id: string): Promise<void> {
    abortRef.current?.abort()
    const stored = await listMessages(id)
    setMessages(
      stored.map((item) => ({
        id: item.id,
        role: item.role,
        content: item.content,
        ...(item.trace ? { trace: item.trace } : {}),
        ...(item.citedText ? { citedText: item.citedText } : {}),
        ...(item.cites ? { cites: item.cites } : {}),
      })),
    )
    storedIdsRef.current = new Set(stored.map((item) => item.id))
    setActiveThreadId(id)
    setProposal(null)
    setRecatProposal(null)
    setCreateProposal(null)
    setDeleteProposal(null)
    setHarnessSessionId(undefined)
    setContextSummary(null)
    setError(null)
    setShowHistory(false)
  }

  async function handleDeleteThread(id: string): Promise<void> {
    await deleteThread(id)
    if (id === activeThreadId) {
      abortRef.current?.abort()
      setMessages([])
      storedIdsRef.current = new Set()
      setActiveThreadId(null)
      setProposal(null)
      setRecatProposal(null)
      setCreateProposal(null)
      setDeleteProposal(null)
      setHarnessSessionId(undefined)
      setContextSummary(null)
    }
    await refreshThreads()
  }

  async function handleToggleThreadPin(id: string): Promise<void> {
    const thread = threads.find((item) => item.id === id)
    if (!thread) return
    await setThreadPin(id, !thread.pinned)
    await refreshThreads()
  }

  async function handleRenameThread(id: string, title: string): Promise<void> {
    const next = title.trim()
    if (!next) return
    await renameThread(id, next.slice(0, 80))
    await refreshThreads()
  }

  function recordFeedback(kind: "up" | "down", content: string): void {
    try {
      const raw = window.localStorage.getItem(FEEDBACK_STORAGE_KEY)
      const parsed: unknown = raw ? (JSON.parse(raw) as unknown) : []
      const entries = Array.isArray(parsed) ? parsed : []
      entries.push({
        at: new Date().toISOString(),
        kind,
        provider: settings.provider,
        model: settings.model,
        snippet: content.slice(0, 300),
      })
      window.localStorage.setItem(
        FEEDBACK_STORAGE_KEY,
        JSON.stringify(entries.slice(-FEEDBACK_STORAGE_CAP)),
      )
    } catch {
      // Feedback is best-effort; never break the chat.
    }
  }

  function updateSettings(patch: Partial<AssistantSettings>) {
    setSettings((current) => ({ ...current, ...patch }))
  }

  function selectProvider(provider: AssistantProviderId) {
    const preset = ASSISTANT_PRESETS.find((item) => item.id === provider)
    if (!preset) return
    setCustomModel(false)
    setDirectModels(null)
    setDirectModelsError(null)
    modelsAbortRef.current?.abort()
    setHarnessSessionId(undefined)
    if (isDesktop) {
      // Keys are per-provider in the keychain: drop the in-memory key so the
      // hydration effect pulls the new provider's remembered key (or none).
      keySyncReadyRef.current = false
    }
    setSettings((current) => ({
      ...current,
      provider,
      baseURL: preset.baseURL,
      model: preset.model,
      ...(isDesktop ? { apiKey: "" } : {}),
    }))
  }

  // Latest settings mirror for guarding async commits (stale model lists).
  const latestSettingsRef = useRef(settings)
  latestSettingsRef.current = settings
  // In-flight model listing: aborted when superseded or unmounted.
  const modelsAbortRef = useRef<AbortController | null>(null)
  const modelsRequestRef = useRef(0)

  useEffect(() => () => modelsAbortRef.current?.abort(), [])

  async function loadDirectModels(): Promise<void> {
    modelsAbortRef.current?.abort()
    const controller = new AbortController()
    modelsAbortRef.current = controller
    const requestId = modelsRequestRef.current + 1
    modelsRequestRef.current = requestId
    // Capture the target: results commit only if it is still selected.
    const wantProvider = settings.provider
    const wantBaseURL = settings.baseURL
    setDirectModelsLoading(true)
    setDirectModelsError(null)
    const timer = window.setTimeout(() => controller.abort(), 15_000)
    try {
      const models = await listProviderModels({
        baseURL: wantBaseURL,
        apiKey: settings.apiKey,
        signal: controller.signal,
      })
      if (modelsRequestRef.current !== requestId) return
      const latest = latestSettingsRef.current
      if (latest.provider !== wantProvider || latest.baseURL !== wantBaseURL) return
      setDirectModels(models)
    } catch (caught) {
      if (modelsRequestRef.current !== requestId) return
      if (controller.signal.aborted) return
      setDirectModels(null)
      setDirectModelsError(caught instanceof Error ? caught.message : "Could not load models.")
    } finally {
      window.clearTimeout(timer)
      if (modelsRequestRef.current === requestId) setDirectModelsLoading(false)
    }
  }

  const modelsRequestedRef = useRef(false)

  const loadHarnessModels = useCallback(async () => {
    setModelsLoading(true)
    setModelsError(null)
    try {
      const response = await fetch("/api/models")
      // Non-JSON bodies (e.g. the static host's HTML 404) must fall through to
      // the status-based error below, not throw a parser error.
      const payload: unknown = (await response.json().catch(() => null)) as unknown
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
          ...(entry.vision === true ? { vision: true as const } : {}),
          ...(entry.reasoning === true ? { reasoning: true as const } : {}),
          ...(typeof entry.contextTokens === "number" && Number.isFinite(entry.contextTokens)
            ? { contextTokens: entry.contextTokens }
            : {}),
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
    citeRowsRef.current = rowsFromSnapshot(snapshot)
    setContextSummary(
      `${snapshot.transactionCount} txns · ${snapshot.spending.length} categories · top ${snapshot.topTransactions.length} rows`,
    )
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
        thinking: settings.thinking,
        ...(harnessSessionId ? { sessionId: harnessSessionId } : {}),
      }),
    })
    const payload: unknown = (await response.json().catch(() => null)) as unknown
    if (!response.ok) {
      const detail = isRecord(payload) && typeof payload.error === "string" ? payload.error : null
      throw new Error(detail ?? `Harness endpoint ${response.status}. Run \`pnpm dev\` locally.`)
    }
    const turn = parseHarnessResponse(payload)
    if (!turn) throw new Error("Harness returned an unreadable response.")
    if (turn.sessionId) setHarnessSessionId(turn.sessionId)
    setMessages((current) => [
      ...current,
      finalizeAssistantMessage(turn.content || "The harness returned no text.", turn.trace),
    ])
  }

  async function runDirectTurn(
    history: Array<{ role: "user" | "assistant"; content: string }>,
    controller: AbortController,
  ): Promise<void> {
    setContextSummary("live tools · 5 capped Dexie queries")
    try {
      citeRowsRef.current = rowsFromSnapshot(await buildFinanceSnapshot(repositories))
    } catch {
      citeRowsRef.current = []
    }
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
        finalizeAssistantMessage(turn.content || "No response from provider."),
      ])
      return
    }

    const trace: ToolTrace[] = []
    const toolOutputs: Array<{ id: string; name: string; output: unknown }> = []
    for (const call of turn.toolCalls.slice(0, 4)) {
      if (call.name === "show_transactions_view") {
        const output = openTransactionsView(call.args)
        trace.push({
          id: call.id,
          name: call.name,
          summary: summarizeToolOutput(call.name, output),
        })
        toolOutputs.push({ id: call.id, name: call.name, output })
        continue
      }
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
      if (call.name === "propose_recategorize") {
        const draft = parseRecategorizeProposal(output)
        if (draft) {
          setRecatProposal({ ...draft, id: messageId() })
          setRecatState("idle")
        }
      }
      if (call.name === "create_transaction") {
        const draft = parseCreateTransactionProposal(output)
        if (draft) {
          setCreateProposal({ ...draft, id: messageId() })
          setCreateState("idle")
        }
      }
      if (call.name === "delete_transaction") {
        const draft = parseDeleteTransactionProposal(output)
        if (draft) {
          setDeleteProposal({ ...draft, id: messageId() })
          setDeleteState("idle")
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

    setMessages((current) => [...current, finalizeAssistantMessage(finalAnswer, trace)])
  }

  async function handleSend(event?: React.FormEvent, presetText?: string) {
    event?.preventDefault()
    const question = (presetText ?? input).trim()
    if (!question || busy) return
    setError(null)
    setProposalState("idle")
    setRecatState("idle")
    setCreateState("idle")
    setDeleteState("idle")
    const userMessage: PanelMessage = { id: messageId(), role: "user", content: question }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput("")
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      await ensureThread(question)
      if (settings.provider === "opencode-harness") {
        await handleHarnessSend(nextMessages, controller)
        return
      }
      await runDirectTurn(historyOf(nextMessages), controller)
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

  async function applyRecategorize() {
    if (!recatProposal || recatState !== "idle") return
    setRecatState("applying")
    try {
      await repositories.transactions.updateMany(recatProposal.affectedIds, {
        category: recatProposal.toCategory,
      })
      setRecatState("applied")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not apply recategorize.")
      setRecatState("idle")
    }
  }

  async function applyCreateTransaction() {
    if (!createProposal || createState !== "idle") return
    setCreateState("applying")
    try {
      await repositories.transactions.add({
        date: createProposal.date,
        description: createProposal.description,
        amountMinor: createProposal.amountMinor,
        category: createProposal.category,
        transactionType: null,
        accountName: createProposal.accountName,
        accountType: null,
        provider: null,
        labels: [],
        notes: createProposal.notes,
      })
      setCreateState("applied")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add transaction.")
      setCreateState("idle")
    }
  }

  async function applyDeleteTransaction() {
    if (!deleteProposal || deleteState !== "idle") return
    setDeleteState("applying")
    try {
      await repositories.transactions.remove(deleteProposal.id)
      setDeleteState("applied")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete transaction.")
      setDeleteState("idle")
    }
  }

  async function handleRegenerate(): Promise<void> {
    if (busy) return
    const kept = messages.slice(0, messages.map((item) => item.role).lastIndexOf("user") + 1)
    const lastUser = kept[kept.length - 1]
    if (!lastUser || lastUser.role !== "user") return
    // Drop the truncated tail from the thread store too, or it resurrects on reload.
    const droppedIds = messages.slice(kept.length).map((item) => item.id)
    if (activeThreadId) {
      await deleteMessages(activeThreadId, droppedIds)
      for (const id of droppedIds) storedIdsRef.current.delete(id)
    }
    setMessages(kept)
    setError(null)
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await ensureThread(lastUser.content)
      if (settings.provider === "opencode-harness") {
        await handleHarnessSend(kept, controller)
        return
      }
      await runDirectTurn(historyOf(kept), controller)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return
      setError(caught instanceof Error ? caught.message : "Assistant request failed.")
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const preset = ASSISTANT_PRESETS.find((item) => item.id === settings.provider)

  const sizeWidthClass =
    layout.size === "s" ? "sm:w-[22rem]" : layout.size === "l" ? "sm:w-[32rem]" : "sm:w-[26rem]"
  const useCustomSize = !layout.fullscreen && layout.custom !== null
  const windowClassName = layout.fullscreen
    ? "assistant-window fixed inset-3 z-40 flex h-auto max-h-none min-h-0 w-auto flex-col overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-2xl sm:inset-6"
    : `assistant-window fixed inset-x-4 bottom-4 z-40 flex h-[min(40rem,calc(100dvh-6rem))] max-h-[calc(100dvh-3rem)] min-h-[22rem] flex-col overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 ${sizeWidthClass} sm:max-w-[calc(100vw-2rem)] sm:min-w-[20rem]`
  const windowStyle =
    useCustomSize && layout.custom
      ? { width: layout.custom.width, height: layout.custom.height }
      : undefined

  const resizeDragRef = useRef<{
    startX: number
    startY: number
    width: number
    height: number
  } | null>(null)
  const windowRef = useRef<HTMLElement | null>(null)

  function startResizeDrag(event: React.PointerEvent<HTMLButtonElement>): void {
    if (layout.fullscreen) return
    const element = windowRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    resizeDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveResizeDrag(event: React.PointerEvent): void {
    const start = resizeDragRef.current
    // Bottom-right stays anchored; dragging the top-left grip grows the window.
    if (!start || event.buttons === 0) return
    const width = Math.min(
      Math.max(Math.round(start.width + (start.startX - event.clientX)), MIN_WINDOW_WIDTH),
      window.innerWidth - 32,
    )
    const height = Math.min(
      Math.max(Math.round(start.height + (start.startY - event.clientY)), MIN_WINDOW_HEIGHT),
      window.innerHeight - 48,
    )
    setLayout((current) => ({ ...current, custom: { width, height } }))
  }

  function stopResizeDrag(): void {
    resizeDragRef.current = null
  }

  return (
    <section
      ref={windowRef}
      aria-label="BudgetLens assistant"
      className={windowClassName}
      style={windowStyle}
    >
      {!layout.fullscreen && (
        <button
          type="button"
          aria-label="Resize assistant window"
          title="Drag to resize"
          onPointerDown={startResizeDrag}
          onPointerMove={moveResizeDrag}
          onPointerUp={stopResizeDrag}
          onPointerCancel={stopResizeDrag}
          className="absolute top-0 left-0 z-20 grid size-7 cursor-nwse-resize touch-none place-items-center rounded-br-xl text-muted-foreground opacity-60 hover:bg-accent hover:opacity-100"
        >
          <span aria-hidden="true" className="flex flex-col items-start gap-[3px] p-1.5">
            <span className="block h-px w-3 rotate-[-45deg] bg-current" />
            <span className="block h-px w-2 rotate-[-45deg] bg-current" />
          </span>
        </button>
      )}
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
          aria-label="Chat history"
          title="Chat history"
          aria-expanded={showHistory}
          onClick={() => setShowHistory((value) => !value)}
        >
          <History className="size-4" aria-hidden="true" />
        </Button>
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
          aria-label="New chat"
          title="New chat"
          onClick={() => {
            void handleNewChat()
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={layout.fullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
          title={layout.fullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
          aria-pressed={layout.fullscreen}
          onClick={() => {
            setLayout((current) => ({ ...current, fullscreen: !current.fullscreen }))
          }}
        >
          {layout.fullscreen ? (
            <Minimize2 className="size-4" aria-hidden="true" />
          ) : (
            <Maximize2 className="size-4" aria-hidden="true" />
          )}
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

      {contextSummary && (
        <p
          className="border-b px-4 py-1 text-[11px] text-muted-foreground"
          title="What the agent can see for this conversation. Finance rows stay capped; raw data never leaves this browser except as shown."
        >
          Agent sees: {contextSummary}
        </p>
      )}

      {settings.provider === "opencode-harness" && harnessAvailable === false && (
        <div className="border-b bg-muted/50 px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary">
              <ServerOff className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Assistant needs the local app</p>
              <p className="mt-1 text-xs text-muted-foreground">
                You are on the static GitHub Pages demo, which cannot run a server — so the Opencode
                harness cannot work here. Run it locally instead:
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
                <li>
                  Clone the repo and run <code className="rounded bg-muted px-1">pnpm install</code>
                </li>
                <li>
                  Start opencode:{" "}
                  <code className="rounded bg-muted px-1">
                    opencode serve --cors http://localhost:5173
                  </code>
                </li>
                <li>
                  Start the app: <code className="rounded bg-muted px-1">pnpm dev</code> and reopen
                  this panel
                </li>
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">
                Tip: direct presets (OpenAI, OpenRouter, custom) work on this page with your own key
                — no server needed.
              </p>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="absolute inset-0 z-10">
          <ThreadHistory
            open
            threads={threads}
            activeId={activeThreadId}
            onClose={() => setShowHistory(false)}
            onSelect={(id) => {
              void handleSelectThread(id)
            }}
            onNew={() => {
              void handleNewChat()
            }}
            onDelete={(id) => {
              void handleDeleteThread(id)
            }}
            onTogglePin={(id) => {
              void handleToggleThreadPin(id)
            }}
            onRename={(id, title) => {
              void handleRenameThread(id, title)
            }}
          />
        </div>
      )}
      <HistorySearch
        open={showSearch}
        onClose={() => setShowSearch(false)}
        onSelect={(id) => {
          setShowSearch(false)
          void handleSelectThread(id)
        }}
      />

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
          <fieldset className="grid gap-1">
            <legend className="font-medium">Window size</legend>
            <div className="flex gap-1">
              {ASSISTANT_WINDOW_SIZE_OPTIONS.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant={layout.size === option.id ? "default" : "outline"}
                  size="sm"
                  className="flex-1 rounded-full"
                  disabled={layout.fullscreen}
                  aria-pressed={layout.size === option.id}
                  onClick={() => {
                    setLayout((current) => ({ ...current, size: option.id, custom: null }))
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            {layout.fullscreen && (
              <p className="text-muted-foreground">Exit fullscreen to change window size.</p>
            )}
          </fieldset>
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
              <div className="grid gap-1">
                <span id="assistant-thinking-label" className="font-medium">
                  Thinking effort
                </span>
                <ThinkingSelect
                  value={settings.thinking}
                  onChange={(level) => {
                    if (isThinkingLevel(level)) updateSettings({ thinking: level })
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-1">
              <label className="grid gap-1" htmlFor="assistant-model">
                <span className="font-medium">Model</span>
                {directModels ? (
                  <select
                    id="assistant-model"
                    className="h-9 rounded-xl border border-input bg-background px-2"
                    value={settings.model}
                    onChange={(event) => updateSettings({ model: event.target.value })}
                  >
                    {!directModels.includes(settings.model) && (
                      <option value={settings.model}>{settings.model} (custom)</option>
                    )}
                    {directModels.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="assistant-model"
                    value={settings.model}
                    onChange={(event) => updateSettings({ model: event.target.value })}
                  />
                )}
              </label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={directModelsLoading}
                  onClick={() => {
                    void loadDirectModels()
                  }}
                >
                  {directModelsLoading
                    ? "Loading…"
                    : directModels
                      ? "Reload models"
                      : "Load models"}
                </Button>
                {directModels && (
                  <span className="text-muted-foreground">{directModels.length} models</span>
                )}
              </div>
              {directModelsError && <p className="text-muted-foreground">{directModelsError}</p>}
              {isDesktop && isLocalBaseURL(settings.baseURL) && probeStatus === "checking" && (
                <p className="text-muted-foreground">Checking local server…</p>
              )}
              {isDesktop && isLocalBaseURL(settings.baseURL) && probeStatus === "ok" && (
                <p className="text-muted-foreground">
                  Local server reachable ({probeModels} models).
                </p>
              )}
              {isDesktop &&
                isLocalBaseURL(settings.baseURL) &&
                probeStatus === "unreachable" &&
                settings.provider === "ollama" && (
                  <p className="text-muted-foreground">
                    Ollama isn&apos;t reachable at {settings.baseURL}. Install it
                    (ollama.com/download), run `ollama serve`, then `ollama pull qwen2.5:7b`.
                  </p>
                )}
              {isDesktop &&
                isLocalBaseURL(settings.baseURL) &&
                probeStatus === "unreachable" &&
                settings.provider === "lmstudio" && (
                  <p className="text-muted-foreground">
                    In LM Studio: Developer → Server → enable CORS → Start Server.
                  </p>
                )}
              {isDesktop &&
                isLocalBaseURL(settings.baseURL) &&
                probeStatus === "unreachable" &&
                settings.provider !== "ollama" &&
                settings.provider !== "lmstudio" && (
                  <p className="text-muted-foreground">
                    Nothing listening at {settings.baseURL}. Start your local server and retry.
                  </p>
                )}
            </div>
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
                <span className="font-medium">
                  {isDesktop
                    ? settings.rememberKey
                      ? "API key (stored in OS keychain)"
                      : "API key (kept for this session only)"
                    : "API key (optional, kept for this session only)"}
                </span>
                <Input
                  id="assistant-key"
                  type="password"
                  autoComplete="off"
                  value={settings.apiKey}
                  onChange={(event) => updateSettings({ apiKey: event.target.value })}
                  placeholder="sk-…"
                />
              </label>
              {isDesktop && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.rememberKey}
                    onChange={(event) => {
                      const remember = event.target.checked
                      updateSettings({ rememberKey: remember })
                      if (remember && !settings.apiKey) {
                        void loadAssistantKey(settings.provider).then((key) => {
                          if (key) {
                            setSettings((current) =>
                              current.apiKey ? current : { ...current, apiKey: key },
                            )
                          }
                        })
                      }
                      if (!remember) void clearAssistantKey(settings.provider)
                    }}
                  />
                  <span>Remember key on this device (OS keychain)</span>
                </label>
              )}
            </>
          )}
          {settings.provider !== "opencode-harness" && (
            <p className="font-medium">
              {isLocalBaseURL(settings.baseURL)
                ? "Local · data stays on this machine"
                : "Cloud · data leaves this machine"}
            </p>
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
                <Markdown
                  text={item.citedText ?? item.content}
                  id={item.id}
                  navigate={navigateToTransactions}
                  {...(item.cites ? { cites: item.cites } : {})}
                />
                <MessageActions
                  content={item.content}
                  onRegenerate={() => {
                    void handleRegenerate()
                  }}
                  onFeedback={(kind) => recordFeedback(kind, item.content)}
                />
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
          <ProposalCard
            title="Proposed budget"
            lines={[
              `${proposal.category} · ${(proposal.amountMinor / 100).toFixed(2)} · ${proposal.period}`,
            ]}
            status={proposalState}
            onApprove={() => {
              void applyProposal()
            }}
            onDismiss={() => setProposal(null)}
          />
        </div>
      )}

      {recatProposal && (
        <div className="border-t px-4 py-3">
          <ProposalCard
            title="Proposed recategorization"
            lines={[
              `Move ${recatProposal.affectedIds.length} transaction${recatProposal.affectedIds.length === 1 ? "" : "s"} to ${recatProposal.toCategory}`,
            ]}
            status={recatState}
            onApprove={() => {
              void applyRecategorize()
            }}
            onDismiss={() => setRecatProposal(null)}
          />
        </div>
      )}

      {createProposal && (
        <div className="border-t px-4 py-3">
          <ProposalCard
            title="Proposed transaction"
            lines={[
              `${createProposal.date} · ${createProposal.description}`,
              `${formatMinor(createProposal.amountMinor)} · ${createProposal.category ?? "Uncategorized"}`,
              ...(createProposal.accountName ? [`Account: ${createProposal.accountName}`] : []),
            ]}
            status={createState}
            onApprove={() => {
              void applyCreateTransaction()
            }}
            onDismiss={() => setCreateProposal(null)}
          />
        </div>
      )}

      {deleteProposal && (
        <div className="border-t px-4 py-3">
          <ProposalCard
            title="Proposed deletion"
            lines={[deleteProposal.preview, "This cannot be undone."]}
            status={deleteState}
            onApprove={() => {
              void applyDeleteTransaction()
            }}
            onDismiss={() => setDeleteProposal(null)}
          />
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

      <div className="border-t p-3">
        <Composer
          value={input}
          onChange={setInput}
          onSend={() => {
            void handleSend()
          }}
          busy={busy}
          onStop={() => abortRef.current?.abort()}
          placeholder="Ask about spending, budgets…"
        />
      </div>
    </section>
  )
}
