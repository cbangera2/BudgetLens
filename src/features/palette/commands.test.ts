import { describe, expect, it, vi } from "vitest"

import {
  ASSISTANT_PRESET_QUESTIONS,
  buildPaletteCommands,
  filterAndRankPalette,
  PALETTE_ROUTE_TARGETS,
} from "@/features/palette/commands"
import { recordUsage } from "@/features/palette/recents"

vi.mock("@/app/router", () => ({
  router: { navigate: vi.fn<(options: { to: string }) => Promise<void>>(async () => undefined) },
}))

import { router } from "@/app/router"

const navigate = vi.mocked(router.navigate)
const deps = { toggleTheme: vi.fn<() => void>() }

function ids(query: string, usage = {}): string[] {
  return filterAndRankPalette(query, buildPaletteCommands(deps), usage).map((command) => command.id)
}

describe("palette command registry", () => {
  it("covers every static route with a navigation command", () => {
    const commands = buildPaletteCommands(deps)
    for (const to of PALETTE_ROUTE_TARGETS) {
      const match = commands.find((command) => {
        command.run()
        const called = navigate.mock.calls.some((call) => call[0].to === to)
        navigate.mockClear()
        return called
      })
      expect(match, `missing navigation command for ${to}`).toBeDefined()
    }
  })

  it("includes the core actions", () => {
    const found = ids("")
    expect(found).toContain("add-transaction")
    expect(found).toContain("import-files")
    expect(found).toContain("toggle-theme")
  })

  it("includes one assistant command per preset question", () => {
    const commands = buildPaletteCommands(deps)
    const assistant = commands.filter((command) => command.category === "Assistant")
    expect(assistant).toHaveLength(ASSISTANT_PRESET_QUESTIONS.length)
    for (const question of ASSISTANT_PRESET_QUESTIONS) {
      expect(assistant.some((command) => command.title.includes(question))).toBe(true)
    }
  })

  it("routes add-transaction through the transactions page", () => {
    buildPaletteCommands(deps)
      .find((command) => command.id === "add-transaction")
      ?.run()
    expect(navigate).toHaveBeenCalledWith({ to: "/transactions" })
  })

  it("delegates toggle-theme to the host theme", () => {
    buildPaletteCommands(deps)
      .find((command) => command.id === "toggle-theme")
      ?.run()
    expect(deps.toggleTheme).toHaveBeenCalledTimes(1)
  })
})

describe("palette ranking", () => {
  it("shows common actions first on an empty query", () => {
    expect(ids("")[0]).toBe("add-transaction")
  })

  it("shows recents first on an empty query", () => {
    const storage = new Map<string, string>()
    const store = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    }
    recordUsage(store, "go-settings", 100)
    const usage = recordUsage(store, "toggle-theme", 200)
    const ranked = ids("", usage)
    expect(ranked[0]).toBe("toggle-theme")
    expect(ranked[1]).toBe("go-settings")
  })

  it("ranks a typo query on the intended command", () => {
    expect(ids("bdgets")[0]).toBe("go-budgets")
    expect(ids("setings")[0]).toBe("go-settings")
  })

  it("matches case-insensitively and filters non-matches out", () => {
    const ranked = ids("BUDGETS")
    expect(ranked[0]).toBe("go-budgets")
    expect(ranked).not.toContain("go-overview")
    expect(ids("zzz")).toHaveLength(0)
  })
})
