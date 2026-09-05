import Dexie, { type EntityTable } from "dexie"

export interface ThreadRecord {
  id: string
  title: string
  provider: string
  model: string
  preview: string
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export interface StoredTraceStep {
  id: string
  name: string
  summary: string
}

export interface StoredCite {
  index: number
  label: string
  href: string
}

export interface StoredMessage {
  id: string
  threadId: string
  role: "user" | "assistant"
  content: string
  trace?: Array<StoredTraceStep>
  citedText?: string
  cites?: Array<StoredCite>
  createdAt: string
}

export interface CreateThreadInput {
  title: string
  provider: string
  model: string
}

export interface AppendMessageInput {
  role: "user" | "assistant"
  content: string
  trace?: Array<StoredTraceStep>
  citedText?: string
  cites?: Array<StoredCite>
}

const ASSISTANT_DB_NAME = "budgetlens-assistant"
const MESSAGE_CAP = 200
const PREVIEW_MAX_LENGTH = 120
const TITLE_MAX_LENGTH = 120

class AssistantThreadDatabase extends Dexie {
  threads!: EntityTable<ThreadRecord, "id">
  messages!: EntityTable<StoredMessage, "id">

  constructor() {
    super(ASSISTANT_DB_NAME)
    this.version(1).stores({
      threads: "&id, updatedAt, pinned",
      messages: "&id, threadId, createdAt",
    })
  }
}

export const assistantDb = new AssistantThreadDatabase()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function newId(): string {
  try {
    const cryptoRef = globalThis.crypto
    if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
      return cryptoRef.randomUUID()
    }
  } catch {
    // Fall through to the Math.random fallback below.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function cleanTitle(title: string): string {
  const trimmed = title.trim()
  if (trimmed.length === 0) return "New chat"
  return trimmed.length > TITLE_MAX_LENGTH ? `${trimmed.slice(0, TITLE_MAX_LENGTH)}…` : trimmed
}

function toPreview(content: string): string {
  const collapsed = content.trim().replace(/\s+/g, " ")
  if (collapsed.length === 0) return ""
  return collapsed.length > PREVIEW_MAX_LENGTH
    ? `${collapsed.slice(0, PREVIEW_MAX_LENGTH)}…`
    : collapsed
}

function cleanTrace(trace: unknown): Array<StoredTraceStep> | undefined {
  if (!Array.isArray(trace)) return undefined
  const cleaned: Array<StoredTraceStep> = []
  for (const entry of trace) {
    if (!isRecord(entry)) continue
    if (typeof entry.id !== "string" || typeof entry.name !== "string") continue
    if (typeof entry.summary !== "string") continue
    cleaned.push({ id: entry.id, name: entry.name, summary: entry.summary })
  }
  return cleaned.length > 0 ? cleaned : undefined
}

function cleanCites(cites: unknown): Array<StoredCite> | undefined {
  if (!Array.isArray(cites)) return undefined
  const cleaned: Array<StoredCite> = []
  for (const entry of cites) {
    if (!isRecord(entry)) continue
    if (typeof entry.index !== "number" || !Number.isFinite(entry.index)) continue
    if (typeof entry.label !== "string" || typeof entry.href !== "string") continue
    cleaned.push({ index: entry.index, label: entry.label, href: entry.href })
  }
  return cleaned.length > 0 ? cleaned : undefined
}

function cleanMessageRow(row: StoredMessage): StoredMessage {
  const cleanedTrace = cleanTrace(row.trace)
  const cleanedCites = cleanCites(row.cites)
  return {
    id: row.id,
    threadId: row.threadId,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    ...(cleanedTrace ? { trace: cleanedTrace } : {}),
    ...(typeof row.citedText === "string" && row.citedText ? { citedText: row.citedText } : {}),
    ...(cleanedCites ? { cites: cleanedCites } : {}),
    createdAt: row.createdAt,
  }
}

export async function listThreads(): Promise<Array<ThreadRecord>> {
  try {
    const rows = await assistantDb.threads.toArray()
    return rows.toSorted((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
      return right.updatedAt.localeCompare(left.updatedAt)
    })
  } catch {
    return []
  }
}

export async function createThread(input: CreateThreadInput): Promise<ThreadRecord> {
  const now = nowIso()
  const record: ThreadRecord = {
    id: newId(),
    title: cleanTitle(input.title),
    provider: input.provider,
    model: input.model,
    preview: "",
    pinned: false,
    createdAt: now,
    updatedAt: now,
  }
  try {
    await assistantDb.threads.add(record)
  } catch {
    // Private mode or quota: return the in-memory record so callers still work.
  }
  return record
}

export async function renameThread(id: string, title: string): Promise<void> {
  try {
    await assistantDb.threads.update(id, { title: cleanTitle(title), updatedAt: nowIso() })
  } catch {
    // Ignore private-mode failures; listThreads falls back to safe empties.
  }
}

export async function setThreadPin(id: string, pinned: boolean): Promise<void> {
  try {
    await assistantDb.threads.update(id, { pinned, updatedAt: nowIso() })
  } catch {
    // Ignore private-mode failures.
  }
}

export async function deleteThread(id: string): Promise<void> {
  try {
    await assistantDb.messages.where("threadId").equals(id).delete()
    await assistantDb.threads.delete(id)
  } catch {
    // Ignore private-mode failures.
  }
}

export async function listMessages(threadId: string): Promise<Array<StoredMessage>> {
  try {
    const rows = await assistantDb.messages.where("threadId").equals(threadId).sortBy("createdAt")
    return rows.slice(0, MESSAGE_CAP).map(cleanMessageRow)
  } catch {
    return []
  }
}

export async function appendMessage(
  threadId: string,
  input: AppendMessageInput,
): Promise<StoredMessage> {
  const now = nowIso()
  const cleanedTrace = cleanTrace(input.trace)
  const cleanedCites = cleanCites(input.cites)
  const message: StoredMessage = {
    id: newId(),
    threadId,
    role: input.role,
    content: input.content,
    ...(cleanedTrace ? { trace: cleanedTrace } : {}),
    ...(typeof input.citedText === "string" && input.citedText
      ? { citedText: input.citedText }
      : {}),
    ...(cleanedCites ? { cites: cleanedCites } : {}),
    createdAt: now,
  }
  try {
    await assistantDb.messages.add(message)
    const preview = toPreview(input.content)
    if (preview.length > 0) {
      await assistantDb.threads.update(threadId, { preview, updatedAt: now })
    } else {
      await assistantDb.threads.update(threadId, { updatedAt: now })
    }
  } catch {
    // Ignore private-mode failures; caller still gets the in-memory message.
  }
  return message
}

export async function clearThread(threadId: string): Promise<void> {
  try {
    await assistantDb.messages.where("threadId").equals(threadId).delete()
    await assistantDb.threads.update(threadId, { preview: "", updatedAt: nowIso() })
  } catch {
    // Ignore private-mode failures.
  }
}
