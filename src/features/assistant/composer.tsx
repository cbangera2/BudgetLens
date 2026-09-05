import { Send, Square } from "lucide-react"
import { useEffect, useRef, type KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"

export interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  busy: boolean
  onStop: () => void
  disabled?: boolean
  placeholder?: string
}

const MAX_COMPOSER_HEIGHT = 144

export function Composer({
  value,
  onChange,
  onSend,
  busy,
  onStop,
  disabled,
  placeholder,
}: ComposerProps) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  const inputDisabled = disabled === true
  const canSend = value.trim().length > 0 && !busy && !inputDisabled

  useEffect(() => {
    const element = areaRef.current
    if (!element) return
    element.style.height = "auto"
    element.style.height = `${Math.min(element.scrollHeight, MAX_COMPOSER_HEIGHT)}px`
  }, [value])

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (canSend) onSend()
  }

  return (
    <div>
      <div
        className={cn(
          "flex items-end gap-2 rounded-3xl border border-input bg-background p-2 pl-4 shadow-sm",
          "transition-colors focus-within:ring-2 focus-within:ring-ring",
        )}
      >
        <textarea
          ref={areaRef}
          rows={1}
          aria-label="Ask the assistant"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={inputDisabled}
          placeholder={placeholder ?? "Ask about spending, budgets…"}
          className="max-h-36 min-h-10 w-full resize-none overflow-y-auto bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
        {busy ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Stop assistant"
            title="Stop assistant"
            disabled={inputDisabled}
            onClick={onStop}
            className="shrink-0 rounded-full"
          >
            <Square className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            aria-label="Send message"
            title="Send message"
            disabled={!canSend}
            onClick={onSend}
            className="shrink-0 rounded-full"
          >
            <Send className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      <p className="px-4 pt-1 text-[11px] text-muted-foreground">
        Enter to send · Shift+Enter newline
      </p>
    </div>
  )
}
