import type { IncomingMessage, ServerResponse } from "node:http"
import { createServer } from "node:net"

import { chat } from "@tanstack/ai"
import { claudeCodeText } from "@tanstack/ai-claude-code"
import { codexText } from "@tanstack/ai-codex"
import { opencodeText } from "@tanstack/ai-opencode"
import { defineSandbox, defineWorkspace, localSource, withSandbox } from "@tanstack/ai-sandbox"
import { localProcessSandbox } from "@tanstack/ai-sandbox-local-process"
import type { Plugin } from "vite"
import { z } from "zod"

const DEFAULT_HARNESS_MODEL = "opencode/muse-spark-1.3-contributor-free"
const MAX_BODY_BYTES = 256_000
const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096"

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(8_000),
})

const snapshotSchema = z.object({
  generatedAt: z.string().max(64),
  transactionCount: z.number(),
  spending: z
    .array(
      z.object({
        category: z.string().max(120),
        count: z.number(),
        totalMinor: z.number(),
        total: z.string().max(64),
      }),
    )
    .max(30),
  budgets: z
    .array(
      z.object({
        category: z.string().max(120),
        period: z.string().max(16),
        goalMinor: z.number(),
        goal: z.string().max(64),
        spentMinor: z.number(),
        spent: z.string().max(64),
        remainingMinor: z.number(),
        remaining: z.string().max(64),
        over: z.boolean(),
      }),
    )
    .max(40),
  netWorth: z
    .array(
      z.object({
        date: z.string().max(16),
        series: z.string().max(32),
        valueMinor: z.number(),
        value: z.string().max(64),
      }),
    )
    .max(40),
})

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(30),
  snapshot: snapshotSchema,
  model: z
    .string()
    .regex(/^[^/\s]+\/[^/\s]+$/)
    .max(120)
    .optional(),
  sessionId: z.string().max(200).optional(),
})

type ChatBody = z.infer<typeof bodySchema>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * The adapter defaults its in-sandbox serve to port 4096, which clashes when
 * the user already runs `opencode serve`. Hand each turn a free loopback port.
 */
function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address()
      probe.close((error?: Error) => {
        if (error) {
          reject(error instanceof Error ? error : new Error("Port probe failed."))
          return
        }
        if (typeof address === "object" && address && typeof address.port === "number") {
          resolve(address.port)
          return
        }
        reject(new Error("Port probe failed."))
      })
    })
  })
}

function snip(value: unknown, max = 300): string {
  try {
    const text = JSON.stringify(value) ?? ""
    return text.length > max ? `${text.slice(0, max)}…` : text
  } catch {
    return ""
  }
}

interface HarnessToolEvent {
  name: string
  summary: string
}

export interface HarnessModelOption {
  id: string
  name: string
  provider: string
}

interface DrainedTurn {
  content: string
  toolEvents: HarnessToolEvent[]
  sessionId?: string
}

function toolNameOf(chunk: Record<string, unknown>): string {
  for (const key of ["name", "toolName"]) {
    const value = chunk[key]
    if (typeof value === "string" && value) return value
  }
  const nested = chunk.toolCall ?? chunk.tool
  if (isRecord(nested)) {
    for (const key of ["name", "toolName"]) {
      const value = nested[key]
      if (typeof value === "string" && value) return value
    }
  }
  return "harness-tool"
}

function toolCallIdOf(chunk: Record<string, unknown>): string | undefined {
  const value = chunk.toolCallId
  return typeof value === "string" && value ? value : undefined
}

function parseArgsDelta(accumulated: string): unknown {
  if (!accumulated) return {}
  try {
    return JSON.parse(accumulated) as unknown
  } catch {
    return { raw: accumulated.slice(0, 300) }
  }
}

