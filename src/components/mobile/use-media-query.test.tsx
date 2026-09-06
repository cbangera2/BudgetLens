import { render } from "@testing-library/react"
import { act } from "react"

import { COARSE_POINTER_QUERY, MOBILE_LAYOUT_QUERY, useMediaQuery } from "./use-media-query"

function mockMatchMedia(matchesQuery: (query: string) => boolean) {
  const listeners = new Map<string, Set<(event: { matches: boolean }) => void>>()
  const mock = (query: string) => ({
    matches: matchesQuery(query),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      const set = listeners.get(query) ?? new Set()
      set.add(listener)
      listeners.set(query, set)
    },
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      listeners.get(query)?.delete(listener)
    },
    dispatchEvent: () => false,
  })
  Object.defineProperty(window, "matchMedia", { configurable: true, value: mock })
  return {
    fire(query: string, matches: boolean) {
      for (const listener of listeners.get(query) ?? []) listener({ matches })
    },
    listenerCount(query: string) {
      return listeners.get(query)?.size ?? 0
    },
  }
}

function Probe({ query, onRender }: { query: string; onRender: (value: boolean) => void }) {
  onRender(useMediaQuery(query))
  return null
}

function renderForTest(node: React.ReactNode) {
  return render(node)
}

describe("useMediaQuery", () => {
  it("reads the initial match state per query", () => {
    mockMatchMedia((query) => query === MOBILE_LAYOUT_QUERY)
    const seen: boolean[] = []
    renderForTest(<Probe query={MOBILE_LAYOUT_QUERY} onRender={(value) => seen.push(value)} />)
    expect(seen.at(-1)).toBe(true)

    const coarse: boolean[] = []
    renderForTest(<Probe query={COARSE_POINTER_QUERY} onRender={(value) => coarse.push(value)} />)
    expect(coarse.at(-1)).toBe(false)
  })

  it("updates when the media query changes and unsubscribes on unmount", () => {
    const media = mockMatchMedia(() => false)
    const seen: boolean[] = []
    const { unmount } = renderForTest(
      <Probe query={MOBILE_LAYOUT_QUERY} onRender={(value) => seen.push(value)} />,
    )
    expect(seen.at(-1)).toBe(false)
    act(() => media.fire(MOBILE_LAYOUT_QUERY, true))
    expect(seen.at(-1)).toBe(true)
    expect(media.listenerCount(MOBILE_LAYOUT_QUERY)).toBe(1)
    unmount()
    expect(media.listenerCount(MOBILE_LAYOUT_QUERY)).toBe(0)
  })
})
