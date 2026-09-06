import { Link } from "@tanstack/react-router"
import { MoreHorizontal } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react"

import { splitNavigation } from "@/components/mobile/tabs"
import { useIsMobileLayout } from "@/components/mobile/use-media-query"

export interface MobileTabItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>
}

const TAB_BAR_GRID_CLASS = "grid grid-cols-6"

/**
 * Bottom tab bar for small viewports. Lives inside the single Primary `<nav>`
 * in `app-shell.tsx` (which restyles itself from sidebar to tab bar), so
 * there is exactly one Primary landmark on every viewport.
 *
 * Renders nothing on desktop widths (the sidebar owns navigation there) and
 * in environments without `matchMedia`, which keeps jsdom unit tests and
 * desktop screenshots free of duplicate links.
 */
export function MobileTabs({ navigation }: { navigation: readonly MobileTabItem[] }) {
  const isMobileLayout = useIsMobileLayout()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const sheetCloseRef = useRef<HTMLButtonElement>(null)

  const { primary, more } = useMemo(() => splitNavigation(navigation), [navigation])

  // Move focus into the sheet on open and return it to the trigger on close.
  // The ref guard keeps the initial mount from stealing focus.
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (moreOpen) {
      wasOpenRef.current = true
      sheetCloseRef.current?.focus()
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false
      moreButtonRef.current?.focus({ preventScroll: true })
    }
  }, [moreOpen])

  useEffect(() => {
    if (!moreOpen) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [moreOpen])

  if (!isMobileLayout) return null

  return (
    <div className="lg:hidden">
      <ul className={TAB_BAR_GRID_CLASS} aria-label="Primary destinations">
        {primary.map(({ to, label, icon: Icon }) => (
          <li key={to} className="min-w-0">
            <Link
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex min-h-11 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] leading-tight font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&.active]:text-primary"
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          </li>
        ))}
        <li className="min-w-0">
          <button
            ref={moreButtonRef}
            type="button"
            aria-expanded={moreOpen}
            aria-controls="mobile-more-sheet"
            onClick={() => setMoreOpen((open) => !open)}
            className="flex min-h-11 w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] leading-tight font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-expanded:text-primary"
          >
            <MoreHorizontal className="size-5 shrink-0" aria-hidden="true" />
            <span className="max-w-full truncate">More</span>
          </button>
        </li>
      </ul>
      {moreOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close more destinations"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 cursor-default bg-foreground/35 backdrop-blur-[2px]"
          />
          <dialog
            id="mobile-more-sheet"
            open
            aria-modal="true"
            aria-label="More destinations"
            className="absolute inset-x-0 bottom-0 max-h-[70svh] overflow-y-auto rounded-t-3xl border-t bg-card pb-[env(safe-area-inset-bottom)] text-card-foreground shadow-2xl"
          >
            <span
              aria-hidden="true"
              className="mx-auto mt-2.5 block h-1 w-10 rounded-full bg-border"
            />
            <div className="flex items-center justify-between px-4 pt-1 pb-2">
              <p className="text-sm font-semibold">More destinations</p>
              <button
                ref={sheetCloseRef}
                type="button"
                onClick={() => setMoreOpen(false)}
                className="grid min-h-11 min-w-11 place-items-center rounded-full text-sm font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Close
              </button>
            </div>
            <ul className="px-2 pb-4">
              {more.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <Link
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&.active]:bg-accent [&.active]:text-accent-foreground"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </dialog>
        </div>
      ) : null}
    </div>
  )
}
