import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ThemeProvider } from "@/app/theme-provider"
import { CommandPaletteHost } from "@/features/palette/command-palette"

vi.mock("@/app/router", () => ({
  router: { navigate: vi.fn<(options: { to: string }) => Promise<void>>(async () => undefined) },
}))

import { router } from "@/app/router"

const navigate = vi.mocked(router.navigate)

function renderPalette() {
  return render(
    <ThemeProvider>
      <button type="button">Outside</button>
      <CommandPaletteHost />
    </ThemeProvider>,
  )
}

function pressShortcut(target: Element = document.body, key = "k"): void {
  fireEvent.keyDown(target, { key, metaKey: true })
}

async function openPalette(): Promise<void> {
  pressShortcut()
  await screen.findByRole("dialog", { name: "Command palette" })
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Search commands" })).toHaveFocus(),
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("command palette", () => {
  it("opens with Mod+K and focuses the search box", async () => {
    renderPalette()
    expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull()
    await openPalette()
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Search commands" })).toHaveFocus(),
    )
  })

  it("opens with Ctrl+K using an uppercase key", async () => {
    renderPalette()
    fireEvent.keyDown(document.body, { key: "K", ctrlKey: true })
    expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeInTheDocument()
  })

  it("does not hijack keystrokes while typing in inputs", async () => {
    const user = userEvent.setup()
    renderPalette()
    const field = document.createElement("input")
    field.setAttribute("aria-label", "typing field")
    document.body.append(field)
    try {
      field.focus()
      await user.keyboard("{Meta>}k{/Meta}")
      expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull()
    } finally {
      field.remove()
    }
  })

  it("filters with fuzzy matching and runs the top hit on Enter", async () => {
    const user = userEvent.setup()
    renderPalette()
    await openPalette()
    await user.type(screen.getByRole("combobox", { name: "Search commands" }), "bdgets")
    const options = await screen.findAllByRole("option")
    expect(options[0]).toHaveTextContent("Go to Budgets")
    await user.keyboard("{Enter}")
    expect(navigate).toHaveBeenCalledWith({ to: "/budgets" })
    expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull()
  })

  it("moves the active option with arrows and announces results", async () => {
    const user = userEvent.setup()
    renderPalette()
    await openPalette()
    const first = (await screen.findAllByRole("option"))[0]
    expect(first).toHaveAttribute("aria-selected", "true")
    await user.keyboard("{ArrowDown}")
    const options = screen.getAllByRole("option")
    expect(options[0]).toHaveAttribute("aria-selected", "false")
    expect(options[1]).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("status")).toHaveTextContent("9 commands")
    await user.keyboard("{Enter}")
    expect(navigate).toHaveBeenCalledWith({ to: "/transactions" })
  })

  it("dismisses with Escape and returns focus to the opener", async () => {
    renderPalette()
    const outside = screen.getByRole("button", { name: "Outside" })
    outside.focus()
    pressShortcut(outside)
    await screen.findByRole("dialog", { name: "Command palette" })
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Search commands" }), {
      key: "Escape",
    })
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull(),
    )
    await waitFor(() => expect(outside).toHaveFocus())
  })

  it("toggles the theme through the registry", async () => {
    const user = userEvent.setup()
    renderPalette()
    await openPalette()
    await user.type(screen.getByRole("combobox", { name: "Search commands" }), "Toggle theme")
    await user.keyboard("{Enter}")
    expect(window.localStorage.getItem("budgetlens-theme")).toBe("dark")
  })

  it("ranks a used command first on the next empty query", async () => {
    const user = userEvent.setup()
    renderPalette()
    await openPalette()
    await user.type(screen.getByRole("combobox", { name: "Search commands" }), "Net worth")
    await user.keyboard("{Enter}")
    expect(navigate).toHaveBeenCalledWith({ to: "/net-worth" })

    await openPalette()
    const options = await screen.findAllByRole("option")
    expect(options[0]).toHaveTextContent("Go to Net worth")
  })
})
