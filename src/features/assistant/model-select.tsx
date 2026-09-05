import { Brain, Check, ChevronDown, Eye, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/cn"

export interface ModelSelectOption {
  id: string
  name: string
  provider: string
  free?: boolean
  vision?: boolean
  reasoning?: boolean
  contextTokens?: number
}

interface ModelSelectProps {
  models: ModelSelectOption[]
  value: string
  onChange: (id: string) => void
  onCustom: () => void
  disabled?: boolean
}

function groupModels(
  models: ModelSelectOption[],
): Array<{ provider: string; models: ModelSelectOption[] }> {
  const groups = new Map<string, ModelSelectOption[]>()
  for (const model of models) {
    const list = groups.get(model.provider) ?? []
    list.push(model)
    groups.set(model.provider, list)
  }
  return [...groups.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([provider, list]) => ({ provider, models: list }))
}

function matchesQuery(model: ModelSelectOption, query: string): boolean {
  const haystack = `${model.name} ${model.id} ${model.provider}`.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

const PROVIDER_DOT_CLASSES = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-pink-500",
] as const

function providerDotClass(provider: string): string {
  let hash = 0
  for (let index = 0; index < provider.length; index += 1) {
    hash = (hash * 31 + provider.charCodeAt(index)) >>> 0
  }
  return PROVIDER_DOT_CLASSES[hash % PROVIDER_DOT_CLASSES.length] ?? "bg-muted-foreground"
}

const RECENT_MODELS_STORAGE_KEY = "budgetlens.assistant.recent-models.v1"
const MAX_RECENT_MODELS = 5

function readRecentModelIds(): string[] {
  try {
    if (typeof window === "undefined" || !window.localStorage) return []
    const raw = window.localStorage.getItem(RECENT_MODELS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const ids: string[] = []
    for (const entry of parsed) {
      if (typeof entry !== "string" || !entry) continue
      if (ids.includes(entry)) continue
      ids.push(entry)
      if (ids.length >= MAX_RECENT_MODELS) break
    }
    return ids
  } catch {
    return []
  }
}

function trimCompactNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`
}

function formatContextTokens(tokens: number): string | null {
  if (!Number.isFinite(tokens) || tokens < 1000) return null
  if (tokens >= 1_000_000) return `${trimCompactNumber(tokens / 1_000_000)}M`
  return `${trimCompactNumber(tokens / 1000)}k`
}

export function ModelSelect({ models, value, onChange, onCustom, disabled }: ModelSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeId, setActiveId] = useState<string | null>(null)
  const [recentIds, setRecentIds] = useState<string[]>(readRecentModelIds)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const selected = models.find((model) => model.id === value)

  const recentModels = useMemo(() => {
    if (recentIds.length === 0) return []
    const byId = new Map(models.map((model) => [model.id, model] as const))
    const list: ModelSelectOption[] = []
    for (const id of recentIds) {
      const model = byId.get(id)
      if (!model) continue
      if (query.trim() && !matchesQuery(model, query)) continue
      list.push(model)
    }
    return list
  }, [models, recentIds, query])

  const filtered = useMemo(() => {
    const queryModels = query.trim() ? models.filter((model) => matchesQuery(model, query)) : models
    const recentSet = new Set(recentModels.map((model) => model.id))
    const rest = queryModels.filter((model) => !recentSet.has(model.id))
    const groups = groupModels(rest).filter((group) => group.models.length > 0)
    if (recentModels.length === 0) return groups
    return [{ provider: "Recent", models: recentModels }, ...groups]
  }, [models, query, recentModels])

  const flatIds = useMemo(
    () => filtered.flatMap((group) => group.models.map((model) => model.id)),
    [filtered],
  )

  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveId(value)
      searchRef.current?.focus()
    }
  }, [open, value])

  useEffect(() => {
    if (open && activeId) {
      listRef.current
        ?.querySelector(`[data-option-id="${CSS.escape(activeId)}"]`)
        ?.scrollIntoView({ block: "nearest" })
    }
  }, [open, activeId])

  function moveActive(direction: 1 | -1) {
    if (flatIds.length === 0) return
    const current = activeId ? flatIds.indexOf(activeId) : -1
    const next = flatIds[(current + direction + flatIds.length) % flatIds.length]
    if (next) setActiveId(next)
  }

  function choose(id: string) {
    setRecentIds((current) => {
      const next = [id, ...current.filter((entry) => entry !== id)].slice(0, MAX_RECENT_MODELS)
      try {
        window.localStorage.setItem(RECENT_MODELS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Storage may be unavailable (private mode); recent list stays in memory.
      }
      return next
    })
    onChange(id)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select opencode model"
        onClick={() => setOpen((isOpen) => !isOpen)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-2 text-left text-xs",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className="min-w-0 truncate">
          <span className="font-medium">{selected?.name ?? value}</span>
          {selected && <span className="text-muted-foreground"> · {selected.provider}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close model list"
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xl">
            <div className="flex items-center gap-2 border-b px-2">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Input
                ref={searchRef}
                aria-label="Search models"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActiveId(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault()
                    moveActive(1)
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault()
                    moveActive(-1)
                  } else if (event.key === "Enter") {
                    event.preventDefault()
                    if (activeId) choose(activeId)
                    else if (flatIds[0]) choose(flatIds[0])
                  } else if (event.key === "Escape") {
                    setOpen(false)
                  }
                }}
                placeholder={
                  models.length > 0 ? `Search ${models.length} models…` : "Search models…"
                }
                className="border-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <div ref={listRef} id="assistant-model-list" className="max-h-64 overflow-y-auto p-1">
              {filtered.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  No models match “{query}”.
                </p>
              )}
              {filtered.map((group) => (
                <div key={group.provider}>
                  <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.provider}
                  </p>
                  {group.models.map((model) => {
                    const active = model.id === activeId
                    const isSelected = model.id === value
                    const contextLabel =
                      typeof model.contextTokens === "number"
                        ? formatContextTokens(model.contextTokens)
                        : null
                    return (
                      <button
                        key={model.id}
                        type="button"
                        data-option-id={model.id}
                        onMouseEnter={() => setActiveId(model.id)}
                        onClick={() => choose(model.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs",
                          active ? "bg-accent text-accent-foreground" : undefined,
                        )}
                      >
                        <Check
                          className={cn(
                            "size-4 shrink-0",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span
                              aria-hidden="true"
                              className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                providerDotClass(model.provider),
                              )}
                            />
                            <span className="truncate font-medium">{model.name}</span>
                            {model.free && (
                              <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-px text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                free
                              </span>
                            )}
                            {model.vision === true && (
                              <span
                                title="Vision capable"
                                className="inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
                              >
                                <Eye className="size-3" aria-hidden="true" />
                                <span className="sr-only">Vision capable</span>
                              </span>
                            )}
                            {model.reasoning === true && (
                              <span
                                title="Reasoning capable"
                                className="inline-flex shrink-0 items-center rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
                              >
                                <Brain className="size-3" aria-hidden="true" />
                                <span className="sr-only">Reasoning capable</span>
                              </span>
                            )}
                            {contextLabel && (
                              <span
                                title={
                                  typeof model.contextTokens === "number"
                                    ? `${model.contextTokens} tokens context`
                                    : "Large context window"
                                }
                                className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
                              >
                                {contextLabel}
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-muted-foreground">{model.id}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="border-t p-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onCustom()
                }}
                className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Custom model id…
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
