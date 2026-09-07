import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ChartBlock } from "@/features/assistant/chart-block"

describe("assistant line chart", () => {
  it("renders one dot per point with a connecting path", () => {
    const { container } = render(
      <ChartBlock
        spec={{
          type: "line",
          title: "Net worth trend",
          data: [
            { label: "Jan", value: 10000 },
            { label: "Feb", value: 10500 },
            { label: "Mar", value: 10300 },
          ],
        }}
      />,
    )
    expect(screen.getByRole("figure", { name: "Net worth trend" })).toBeInTheDocument()
    expect(container.querySelectorAll("circle").length).toBe(3)
    expect(container.querySelector("path")).not.toBeNull()
  })

  it("renders flat and single-point series without crashing", () => {
    const { container: flat } = render(
      <ChartBlock spec={{ type: "line", title: "Flat", data: [{ label: "A", value: 5 }] }} />,
    )
    expect(flat.querySelectorAll("circle").length).toBe(1)
    const { container: same } = render(
      <ChartBlock
        spec={{
          type: "line",
          title: "Same",
          data: [
            { label: "A", value: 5 },
            { label: "B", value: 5 },
          ],
        }}
      />,
    )
    expect(same.querySelectorAll("circle").length).toBe(2)
  })

  it("falls back to a flat line for overflowing magnitudes without NaN", () => {
    const { container } = render(
      <ChartBlock
        spec={{
          type: "line",
          title: "Extreme",
          data: [
            { label: "A", value: -Number.MAX_VALUE },
            { label: "B", value: Number.MAX_VALUE },
          ],
        }}
      />,
    )
    expect(container.querySelectorAll("circle").length).toBe(2)
    const path = container.querySelector("path")
    expect(path?.getAttribute("d")).not.toMatch(/NaN/)
  })

  it("keeps bar and donut rendering behind the same figure", () => {
    render(<ChartBlock spec={{ type: "bar", title: "Bars", data: [{ label: "A", value: 1 }] }} />)
    expect(screen.getByRole("figure", { name: "Bars" })).toBeInTheDocument()
  })
})
