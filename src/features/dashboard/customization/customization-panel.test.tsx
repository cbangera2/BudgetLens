import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import { DashboardCustomizationPanel } from "./customization-panel"
import { defaultDashboardCustomization, type DashboardCustomization } from "./model"

function TestPanel() {
  const [customization, setCustomization] = useState<DashboardCustomization>(
    defaultDashboardCustomization,
  )
  return (
    <DashboardCustomizationPanel
      customization={customization}
      onCustomizationChange={setCustomization}
    />
  )
}

describe("DashboardCustomizationPanel", () => {
  it("searches the full module catalog and toggles visibility", async () => {
    const user = userEvent.setup()
    render(<TestPanel />)

    await user.type(screen.getByRole("textbox", { name: "Search dashboard modules" }), "wealth")
    expect(screen.getByRole("heading", { name: "Net-worth summary" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Monthly trends" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Hide Net-worth summary" }))
    expect(screen.getByRole("button", { name: "Show Net-worth summary" })).toBeInTheDocument()
  })

  it("filters by category", async () => {
    const user = userEvent.setup()
    render(<TestPanel />)

    await user.click(screen.getByRole("button", { name: "Plan" }))
    expect(screen.getByRole("heading", { name: "Budget goals" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Net-worth summary" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Import shortcut" })).not.toBeInTheDocument()
  })
})
