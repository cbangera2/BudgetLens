// Desktop-first command palette (⌘K/Ctrl+K): fuzzy-filtered actions with
// keyboard-first navigation, focus return, and screen-reader announcements.

import { useEffect, useMemo, useRef, useState } from "react"

import { useTheme } from "@/app/theme-provider"
import { Input } from "@/components/ui/input"
import {
  buildPaletteCommands,
  filterAndRankPalette,
  type PaletteCommand,
} from "@/features/palette/commands"
import { readUsage, recordUsage, type CommandUsage } from "@/features/palette/recents"
import { cn } from "@/lib/cn"

const LISTBOX_ID = "command-palette-listbox"
const MAX_RESULTS = 9

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable)
  )
}

function safeReadUsage(): Record<string, CommandUsage> {
  try {
    return readUsage(window.localStorage)
  } catch {
    return {}
  }
}

function optionId(command: PaletteCommand): string {
  return `command-palette-option-${command.id}`
}

export function CommandPaletteHost() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [usageTick, setUsageTick] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const commands = useMemo(
    () =>
      buildPaletteCommands({
        toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
      }),
    [theme, setTheme],
  )
  const usage = useMemo(
    () => (open ? safeReadUsage() : {}),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Re-read on open and after each run.
    [open, usageTick],
  )
  const results = useMemo(
    () => filterAndRankPalette(query, commands, usage).slice(0, MAX_RESULTS),
    [query, commands, usage],
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const isPaletteShortcut =
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k" &&
        !event.shiftKey &&
        !event.altKey
      if (!isPaletteShortcut) return
      // Never hijack keystrokes while the user is typing elsewhere.
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      setOpen(true)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setQuery("")
    setActiveIndex(0)
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  function close(returnFocus = true): void {
    setOpen(false)
    if (returnFocus) {
      const target = returnFocusRef.current
      returnFocusRef.current = null
      if (target && target.isConnected) requestAnimationFrame(() => target.focus())
    }
  }

  function run(command: PaletteCommand): void {
    try {
      recordUsage(window.localStorage, command.id)
    } catch {
      // Ranking persistence is best-effort; the action already ran.
    }
    setUsageTick((tick) => tick + 1)
    close(false)
    command.run()
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => (results.length === 0 ? 0 : (index + 1) % results.length))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) =>
        results.length === 0 ? 0 : (index - 1 + results.length) % results.length,
      )
    } else if (event.key === "Enter") {
      event.preventDefault()
      const command = results[activeIndex]
      if (command) run(command)
    } else if (event.key === "Escape") {
      event.preventDefault()
      close()
    } else if (event.key === "Tab") {
      // Focus trap: options use aria-activedescendant, so keep focus cycling here.
      event.preventDefault()
      const direction = event.shiftKey ? -1 : 1
      setActiveIndex((index) =>
        results.length === 0 ? 0 : (index + direction + results.length) % results.length,
      )
    }
  }

  if (!open) return null

  const active = results[activeIndex]
  const status =
    query.trim() === ""
      ? `${results.length} commands. Recent and common actions first.`
      : results.length === 0
        ? `No matching commands for ${query}.`
        : `${results.length} result${results.length === 1 ? "" : "s"} for ${query}.`

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 bg-foreground/35 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Custom overlay positioning; the native dialog top layer would break this composition.
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="mx-auto mt-[10vh] w-full max-w-lg overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-2xl"
      >
        <div className="border-b p-2">
          {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- Input renders a natively focusable input element. */}
          <Input
            ref={inputRef}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Correct ARIA combobox pattern for the palette search box.
            role="combobox"
            aria-expanded="true"
            aria-controls={LISTBOX_ID}
            aria-activedescendant={active ? optionId(active) : undefined}
            aria-label="Search commands"
            placeholder="Type a command or search…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {results.length > 0 ? (
          <ul
            id={LISTBOX_ID}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- Listbox pattern needs a container with options; select/option cannot render rich rows.
            role="listbox"
            aria-label="Matching commands"
            className="max-h-80 overflow-y-auto p-1.5"
          >
            {results.map((command, index) => (
              <li
                key={command.id}
                id={optionId(command)}
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- Listbox options carry selection state; native option tags cannot render this layout.
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => {
                  // Fire before the input blurs so keyboard focus stays sane.
                  event.preventDefault()
                  run(command)
                }}
                onMouseMove={() => {
                  if (index !== activeIndex) setActiveIndex(index)
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                  index === activeIndex ? "bg-accent text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="truncate font-medium">{command.title}</span>
                <span className="shrink-0 text-xs">{command.category}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No matching commands.
          </p>
        )}
        <div className="flex items-center justify-between border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span aria-hidden="true">↑↓ navigate · Enter run · Esc close</span>
          <output aria-live="polite">{status}</output>
        </div>
      </div>
    </div>
  )
}
