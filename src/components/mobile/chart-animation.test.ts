import { resolveChartAnimationDuration, shouldDisableChartAnimation } from "./chart-animation"

describe("chart motion policy", () => {
  it("disables animation on coarse pointers", () => {
    expect(shouldDisableChartAnimation({ coarsePointer: true, prefersReducedMotion: false })).toBe(
      true,
    )
    expect(
      resolveChartAnimationDuration(300, { coarsePointer: true, prefersReducedMotion: false }),
    ).toBe(0)
  })

  it("disables animation for reduced-motion users", () => {
    expect(shouldDisableChartAnimation({ coarsePointer: false, prefersReducedMotion: true })).toBe(
      true,
    )
    expect(
      resolveChartAnimationDuration(300, { coarsePointer: false, prefersReducedMotion: true }),
    ).toBe(0)
  })

  it("keeps the configured duration on fine-pointer devices without reduced motion", () => {
    const prefs = { coarsePointer: false, prefersReducedMotion: false }
    expect(shouldDisableChartAnimation(prefs)).toBe(false)
    expect(resolveChartAnimationDuration(300, prefs)).toBe(300)
  })

  it("floors invalid durations at zero", () => {
    const prefs = { coarsePointer: false, prefersReducedMotion: false }
    expect(resolveChartAnimationDuration(0, prefs)).toBe(0)
    expect(resolveChartAnimationDuration(-50, prefs)).toBe(0)
    expect(resolveChartAnimationDuration(Number.NaN, prefs)).toBe(0)
  })
})
