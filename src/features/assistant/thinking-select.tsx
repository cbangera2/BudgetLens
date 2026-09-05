import { cn } from "@/lib/cn"

export const THINKING_LEVELS = ["low", "medium", "high"] as const

export type ThinkingLevel = (typeof THINKING_LEVELS)[number]

export const DEFAULT_THINKING_LEVEL: ThinkingLevel = "medium"

const THINKING_TOOLTIPS: Record<ThinkingLevel, string> = {
  low: "Low effort: fastest and cheapest. Short headline answers for simple questions.",
  medium: "Medium effort: balanced depth and speed. Good default.",
  high: "High effort: deeper step-by-step reasoning for hard questions. Slower and may cost more.",
}

interface ThinkingSelectProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

function capitalize(level: ThinkingLevel): string {
  return `${level.charAt(0).toUpperCase()}${level.slice(1)}`
}

export function ThinkingSelect({ value, onChange, disabled }: ThinkingSelectProps) {
  return (
    <fieldset className="flex items-center gap-1 rounded-full border border-input bg-background p-1">
      <legend className="sr-only">Thinking effort</legend>
      {THINKING_LEVELS.map((level) => {
        const selected = value === level
        return (
          <button
            key={level}
            type="button"
            aria-pressed={selected}
            title={THINKING_TOOLTIPS[level]}
            disabled={disabled}
            onClick={() => onChange(level)}
            className={cn(
              "flex-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {capitalize(level)}
          </button>
        )
      })}
    </fieldset>
  )
}