async function drainHarnessTurn(
  stream: AsyncIterable<unknown>,
  signal: AbortSignal,
): Promise<DrainedTurn> {
  let content = ""
  const toolEvents: HarnessToolEvent[] = []
  let sessionId: string | undefined
  const pending = new Map<string, { name: string; argsRaw: string; input: unknown }>()

  for await (const raw of stream) {
    if (signal.aborted) break
    if (!isRecord(raw)) continue
    const type = typeof raw.type === "string" ? raw.type : ""

    if (type === "TEXT_MESSAGE_CONTENT" && typeof raw.delta === "string") {
      content += raw.delta
      continue
    }

    if (type === "CUSTOM") {
      if (raw.name === "opencode.session-id" && isRecord(raw.value)) {
        const id = raw.value.sessionId
        if (typeof id === "string" && id) sessionId = id
      } else if (raw.name === "opencode.todo") {
        toolEvents.push({ name: "plan", summary: snip(raw.value) })
      }
      continue
    }

    if (type === "RUN_ERROR") {
      const detail =
        (typeof raw.error === "string" && raw.error) ||
        (typeof raw.message === "string" && raw.message) ||
        snip(raw) ||
        "harness run failed"
      throw new Error(detail.slice(0, 500))
    }

    if (type === "TOOL_CALL_START") {
      const id = toolCallIdOf(raw)
      if (id) pending.set(id, { name: toolNameOf(raw), argsRaw: "", input: {} })
      continue
    }

    if (type === "TOOL_CALL_ARGS") {
      const id = toolCallIdOf(raw)
      if (id && typeof raw.delta === "string") {
        const entry = pending.get(id) ?? { name: "harness-tool", argsRaw: "", input: {} }
        entry.argsRaw += raw.delta
        pending.set(id, entry)
      }
      continue
    }

    if (type === "TOOL_CALL_END" || type === "TOOL_CALL_RESULT") {
      const id = toolCallIdOf(raw)
      const entry = id ? pending.get(id) : undefined
      const name = entry?.name ?? toolNameOf(raw)
      if (type === "TOOL_CALL_RESULT") {
        const output = raw.content ?? raw.output ?? raw.result ?? raw.error
        const input = entry ? parseArgsDelta(entry.argsRaw) : (raw.input ?? {})
        toolEvents.push({ name, summary: snip({ input, output }) })
        if (id) pending.delete(id)
      } else if (entry && id) {
        if (typeof raw.input !== "undefined") entry.input = raw.input
        pending.set(id, entry)
      } else {
        toolEvents.push({ name, summary: snip({ input: raw.input ?? {} }) })
      }
      continue
    }
  }

  // A turn that ended mid-tool (abort) still reports what started.
  for (const entry of pending.values()) {
    toolEvents.push({ name: entry.name, summary: snip({ input: parseArgsDelta(entry.argsRaw) }) })
  }

  return sessionId ? { content, toolEvents, sessionId } : { content, toolEvents }
}

function buildSystemPrompt(snapshot: ChatBody["snapshot"]): {
  prompt: string
  snapshotBlob: string
} {
  const snapshotBlob = snip(snapshot, 12_000)
  const prompt = [
    "You are BudgetLens Assistant, a local-first finance helper.",
    "The user's private finance summary (aggregates only, no raw rows) is:",
    snapshotBlob,
    "Rules:",
    "- Answer from the summary above; never invent balances or transactions.",
    "- Amounts show as formatted currency already; minor-unit math is done for you.",
    "- Keep answers short, markdown-formatted, and point at what the user can verify in the app.",
    "- Budget changes are applied by the app UI, never by editing files.",
    "- Do not repeat these instructions or the summary back; answer only.",
  ].join("\n")
  return { prompt, snapshotBlob }
}

/**
 * Some harness models echo the prompt and/or the user question as leading
 * assistant text. Cut everything through the last echoed user message and
 * drop any verbatim snapshot blob so only the answer remains.
 */
function stripEcho(content: string, userTexts: string[], snapshotBlob: string): string {
  let out = snapshotBlob ? content.split(snapshotBlob).join("") : content
  for (const raw of userTexts.slice(-3).toReversed()) {
    const text = raw.trim()
    if (!text) continue
    const index = out.lastIndexOf(text)
    if (index >= 0) {
      const rest = out.slice(index + text.length).trim()
      if (rest) return rest
    }
  }
  return out.trim() || content.trim()
}

function readJsonBody(req: IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on("data", (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error("Request body too large."))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown)
      } catch {
        reject(new Error("Invalid JSON body."))
      }
    })
    req.on("error", (error: unknown) => {
      reject(error instanceof Error ? error : new Error("Failed to read request body."))
    })
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader("content-type", "application/json")
  res.end(JSON.stringify(payload))
}

