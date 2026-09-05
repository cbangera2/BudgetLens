import { Search, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Input } from "@/components/ui/input"
import { listMessages, listThreads, type ThreadRecord } from "@/features/assistant/thread-store"
import { cn } from "@/lib/cn"

export interface HistorySearchProps {
  open: boolean
  onClose: () => void
  onSelect: (threadId: string) => void
}

export function HistorySearch({ open, onClose, onSelect }: HistorySearchProps) {
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [threads, setThreads] = useState<Array<ThreadRecord>>([])
  const [snippets, setSnippets] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  // Restore focus to whatever opened the dialog.
  const triggerRef = useRef<Element | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const loaded = await listThreads()
        if (cancelled) return
        setThreads(loaded)
        const next: Record<string, string> = {}
        await Promise.all(
          loaded.map(async (thread) => {
            try {
              const messages = await listMessages(thread.id)
              if (cancelled) return
              next[thread.id] = messages
                .map((message) => message.content)
                .join("\n")
                .slice(0, 4000)
            } catch {
              next[thread.id] = ""
            }
          }),
        )
        if (!cancelled) setSnippets(next)
      } catch {
        if (!cancelled) {
          setThreads([])
          setSnippets({})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (open) {
      setLoading(true)
      setQuery("")
      setDebouncedQuery("")
      setActiveIndex(0)
      setSnippets({})
      void load()
    }
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement
      inputRef.current?.focus()
    } else {
      const trigger = triggerRef.current
      if (trigger instanceof HTMLElement) trigger.focus()
      triggerRef.current = null
    }
  }, [open])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      // Opening via ⌘K lives in the panel; this listener only closes.
      if (!open) return
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"
      if (isCmdK) {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const normalized = debouncedQuery.trim().toLowerCase()
    if (normalized.length === 0) return threads
    const tokens = normalized.split(/\s+/).filter((token) => token.length > 0)
    return threads.filter((thread) => {
      const snippet = snippets[thread.id] ?? ""
      const haystack = `${thread.title} ${thread.preview} ${snippet}`.toLowerCase()
      return tokens.every((token) => haystack.includes(token))
    })
  }, [threads, debouncedQuery, snippets])

  useEffect(() => {
    setActiveIndex(0)
  }, [debouncedQuery])

  useEffect(() => {
    if (filtered.length === 0) return
    const clamped = Math.min(Math.max(activeIndex, 0), filtered.length - 1)
    if (clamped !== activeIndex) setActiveIndex(clamped)
    const container = listRef.current
    if (!container) return
    const active = container.querySelector(`[data-index="${clamped}"]`)
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" })
    }
  }, [activeIndex, filtered.length])

  if (!open) return null

  function move(direction: 1 | -1): void {
    if (filtered.length === 0) return
    setActiveIndex((previous) => {
      const next = (previous + direction + filtered.length) % filtered.length
      return next
    })
  }

  function choose(id: string): void {
    onSelect(id)
  }

  const emptyMessage = loading
    ? "Loading conversations…"
    : debouncedQuery.trim().length > 0
      ? `No conversations match “${debouncedQuery.trim()}”.`
      : "No conversations yet."

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4">
      <button
        type="button"
        aria-label="Close search"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <dialog
        open
        aria-label="Search conversations"
        className="relative mt-16 w-full max-w-lg overflow-hidden rounded-2xl border bg-card p-0 text-card-foreground shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={inputRef}
            value={query}
            aria-label="Search conversations"
            placeholder="Search conversations… (⌘K)"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                move(1)
              } else if (event.key === "ArrowUp") {
                event.preventDefault()
                move(-1)
              } else if (event.key === "Enter") {
                event.preventDefault()
                const current = filtered[activeIndex]
                const first = filtered[0]
                const target = current ?? first
                if (target) choose(target.id)
              } else if (event.key === "Escape") {
                event.preventDefault()
                onClose()
              }
            }}
            className="border-0 shadow-none focus-visible:ring-0"
          />
          <button
            type="button"
            aria-label="Close search"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          )}
          {filtered.map((thread, index) => {
            const active = index === activeIndex
            return (
              <button
                key={thread.id}
                type="button"
                data-index={index}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(thread.id)}
                className={cn(
                  "w-full rounded-lg px-2 py-2 text-left",
                  active ? "bg-accent text-accent-foreground" : undefined,
                )}
              >
                <span className="block truncate text-sm font-medium">{thread.title}</span>
                {thread.preview.length > 0 && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {thread.preview}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          ↑↓ to navigate · Enter to open · Esc to close
        </p>
      </dialog>
    </div>
  )
}
