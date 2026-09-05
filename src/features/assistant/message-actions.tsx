import { Check, Copy, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/cn"

export interface MessageActionsProps {
  content: string
  onRegenerate?: () => void
  onFeedback?: (kind: "up" | "down") => void
}

function copyWithFallback(text: string): Promise<void> {
  const clipboard = globalThis.navigator?.clipboard
  if (clipboard && typeof clipboard.writeText === "function") {
    return clipboard.writeText(text)
  }
  return new Promise<void>((resolve) => {
    try {
      const area = document.createElement("textarea")
      area.value = text
      area.style.position = "fixed"
      area.style.opacity = "0"
      document.body.appendChild(area)
      area.select()
      document.execCommand("copy")
      document.body.removeChild(area)
    } catch {
      // Clipboard unavailable; still resolve so the UI does not hang.
    }
    resolve()
  })
}

export function MessageActions({ content, onRegenerate, onFeedback }: MessageActionsProps) {
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  async function handleCopy(): Promise<void> {
    try {
      await copyWithFallback(content)
      setCopied(true)
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Ignore clipboard failures in private mode.
    }
  }

  function handleFeedback(kind: "up" | "down"): void {
    setFeedback(kind)
    if (onFeedback) onFeedback(kind)
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={copied ? "Copied" : "Copy message"}
        onClick={() => {
          void handleCopy()
        }}
        className="h-7 px-2 text-xs text-muted-foreground"
      >
        {copied ? (
          <Check className="size-3.5" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
      {onRegenerate ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Regenerate response"
          title="Regenerate"
          onClick={onRegenerate}
          className="size-7 text-muted-foreground"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
      {onFeedback ? (
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Good response"
            aria-pressed={feedback === "up"}
            title="Good response"
            onClick={() => handleFeedback("up")}
            className={cn(
              "size-7 text-muted-foreground",
              feedback === "up" ? "bg-accent text-accent-foreground" : undefined,
            )}
          >
            <ThumbsUp className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Bad response"
            aria-pressed={feedback === "down"}
            title="Bad response"
            onClick={() => handleFeedback("down")}
            className={cn(
              "size-7 text-muted-foreground",
              feedback === "down" ? "bg-accent text-accent-foreground" : undefined,
            )}
          >
            <ThumbsDown className="size-3.5" aria-hidden="true" />
          </Button>
        </span>
      ) : null}
    </div>
  )
}
