import { afterEach, describe, expect, it, vi } from "vitest"

import { shareFile } from "@/lib/native"

const png = () => new Blob(["synthetic-png-bytes"], { type: "image/png" })

function mockDownload(): { created: Blob[]; clicked: string[] } {
  const created: Blob[] = []
  const clicked: string[] = []
  vi.stubGlobal("URL", {
    createObjectURL: (blob: Blob): string => {
      created.push(blob)
      return "blob:mock"
    },
    revokeObjectURL: (): void => {},
  })
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function (this: HTMLAnchorElement) {
      clicked.push(this.download)
    },
  )
  return { created, clicked }
}

describe("shareFile binary helper", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("downloads the PNG on web when no share or clipboard is available", async () => {
    vi.stubGlobal("navigator", {})
    vi.stubGlobal("ClipboardItem", undefined)
    const { created, clicked } = mockDownload()

    const outcome = await shareFile("budgetlens-year-review-2025.png", png(), "BudgetLens")

    expect(outcome).toBe("downloaded")
    expect(created).toHaveLength(1)
    expect(created[0]?.type).toBe("image/png")
    expect(clicked).toEqual(["budgetlens-year-review-2025.png"])
  })

  it("uses the Web Share sheet with files when supported", async () => {
    const shared: unknown[] = []
    vi.stubGlobal("navigator", {
      canShare: () => true,
      share: async (data: unknown) => {
        shared.push(data)
      },
    })
    vi.stubGlobal("ClipboardItem", undefined)

    const outcome = await shareFile("budgetlens-year-review-2025.png", png())

    expect(outcome).toBe("shared")
    expect(shared).toHaveLength(1)
  })

  it("treats share cancellation as a resolved dismissal", async () => {
    vi.stubGlobal("navigator", {
      canShare: () => true,
      share: async () => {
        const error = new Error("Share canceled")
        error.name = "AbortError"
        throw error
      },
    })
    vi.stubGlobal("ClipboardItem", undefined)
    const { created } = mockDownload()

    const outcome = await shareFile("budgetlens-year-review-2025.png", png())

    expect(outcome).toBe("shared")
    expect(created).toHaveLength(0)
  })

  it("copies the image to the clipboard when Web Share is unavailable", async () => {
    const written: unknown[] = []
    vi.stubGlobal("navigator", {
      clipboard: {
        write: async (items: unknown) => {
          written.push(items)
        },
      },
    })
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(public readonly data: Record<string, Blob>) {}
      },
    )

    const outcome = await shareFile("budgetlens-year-review-2025.png", png())

    expect(outcome).toBe("copied")
    expect(written).toHaveLength(1)
  })
})
