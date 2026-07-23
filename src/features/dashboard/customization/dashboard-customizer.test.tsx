import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { DashboardCustomizer } from "./dashboard-customizer"

describe("DashboardCustomizer", () => {
  it("opens the module catalog in one click and keeps rearranging optional", async () => {
    const user = userEvent.setup()
    render(<DashboardCustomizer renderModule={({ title }) => <div>{title} content</div>} />)

    expect(screen.getByText("Key metrics content")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Dashboard modules" })).not.toBeInTheDocument()
    expect(screen.getByText("Dashboard layout")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Drag Key metrics to reorder" }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Add or hide modules" }))
    expect(screen.getByRole("dialog", { name: "Dashboard modules" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Close dashboard modules" }))
    await user.click(screen.getByRole("button", { name: "Rearrange" }))
    expect(screen.getByText("Rearranging dashboard")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Drag Key metrics to reorder" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.getByRole("button", { name: "Rearrange" })).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Drag Key metrics to reorder" }),
    ).not.toBeInTheDocument()
  })
})
