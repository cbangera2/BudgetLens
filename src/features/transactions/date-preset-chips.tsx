import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { DATE_PRESETS, getDatePresetRange, matchDatePreset, type DateRange } from "./date-presets"

interface DatePresetChipsProps {
  from: string
  to: string
  onChange: (range: DateRange) => void
}

/** Date preset chips driving the `from`/`to` transaction filters. */
export function DatePresetChips({ from, to, onChange }: DatePresetChipsProps) {
  const active = matchDatePreset(from, to)
  return (
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
      <fieldset>
        <legend className="sr-only">Date range presets</legend>
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={active === preset.id ? "default" : "outline"}
              aria-pressed={active === preset.id}
              onClick={() => onChange(getDatePresetRange(preset.id))}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-1 text-xs text-muted-foreground">
        <label htmlFor="transaction-from-date">From</label>
        <Input
          id="transaction-from-date"
          aria-label="From date"
          type="date"
          className="h-9 w-36"
          value={from}
          max={to || undefined}
          onChange={(event) => onChange({ from: event.target.value, to })}
        />
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground">
        <label htmlFor="transaction-to-date">To</label>
        <Input
          id="transaction-to-date"
          aria-label="To date"
          type="date"
          className="h-9 w-36"
          value={to}
          min={from || undefined}
          onChange={(event) => onChange({ from, to: event.target.value })}
        />
      </div>
    </div>
  )
}
