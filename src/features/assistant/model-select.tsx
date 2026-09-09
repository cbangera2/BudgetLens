import { useMemo, useState } from "react"

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

function optionLabel(model: ModelSelectOption): string {
  const flags: string[] = []
  if (model.free) flags.push("free")
  if (model.vision === true) flags.push("vision")
  if (model.reasoning === true) flags.push("reasoning")
  const contextLabel =
    typeof model.contextTokens === "number" ? formatContextTokens(model.contextTokens) : null
  if (contextLabel) flags.push(`${contextLabel} context`)
  const suffix = flags.length > 0 ? ` (${flags.join(", ")})` : ""
  return `${model.name} — ${model.provider}${suffix}`
}

/**
 * Provider-grouped model picker built on a native select: the browser owns
 * the expand/collapse, type-to-filter, and keyboard behavior, so there is no
 * custom collapsed mode to maintain. Recent models lead as the first group;
 * a stale selected id not present in the list stays visible so the current
 * choice is never silently dropped.
 */
export function ModelSelect({ models, value, onChange, onCustom, disabled }: ModelSelectProps) {
  const [recentIds, setRecentIds] = useState<string[]>(readRecentModelIds)

  const selected = models.find((model) => model.id === value)

  const recentModels = useMemo(() => {
    if (recentIds.length === 0) return []
    const byId = new Map(models.map((model) => [model.id, model] as const))
    const list: ModelSelectOption[] = []
    for (const id of recentIds) {
      const model = byId.get(id)
      if (model) list.push(model)
    }
    return list
  }, [models, recentIds])

  const groups = useMemo(() => {
    const recentSet = new Set(recentModels.map((model) => model.id))
    return groupModels(models.filter((model) => !recentSet.has(model.id))).filter(
      (group) => group.models.length > 0,
    )
  }, [models, recentModels])

  function choose(id: string) {
    if (!id) return
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
  }

  return (
    <div className="grid gap-1">
      <select
        aria-label="Select opencode model"
        disabled={disabled}
        value={selected ? value : ""}
        onChange={(event) => choose(event.target.value)}
        className="h-9 w-full rounded-xl border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selected ? null : <option value="">{value}</option>}
        {recentModels.length > 0 ? (
          <optgroup label="Recent">
            {recentModels.map((model) => (
              <option key={model.id} value={model.id}>
                {optionLabel(model)}
              </option>
            ))}
          </optgroup>
        ) : null}
        {groups.map((group) => (
          <optgroup key={group.provider} label={group.provider}>
            {group.models.map((model) => (
              <option key={model.id} value={model.id}>
                {optionLabel(model)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button
        type="button"
        disabled={disabled}
        onClick={onCustom}
        className="w-fit rounded-lg px-2 py-1 text-left text-xs text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        Custom model id…
      </button>
    </div>
  )
}
