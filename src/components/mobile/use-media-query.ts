import { useEffect, useState } from "react"

/** Matches Tailwind's `lg` breakpoint from below (sidebar <-> tab bar). */
export const MOBILE_LAYOUT_QUERY = "(max-width: 1023.98px)"

/** Coarse pointers (touch-first devices): no hover, bigger targets, no JS chart animation. */
export const COARSE_POINTER_QUERY = "(pointer: coarse)"

/**
 * Subscribe to a CSS media query. Falls back to `false` (desktop) when
 * `matchMedia` is unavailable so server-style renders keep the sidebar.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia(query).matches,
  )

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined
    const list = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(list.matches)
    list.addEventListener("change", onChange)
    return () => list.removeEventListener("change", onChange)
  }, [query])

  return matches
}

/** True on small viewports where the bottom tab bar replaces the sidebar. */
export function useIsMobileLayout(): boolean {
  return useMediaQuery(MOBILE_LAYOUT_QUERY)
}

/** True on touch-first devices (disables Recharts animation, enlarges targets). */
export function useIsCoarsePointer(): boolean {
  return useMediaQuery(COARSE_POINTER_QUERY)
}
