/**
 * Chart-motion policy for touch-first viewports.
 *
 * Recharts animates with `requestAnimationFrame`, so CSS alone cannot stop
 * it — callers must pass `isAnimationActive={false}` (or a zero duration).
 * This module is the single place that decision lives: `useMediaQuery`
 * detects the coarse pointer, and `resolveChartAnimationDuration` maps the
 * user-configured duration to an effective one. Chart renderers owned by
 * other features should consume this helper; until they do, `styles.css`
 * still wraps legends and damps CSS motion under `(pointer: coarse)`.
 */

export interface ChartMotionPreferences {
  coarsePointer: boolean
  prefersReducedMotion: boolean
}

/** Animation is off on touch devices (battery/jank) and for reduced-motion users. */
export function shouldDisableChartAnimation(prefs: ChartMotionPreferences): boolean {
  return prefs.coarsePointer || prefs.prefersReducedMotion
}

/**
 * Map a configured animation duration to its effective value. Never returns
 * a negative duration; returns 0 when motion is disabled.
 */
export function resolveChartAnimationDuration(
  configuredDuration: number,
  prefs: ChartMotionPreferences,
): number {
  if (!Number.isFinite(configuredDuration) || configuredDuration <= 0) return 0
  return shouldDisableChartAnimation(prefs) ? 0 : configuredDuration
}
