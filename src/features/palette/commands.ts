// Command registry for the palette: every static route, core actions, and
// assistant presets. Runs through the app router singleton (route paths
// only); no route, form, or panel modules are modified.
//
// Array order is the common-actions order: stable sorting keeps it for score
// ties and for the empty query after recents.

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
      id: "add-transaction",
      title: "Add transaction",
      keywords: "new create expense income",
      category: "Actions",
      run: go("/transactions"),
    },
    {
      id: "go-transactions",
      title: "Go to Transactions",
      keywords: "expenses spending activity",
      category: "Navigate",
      run: go("/transactions"),
    },
    {
      id: "go-budgets",
      title: "Go to Budgets",
      keywords: "limits spending plan",
      category: "Navigate",
      run: go("/budgets"),
    },
    {
      id: "import-files",
      title: "Import files",
      keywords: "upload csv json bank",
      category: "Actions",
      run: go("/imports"),
    },
    {
      id: "go-overview",
      title: "Go to Overview",
      keywords: "home dashboard",
      category: "Navigate",
      run: go("/"),
    },
    {
      id: "go-review",
      title: "Go to Review",
      keywords: "inbox approve pending",
      category: "Navigate",
      run: go("/review"),
    },
    {
      id: "go-imports",
      title: "Go to Imports",
      keywords: "upload csv json files",
      category: "Navigate",
      run: go("/imports"),
    },
    {
      id: "go-net-worth",
      title: "Go to Net worth",
      keywords: "wealth assets investments",
      category: "Navigate",
      run: go("/net-worth"),
    },
    {
      id: "go-groups",
      title: "Go to Groups",
      keywords: "shared split settle",
      category: "Navigate",
      run: go("/groups"),
    },
    {
      id: "toggle-theme",
      title: "Toggle theme",
      keywords: "dark light mode appearance",
      category: "Actions",
      run: deps.toggleTheme,
    },
    {
      id: "go-settings",
      title: "Go to Settings",
      keywords: "preferences backup keys",
      category: "Navigate",
      run: go("/settings"),
    },
    ...ASSISTANT_PRESET_QUESTIONS.map(
      (question, index): PaletteCommand => ({
        id: `ask-assistant-${index + 1}`,
        title: `Ask assistant: ${question}`,
        keywords: "ai help question chat",
        category: "Assistant",
        run: askAssistant(question),
      }),
    ),
  ]
}

const USAGE_BOOST = 25

/**
 * Filter by fuzzy match, then rank: fuzzy score first, used commands gain a
 * repeat boost. Empty query shows recents first, then the registry order
 * above. Sorts are stable, so ties keep registry order.
 */
export function filterAndRankPalette(
  query: string,
  commands: readonly PaletteCommand[],
  usage: CommandUsage,
): PaletteCommand[] {
  const trimmed = query.trim()
  if (!trimmed) {
    const rank = new Map(usage.map((id, index) => [id, index] as const))
    return [...commands].toSorted(
      (a, b) => (rank.get(a.id) ?? usage.length) - (rank.get(b.id) ?? usage.length),
    )
  }
  const scored: Array<{ command: PaletteCommand; score: number }> = []
  for (const command of commands) {
    const best = Math.max(
      fuzzyScore(trimmed, command.title) ?? -Infinity,
      fuzzyScore(trimmed, command.keywords) ?? -Infinity,
    )
    if (!Number.isFinite(best)) continue
    scored.push({ command, score: best + (usage.includes(command.id) ? USAGE_BOOST : 0) })
  }
  return scored.toSorted((a, b) => b.score - a.score).map((entry) => entry.command)
}
