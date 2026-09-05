import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { DesktopUpdateCard } from "@/features/settings/desktop-update-card"

afterEach(() => {
  cleanup()
  // oxlint-disable-next-line no-underscore-dangle -- Tauri 2 runtime global.
  delete window.__TAURI_INTERNALS__
})

describe("DesktopUpdateCard", () => {
  it("renders nothing on web (no Tauri runtime)", () => {
    const { container } = render(<DesktopUpdateCard />)
    expect(container).toBeEmptyDOMElement()
  })
})
