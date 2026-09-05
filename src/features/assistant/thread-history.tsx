import { Pin, Plus, Trash2, X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { ThreadRecord } from "@/features/assistant/thread-store"
import { cn } from "@/lib/cn"

export interface ThreadHistoryProps {
  open: boolean
  onClose: () => void
  threads: Array<ThreadRecord>
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onTogglePin: (id: string) => void
  onRename: (id: string, title: string) => void
}

function formatThreadTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return date.toLocaleDateString()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

export function ThreadHistory({
  open,
  onClose,
  threads,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onTogglePin,
  onRename,
}: ThreadHistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")

  if (!open) return null

  const pinned = threads.filter((thread) => thread.pinned)
  const recent = threads.filter((thread) => !thread.pinned)

  function startEdit(thread: ThreadRecord): void {
    setEditingId(thread.id)
    setDraft(thread.title)
  }

  function commitEdit(id: string): void {
    const next = draft.trim()
    setEditingId(null)
    setDraft("")
    if (next.length > 0) onRename(id, next)
  }

  function cancelEdit(): void {
    setEditingId(null)
    setDraft("")
  }

  function renderRow(thread: ThreadRecord) {
    const active = thread.id === activeId
    const editing = thread.id === editingId
    return (
      <div
        key={thread.id}
        className={cn(
          "group flex items-start gap-1 rounded-xl border p-2",
          active ? "border-primary bg-accent" : "border-transparent hover:bg-accent/60",
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(thread.id)}
          aria-label={`Open conversation ${thread.title}`}
          className="min-w-0 flex-1 text-left"
        >
          {editing ? (
            <Input
              ref={(element) => {
                element?.focus()
              }}
              value={draft}
              aria-label="Rename conversation"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => commitEdit(thread.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  commitEdit(thread.id)
                } else if (event.key === "Escape") {
                  event.preventDefault()
                  cancelEdit()
                }
                event.stopPropagation()
              }}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              className="h-8 text-sm"
            />
          ) : (
            <span
              title="Double-click to rename"
              onDoubleClick={(event) => {
                event.stopPropagation()
                startEdit(thread)
              }}
              className="block truncate text-sm font-medium"
            >
              {thread.title}
            </span>
          )}
          {thread.preview.length > 0 && (
            <span className="block truncate text-xs text-muted-foreground">{thread.preview}</span>
          )}
          <span className="block text-[11px] text-muted-foreground">
            {formatThreadTime(thread.updatedAt)}
          </span>
        </button>
        <span className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={thread.pinned ? `Unpin ${thread.title}` : `Pin ${thread.title}`}
            title={thread.pinned ? "Unpin" : "Pin"}
            onClick={() => onTogglePin(thread.id)}
            className={cn("size-7", thread.pinned ? "text-primary" : "text-muted-foreground")}
          >
            <Pin className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete ${thread.title}`}
            title="Delete"
            onClick={() => onDelete(thread.id)}
            className="size-7 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </span>
      </div>
    )
  }

  return (
    <Card className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <h2 className="text-sm font-semibold">History</h2>
        <span className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="New chat" onClick={onNew}>
            <Plus className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close history"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </span>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {threads.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No conversations yet.</p>
        )}
        {pinned.length > 0 && (
          <section aria-label="Pinned conversations" className="space-y-1">
            <h3 className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Pinned
            </h3>
            {pinned.map(renderRow)}
          </section>
        )}
        {recent.length > 0 && (
          <section aria-label="Recent conversations" className="space-y-1">
            <h3 className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Recent
            </h3>
            {recent.map(renderRow)}
          </section>
        )}
      </div>
    </Card>
  )
}
