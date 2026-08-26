import { ChevronDown } from "lucide-react"
import { Popover } from "radix-ui"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/cn"

export interface IncludeExcludeFilterProps {
  label: string
  options: readonly string[]
  included: readonly string[]
  excluded: readonly string[]
  onIncludedChange: (next: string[]) => void
  onExcludedChange: (next: string[]) => void
  placeholder?: string
}

export function IncludeExcludeFilter({
  label,
  options,
  included,
  excluded,
  onIncludedChange,
  onExcludedChange,
  placeholder = "All",
}: IncludeExcludeFilterProps) {
  const [query, setQuery] = useState("")
  const clickTimeoutRef = useRef<number | null>(null)

  const filtered = options.filter((option) =>
    option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )

  const summary = (() => {
    if (!included.length && !excluded.length) return placeholder
    const parts: string[] = []
    if (included.length) parts.push(`${included.length} included`)
    if (excluded.length) parts.push(`${excluded.length} excluded`)
    return parts.join(", ")
  })()

  function handleClick(option: string) {
    if (clickTimeoutRef.current) window.clearTimeout(clickTimeoutRef.current)
    clickTimeoutRef.current = window.setTimeout(() => {
      const isIncluded = included.includes(option)
      const isExcluded = excluded.includes(option)
      if (isIncluded) {
        onIncludedChange(included.filter((value) => value !== option))
        onExcludedChange([...excluded, option])
        return
      }
      if (isExcluded) {
        onExcludedChange(excluded.filter((value) => value !== option))
        return
      }
      onIncludedChange([...included, option])
    }, 280)
  }

  function handleDoubleClick(option: string, event: React.MouseEvent) {
    event.preventDefault()
    if (clickTimeoutRef.current) window.clearTimeout(clickTimeoutRef.current)
    const isExcluded = excluded.includes(option)
    const isIncluded = included.includes(option)
    if (isExcluded) {
      onExcludedChange(excluded.filter((value) => value !== option))
      return
    }
    if (isIncluded) {
      onIncludedChange(included.filter((value) => value !== option))
    }
    onExcludedChange([...excluded.filter((value) => value !== option), option])
  }

  const hasActive = included.length > 0 || excluded.length > 0

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("h-10 w-full justify-between gap-2", hasActive && "border-primary/50")}
          aria-label={label}
        >
          <span className="truncate text-left">
            <span className="font-medium">{label}:</span>{" "}
            <span className="text-muted-foreground">{summary}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[min(20rem,calc(100vw-2rem))] rounded-xl border bg-card p-3 text-card-foreground shadow-lg outline-none"
        >
          <div className="grid gap-2">
            <Input
              type="search"
              placeholder={`Search ${label.toLowerCase()}…`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8"
            />
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              {filtered.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">No matches</p>
              ) : (
                filtered.map((option) => {
                  const isIncluded = included.includes(option)
                  const isExcluded = excluded.includes(option)
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleClick(option)}
                      onDoubleClick={(event) => handleDoubleClick(option, event)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
                        isIncluded && "bg-primary text-primary-foreground hover:bg-primary/90",
                        isExcluded &&
                          "bg-secondary text-secondary-foreground line-through opacity-70",
                      )}
                    >
                      <span className="truncate">{option}</span>
                      {isIncluded && <span className="text-xs">✓</span>}
                      {isExcluded && <span className="text-xs">✕</span>}
                    </button>
                  )
                })
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Click to include, double-click to exclude. Click again to clear.
            </p>
            {hasActive && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onIncludedChange([])
                  onExcludedChange([])
                  setQuery("")
                }}
              >
                Clear {label.toLowerCase()}
              </Button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
