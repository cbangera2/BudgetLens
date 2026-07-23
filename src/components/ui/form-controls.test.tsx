import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { ColorPicker } from "@/components/ui/color-picker"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"

function ControlledSelect() {
  const [value, setValue] = useState("area")
  return (
    <>
      <Label htmlFor="chart-style">Chart style</Label>
      <Select
        id="chart-style"
        value={value}
        onValueChange={setValue}
        options={[
          { value: "area", label: "Area" },
          { value: "line", label: "Line" },
        ]}
      />
    </>
  )
}

describe("styled form controls", () => {
  it("selects a dropdown option with accessible labels", async () => {
    const user = userEvent.setup()
    render(<ControlledSelect />)

    const select = screen.getByRole("combobox", { name: "Chart style" })
    await user.click(select)
    await user.click(screen.getByRole("option", { name: "Line" }))

    expect(select).toHaveTextContent("Line")
  })

  it("chooses and clears a date from the calendar popover", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(value: string) => void>()
    const view = render(
      <>
        <Label htmlFor="start-date">Start date</Label>
        <DatePicker id="start-date" value="2026-07-22" onChange={onChange} />
      </>,
    )

    await user.click(screen.getByRole("button", { name: "Start date" }))
    await user.click(screen.getByRole("button", { name: "Friday, July 10, 2026" }))
    expect(onChange).toHaveBeenLastCalledWith("2026-07-10")

    view.rerender(
      <>
        <Label htmlFor="start-date">Start date</Label>
        <DatePicker id="start-date" value="2026-07-10" onChange={onChange} />
      </>,
    )
    await user.click(screen.getByRole("button", { name: "Start date" }))
    await user.click(screen.getByRole("button", { name: "Clear date" }))
    expect(onChange).toHaveBeenLastCalledWith("")
  })

  it("offers color swatches and only publishes valid hex input", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn<(value: string) => void>()
    render(<ColorPicker id="label-color" value="#000000" onChange={onChange} />)

    await user.click(screen.getByRole("button", { name: "Slate" }))
    expect(onChange).toHaveBeenLastCalledWith("#334155")

    onChange.mockClear()
    const hexInput = screen.getByRole("textbox", {
      name: "Label color hexadecimal value",
    })
    await user.clear(hexInput)
    await user.type(hexInput, "#oops")
    expect(screen.getByRole("alert")).toHaveTextContent("six-digit hex color")
    expect(onChange).not.toHaveBeenCalled()

    await user.clear(hexInput)
    await user.type(hexInput, "#12ABef")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(onChange).toHaveBeenLastCalledWith("#12abef")
  })
})