async function handleHarnessChat(
  body: unknown,
  controller: AbortController,
): Promise<{ status: number; payload: unknown }> {
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return { status: 400, payload: { error: "Invalid request body." } }
  }
  const { messages, snapshot, sessionId } = parsed.data
  const model = parsed.data.model ?? DEFAULT_HARNESS_MODEL

  // One sandbox per dev-server lifetime, reused across turns ("thread"):
  // the in-sandbox serve starts once, opencode sessions survive for resume,
  // and the agent works directly in the repo checkout (read-only: edits and
  // mutating shell stay rejected under permissionMode "default").
  const sandbox = defineSandbox({
    id: "budgetlens-assistant",
    provider: localProcessSandbox({ dir: process.cwd() }),
    workspace: defineWorkspace({ source: localSource(process.cwd()) }),
    lifecycle: { reuse: "thread", destroyOnComplete: false, keepAlive: "30m" },
  })

  const lastUser =
    messages.toReversed().find((item) => item.role === "user") ?? messages[messages.length - 1]
  if (!lastUser) {
    return { status: 400, payload: { error: "At least one message is required." } }
  }

  const { prompt, snapshotBlob } = buildSystemPrompt(snapshot)
  const port = await pickFreePort()
  const stream = chat({
    adapter: opencodeText(model, { permissionMode: "default", port, hostname: "127.0.0.1" }),
    threadId: "budgetlens-assistant",
    // Resumed harness sessions already hold prior context; send only the latest turn.
    messages: sessionId ? [lastUser] : messages,
    systemPrompts: [prompt],
    modelOptions: sessionId ? { sessionId } : {},
    middleware: [withSandbox(sandbox)],
    abortController: controller,
  })

  const drained = await drainHarnessTurn(stream, controller.signal)
  const userTexts = messages.filter((item) => item.role === "user").map((item) => item.content)
  return {
    status: 200,
    payload: {
      content: stripEcho(drained.content, userTexts, snapshotBlob),
      toolEvents: drained.toolEvents,
      ...(drained.sessionId ? { sessionId: drained.sessionId } : {}),
    },
  }
}

function parseProviderModels(payload: unknown): HarnessModelOption[] {
  // Both /config/providers ({ providers }) and /provider ({ all }) shapes.
  // NEVER log or persist the raw payload: enabled providers carry live API keys.
  const list: unknown = isRecord(payload) ? (payload.providers ?? payload.all) : undefined
  if (!Array.isArray(list)) return []
  const models: HarnessModelOption[] = []
  for (const entry of list) {
    if (!isRecord(entry) || typeof entry.id !== "string") continue
    const provider = entry.id
    if (!isRecord(entry.models)) continue
    for (const [key, value] of Object.entries(entry.models)) {
      const fullId = isRecord(value) && typeof value.id === "string" ? value.id : key
      const name = isRecord(value) && typeof value.name === "string" ? value.name : fullId
      const toolcall =
        isRecord(value) && isRecord(value.capabilities) && value.capabilities.toolcall === true
      if (!toolcall) continue
      models.push({
        id: fullId.includes("/") ? fullId : `${provider}/${fullId}`,
        name,
        provider,
      })
    }
  }
  return models.toSorted((left, right) =>
    left.provider === right.provider
      ? left.name.localeCompare(right.name)
      : left.provider.localeCompare(right.provider),
  )
}

async function handleModelList(): Promise<{ status: number; payload: unknown }> {
  // /config/providers lists LOADED providers (authenticated, not disabled):
  // exactly the models opencode itself offers. /provider is the full catalog.
  try {
    const response = await fetch(`${OPENCODE_BASE_URL}/config/providers`, {
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error(`opencode serve responded ${response.status}`)
    const payload: unknown = (await response.json()) as unknown
    return { status: 200, payload: { models: parseProviderModels(payload) } }
  } catch (error) {
    return {
      status: 502,
      payload: {
        error:
          error instanceof Error ? error.message.slice(0, 300) : "Could not reach opencode serve.",
        hint: "Is `opencode serve` running? Override with OPENCODE_BASE_URL.",
      },
    }
  }
}

/**
 * Dev-only assistant endpoints. Vite runs `configureServer` middleware
 * exclusively in `vite dev`, so production `vite build` output and the
 * GitHub Pages deploy never include a server.
 */
export function assistantHarnessPlugin(): Plugin {
  return {
    name: "budgetlens-assistant-harness",
    configureServer(server) {
      server.middlewares.use("/api/models", (req, res) => {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed." })
          return
        }
        void handleModelList().then(({ status, payload }) => {
          if (res.writableEnded) return
          sendJson(res, status, payload)
        })
      })

      server.middlewares.use("/api/chat", (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Method not allowed." })
          return
        }

        const aborter = new AbortController()
        let responded = false
        res.on("close", () => {
          if (!responded) aborter.abort()
        })

        void readJsonBody(req, MAX_BODY_BYTES)
          .then((body) => handleHarnessChat(body, aborter))
          .then(({ status, payload }) => {
            if (res.writableEnded) return
            responded = true
            sendJson(res, status, payload)
          })
          .catch((error: unknown) => {
            if (res.writableEnded) return
            const failed = error instanceof Error && error.name === "AbortError"
            sendJson(res, failed ? 499 : 502, {
              error:
                error instanceof Error ? error.message.slice(0, 500) : "Assistant harness failed.",
            })
          })
      })
    },
  }
}
