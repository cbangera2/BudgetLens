// Command registry for the palette: every static route, core actions, and
// assistant presets. Runs through the app router singleton (route paths
// only); no route, form, or panel modules are modified.

import { router } from "@/app/router"
import {
  prefillAssistantComposerSoon,
  requestAssistantWithQuestion,
} from "@/features/palette/assistant-bridge"
import { fuzzyScore } from "@/features/palette/fuzzy"
import type { CommandUsage } from "@/features/palette/recents"

export type PaletteDestination =
  | "/"
  | "/review"
  | "/net-worth"
  | "/transactions"
  | "/groups"
  | "/budgets"
  | "/imports"
  | "/settings"

export interface PaletteCommand {
  id: string
  title: string
  keywords: string
  category: "Navigate" | "Actions" | "Assistant"
  /** Baseline popularity so common actions rank sensibly with no history. */
  weight: number
  run: () => void
}

export interface PaletteDependencies {
  toggleTheme: () => void
}

function go(to: PaletteDestination): () => void {
  return () => {
    void router.navigate({ to })
  }
}

/** Best-effort: after landing on /transactions, focus its Add button. */
function focusAddTransactionButton(): void {
  let attempts = 0
  const timer = window.setInterval(() => {
    attempts += 1
    try {
      const buttons = document.querySelectorAll<HTMLButtonElement>("main button")
      const add = [...buttons].find((button) => button.textContent?.trim() === "Add transaction")
      if (add) {
        add.focus()
        window.clearInterval(timer)
        return
      }
    } catch {
      // DOM lookup is best-effort; navigation already succeeded.
    }
    if (attempts >= 15) window.clearInterval(timer)
  }, 100)
}

function askAssistant(question: string): () => void {
  return () => {
    requestAssistantWithQuestion(question)
    prefillAssistantComposerSoon(question)
  }
}

export const ASSISTANT_PRESET_QUESTIONS = [
  "Where did my money go last month?",
  "Am I over budget anywhere?",
  "How is my net worth trending?",
] as const

export function buildPaletteCommands(deps: PaletteDependencies): PaletteCommand[] {
  return [
    {
      id: "go-overview",
      title: "Go to Overview",
      keywords: "home dashboard",
      category: "Navigate",
      weight: 60,
      run: go("/"),
    },
    {
      id: "go-review",
      title: "Go to Review",
      keywords: "inbox approve pending",
      category: "Navigate",
      weight: 55,
      run: go("/review"),
    },
    {
      id: "go-transactions",
      title: "Go to Transactions",
      keywords: "expenses spending activity",
      category: "Navigate",
      weight: 90,
      run: go("/transactions"),
    },
    {
      id: "go-groups",
      title: "Go to Groups",
      keywords: "shared split settle",
      category: "Navigate",
      weight: 40,
      run: go("/groups"),
    },
    {
      id: "go-budgets",
      title: "Go to Budgets",
      keywords: "limits spending plan",
      category: "Navigate",
      weight: 70,
      run: go("/budgets"),
    },
    {
      id: "go-net-worth",
      title: "Go to Net worth",
      keywords: "wealth assets investments",
      category: "Navigate",
      weight: 45,
      run: go("/net-worth"),
    },
    {
      id: "go-imports",
      title: "Go to Imports",
      keywords: "upload csv json files",
      category: "Navigate",
      weight: 50,
      run: go("/imports"),
    },
    {
      id: "go-settings",
      title: "Go to Settings",
      keywords: "preferences backup keys",
      category: "Navigate",
      weight: 30,
      run: go("/settings"),
    },
    {
      id: "add-transaction",
      title: "Add transaction",
      keywords: "new create expense income",
      category: "Actions",
      weight: 100,
      run: () => {
        void router.navigate({ to: "/transactions" })
        focusAddTransactionButton()
      },
    },
    {
      id: "import-files",
      title: "Import files",
      keywords: "upload csv json bank",
      category: "Actions",
      weight: 65,
      run: go("/imports"),
    },
    {
      id: "toggle-theme",
      title: "Toggle theme",
      keywords: "dark light mode appearance",
      category: "Actions",
      weight: 35,
      run: deps.toggleTheme,
    },
    ...ASSISTANT_PRESET_QUESTIONS.map(
      (question, index): PaletteCommand => ({
        id: `ask-assistant-${index + 1}`,
        title: `Ask assistant: ${question}`,
        keywords: "ai help question chat",
        category: "Assistant",
        weight: 20 - index,
        run: askAssistant(question),
      }),
    ),
  ]
}

/** Every static route the palette must be able to navigate to. */
export const PALETTE_ROUTE_TARGETS: readonly PaletteDestination[] = [
  "/",
  "/review",
  "/net-worth",
  "/transactions",
  "/groups",
  "/budgets",
  "/imports",
  "/settings",
]

const USAGE_BOOST = 25

/**
 * Filter by fuzzy match, then rank: fuzzy score first, recorded usage and
 * baseline popularity break ties. Empty query shows recents first, then the
 * common actions in baseline order.
 */
export function filterAndRankPalette(
  query: string,
  commands: readonly PaletteCommand[],
  usage: Record<string, CommandUsage>,
): PaletteCommand[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return [...commands].toSorted((a, b) => {
      const ua = usage[a.id]
      const ub = usage[b.id]
      if (ua && ub) {
        if (ub.lastUsed !== ua.lastUsed) return ub.lastUsed - ua.lastUsed
        return b.weight - a.weight
      }
      if (ua) return -1
      if (ub) return 1
      return b.weight - a.weight
    })
  }
  const scored: Array<{ command: PaletteCommand; score: number }> = []
  for (const command of commands) {
    const titleScore = fuzzyScore(trimmed, command.title)
    const keywordScore = fuzzyScore(trimmed, command.keywords)
    const best = Math.max(
      titleScore ?? Number.NEGATIVE_INFINITY,
      keywordScore ?? Number.NEGATIVE_INFINITY,
    )
    if (best === Number.NEGATIVE_INFINITY) continue
    const used = usage[command.id]
    scored.push({
      command,
      score: best + command.weight * 0.05 + (used ? USAGE_BOOST + Math.min(used.count, 10) : 0),
    })
  }
  return scored
    .toSorted((a, b) => b.score - a.score || b.command.weight - a.command.weight)
    .map((entry) => entry.command)
}
