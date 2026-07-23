import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { z } from "zod"

import { ChartWorkspace } from "./chart-workspace"

const storageKey = "budgetlens.custom-charts.v1"
const storedConfiguration = z.object({
  customCharts: z.array(
    z.object({
      title: z.string(),
      type: z.string(),
      metrics: z.array(z.string()),
      appearance: z.object({ gridType: z.string() }).passthrough(),
    }),
  ),
})

function storedCharts() {
  const value = window.localStorage.getItem(storageKey)
  if (!value) throw new Error("Expected saved chart configuration")
  return storedConfiguration.parse(JSON.parse(value) as unknown)
}

describe("ChartWorkspace", () => {
  it("edits in a dialog and persists metric deselection and presentation settings", async () => {
    const user = userEvent.setup()
    const view = render(<ChartWorkspace transactions={[]} wealth={[]} />)

    await user.click(screen.getByRole("button", { name: "Edit Monthly overview" }))
    const dialog = screen.getByRole("dialog", { name: "Edit Monthly overview" })
    await user.click(within(dialog).getByRole("checkbox", { name: "Savings" }))
    await user.click(within(dialog).getByLabelText("Area fill"))
    await user.click(screen.getByRole("option", { name: "None" }))
    await user.click(within(dialog).getByLabelText("Chart type"))
    await user.click(screen.getByRole("option", { name: "Line" }))
    await user.click(within(dialog).getByLabelText("Grid lines"))
    await user.click(screen.getByRole("option", { name: "None" }))

    await waitFor(() => {
      expect(storedCharts().customCharts[0]).toMatchObject({
        type: "line",
        metrics: ["income", "expenses"],
        appearance: { gridType: "none", areaFill: "none" },
      })
    })

    await user.click(within(dialog).getByRole("button", { name: "Done" }))
    view.unmount()
    render(<ChartWorkspace transactions={[]} wealth={[]} />)
    await user.click(screen.getByRole("button", { name: "Edit Monthly overview" }))

    const restored = screen.getByRole("dialog", { name: "Edit Monthly overview" })
    expect(within(restored).getByRole("checkbox", { name: "Savings" })).not.toBeChecked()
    expect(within(restored).getByLabelText("Chart type")).toHaveTextContent("Line")
    expect(within(restored).getByLabelText("Grid lines")).toHaveTextContent("None")
  })

  it("allows every metric to be deselected and persists chart order and deletion", async () => {
    const user = userEvent.setup()
    render(<ChartWorkspace transactions={[]} wealth={[]} />)

    await user.click(screen.getByRole("button", { name: "Edit Monthly overview" }))
    const editor = screen.getByRole("dialog", { name: "Edit Monthly overview" })
    await user.click(within(editor).getByRole("checkbox", { name: "Income" }))
    await user.click(within(editor).getByRole("checkbox", { name: "Expenses" }))
    await user.click(within(editor).getByRole("checkbox", { name: "Savings" }))
    await user.click(within(editor).getByRole("button", { name: "Done" }))
    expect(screen.getByText("Select at least one metric to display this chart.")).toBeVisible()
    expect(storedCharts().customCharts[0]?.metrics).toEqual([])

    await user.type(screen.getByLabelText("Chart title"), "Account mix")
    await user.click(screen.getByRole("button", { name: "Add chart" }))
    await user.click(screen.getByRole("button", { name: "Done" }))
    await user.click(screen.getByRole("button", { name: "Move Account mix up" }))
    await waitFor(() => {
      expect(storedCharts().customCharts.map(({ title }) => title)).toEqual([
        "Account mix",
        "Monthly overview",
      ])
    })

    await user.click(screen.getByRole("button", { name: "Delete Monthly overview" }))
    const confirmation = screen.getByRole("alertdialog", { name: "Delete chart?" })
    await user.click(within(confirmation).getByRole("button", { name: "Delete" }))
    await waitFor(() => {
      expect(storedCharts().customCharts.map(({ title }) => title)).toEqual(["Account mix"])
    })
  })
})
