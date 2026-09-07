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
    <div className="grid gap-1.5">
      <fieldset className="grid gap-1.5">
        <legend className="text-sm leading-none font-medium">Date</legend>
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
      <div className="flex flex-wrap gap-2">
        <div className="grid flex-1 gap-1 text-xs text-muted-foreground sm:flex-none">
          <label htmlFor="transaction-from-date">From</label>
          <Input
            id="transaction-from-date"
            aria-label="From date"
            type="date"
            className="h-9 sm:w-40"
            value={from}
            max={to || undefined}
            onChange={(event) => onChange({ from: event.target.value, to })}
          />
        </div>
        <div className="grid flex-1 gap-1 text-xs text-muted-foreground sm:flex-none">
          <label htmlFor="transaction-to-date">To</label>
          <Input
            id="transaction-to-date"
            aria-label="To date"
            type="date"
            className="h-9 sm:w-40"
            value={to}
            min={from || undefined}
            onChange={(event) => onChange({ from, to: event.target.value })}
          />
        </div>
      </div>
    </div>
  )
}
