import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import { defaultDashboardCustomization, type DashboardCustomization } from "./model"
import { SortableDashboard } from "./sortable-dashboard"

function TestDashboard() {
  const [customization, setCustomization] = useState<DashboardCustomization>({
    ...defaultDashboardCustomization,
    order: ["metrics", "netWorth"],
  })
  return (
    <SortableDashboard
      customization={customization}
      onCustomizationChange={setCustomization}
      renderModule={({ title }) => <div>{title} content</div>}
      editing
    />
  )
}

describe("SortableDashboard", () => {
  it("supports explicit reordering and confirmed removal", async () => {
    const user = userEvent.setup()
    render(<TestDashboard />)

    await user.click(screen.getByRole("button", { name: "Move Net-worth summary up" }))
    const modules = screen.getAllByRole("article")
    expect(modules[0]).toHaveAccessibleName("Net-worth summary dashboard module")

    await user.click(screen.getByRole("button", { name: "Remove Net-worth summary" }))
    expect(screen.getByRole("group", { name: "Remove Net-worth summary?" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Confirm" }))
    expect(screen.queryByText("Net-worth summary content")).not.toBeInTheDocument()
  })
})
