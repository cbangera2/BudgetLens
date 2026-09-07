/**
 * Budget template presets: named needs/wants/savings percentage splits.
 *
 * Presets are pure data. Ratio math lives in `./allocation`, and the picker UI
 * lives in `./templates-section`. Nothing here touches the database.
 */

export interface BudgetTemplatePreset {
  id: string
  name: string
  description: string
  needsPct: number
  wantsPct: number
  savingsPct: number
}

export const BUDGET_TEMPLATE_PRESETS: readonly BudgetTemplatePreset[] = [
  {
    id: "balanced-50-30-20",
    name: "Balanced 50/30/20",
    description: "Half of income covers needs, 30% funds wants, 20% goes to savings.",
    needsPct: 50,
    wantsPct: 30,
    savingsPct: 20,
  },
  {
    id: "frugal-60-20-20",
    name: "Frugal 60/20/20",
    description: "Higher needs share with lean, equal wants and savings.",
    needsPct: 60,
    wantsPct: 20,
    savingsPct: 20,
  },
  {
    id: "saver-40-20-40",
    name: "Saver 40/20/40",
    description: "Aggressive savings for debt payoff or a deposit goal.",
    needsPct: 40,
    wantsPct: 20,
    savingsPct: 40,
  },
]

export const CUSTOM_TEMPLATE_ID = "custom"

export type CustomRatiosResult =
  | { ok: true; ratios: [number, number, number] }
  | { ok: false; error: string }

/**
 * Validates the three custom percentage inputs. They must each be a number
 * between 0 and 100 and sum to exactly 100.
 */
export function validateCustomRatios(
  needs: string,
  wants: string,
  savings: string,
): CustomRatiosResult {
  const raws = [needs, wants, savings]
  if (raws.some((value) => value.trim() === "")) {
    return { ok: false, error: "Enter all three percentages as numbers." }
  }
  const values: number[] = []
  for (const raw of raws) {
    const value = Number(raw.trim())
    if (!Number.isFinite(value)) {
      return { ok: false, error: "Enter all three percentages as numbers." }
    }
    values.push(value)
  }
  const [needsPct = Number.NaN, wantsPct = Number.NaN, savingsPct = Number.NaN] = values
  if (
    [needsPct, wantsPct, savingsPct].some((value) => value < 0 || value > 100) ||
    [needsPct, wantsPct, savingsPct].some((value) => !Number.isInteger(value))
  ) {
    return { ok: false, error: "Each percentage must be a whole number between 0 and 100." }
  }
  const total = needsPct + wantsPct + savingsPct
  if (total !== 100) {
    return { ok: false, error: `Percentages must add up to 100 (currently ${total}).` }
  }
  return { ok: true, ratios: [needsPct, wantsPct, savingsPct] }
}
