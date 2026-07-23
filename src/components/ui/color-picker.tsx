import { useEffect, useId, useState } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/cn"

const hexColorPattern = /^#[\da-f]{6}$/i

export interface ColorPickerProps {
  id?: string
  value: string
  onChange: (value: string) => void
  swatches?: readonly { value: string; label: string }[]
  className?: string
}

const defaultSwatches = [
  { value: "#ffffff", label: "White" },
  { value: "#6b7280", label: "Gray" },
  { value: "#000000", label: "Black" },
  { value: "#334155", label: "Slate" },
] as const

export function ColorPicker({
  id,
  value,
  onChange,
  swatches = defaultSwatches,
  className,
}: ColorPickerProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const [draft, setDraft] = useState(value)
  const validDraft = hexColorPattern.test(draft)

  useEffect(() => setDraft(value), [value])

  const chooseColor = (next: string) => {
    setDraft(next)
    onChange(next.toLowerCase())
  }

  return (
    <div className={cn("grid gap-3", className)}>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Color swatches</legend>
        {swatches.map((swatch) => {
          const selected = swatch.value.toLowerCase() === value.toLowerCase()
          return (
            <button
              key={swatch.value}
              type="button"
              aria-label={swatch.label}
              aria-pressed={selected}
              title={swatch.label}
              className={cn(
                "size-9 rounded-full border-2 border-background shadow-[0_0_0_1px_var(--border)] transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected && "shadow-[0_0_0_2px_var(--ring)]",
              )}
              style={{ backgroundColor: swatch.value }}
              onClick={() => chooseColor(swatch.value)}
            />
          )
        })}
        <label
          className="relative flex h-9 cursor-pointer items-center gap-2 rounded-lg border bg-background px-2 text-xs font-medium outline-none focus-within:ring-2 focus-within:ring-ring"
          title="Choose another color"
        >
          <span
            className="size-5 rounded-full border"
            style={{ backgroundColor: validDraft ? draft : value }}
            aria-hidden="true"
          />
          Custom
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Choose custom color"
            value={hexColorPattern.test(value) ? value : "#334155"}
            onChange={(event) => chooseColor(event.target.value)}
          />
        </label>
      </fieldset>
      <div className="grid gap-1.5">
        <Input
          id={inputId}
          aria-label="Label color hexadecimal value"
          aria-invalid={!validDraft}
          aria-describedby={!validDraft ? errorId : undefined}
          value={draft}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value
            setDraft(next)
            if (hexColorPattern.test(next)) onChange(next.toLowerCase())
          }}
        />
        {!validDraft && (
          <p id={errorId} className="text-xs text-destructive" role="alert">
            Enter a six-digit hex color, such as #334155.
          </p>
        )}
      </div>
    </div>
  )
}
