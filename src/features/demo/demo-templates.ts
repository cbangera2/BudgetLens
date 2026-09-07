import {
  FAMILY_DEMO_BUDGETS,
  FAMILY_DEMO_BUNDLE_JSON,
  FAMILY_DEMO_GROUPS,
  FAMILY_DEMO_SOURCE_NAME,
  FAMILY_TRIP_GROUP_NAME,
  FAMILY_TRIP_LABEL,
} from "@/features/demo/family-bundle"
import {
  FREELANCER_DEMO_BUDGETS,
  FREELANCER_DEMO_BUNDLE_JSON,
  FREELANCER_DEMO_GROUPS,
  FREELANCER_DEMO_SOURCE_NAME,
  FREELANCER_TRIP_GROUP_NAME,
  FREELANCER_TRIP_LABEL,
} from "@/features/demo/freelancer-bundle"
import {
  DEMO_SOURCE_NAME,
  DEMO_TRIP_LABEL,
  GOLDEN_DEMO_BUDGETS,
  GOLDEN_DEMO_BUNDLE_JSON,
  GOLDEN_DEMO_GROUPS,
  type DemoBudgetSeed,
  type DemoGroupSeed,
} from "@/features/demo/golden-bundle"
import {
  STUDENT_DEMO_BUDGETS,
  STUDENT_DEMO_BUNDLE_JSON,
  STUDENT_DEMO_GROUPS,
  STUDENT_DEMO_SOURCE_NAME,
  STUDENT_TRIP_GROUP_NAME,
  STUDENT_TRIP_LABEL,
} from "@/features/demo/student-bundle"

export type DemoTemplateId = "golden" | "student" | "freelancer" | "family"

export interface DemoTemplate {
  id: DemoTemplateId
  name: string
  tagline: string
  sourceName: string
  bundleJson: string
  budgets: DemoBudgetSeed[]
  groups: DemoGroupSeed[]
  tripLabel: string
  tripGroupName: string
}

export const DEFAULT_DEMO_TEMPLATE_ID: DemoTemplateId = "golden"

export const DEMO_TEMPLATES: readonly DemoTemplate[] = [
  {
    id: "golden",
    name: "Everyday",
    tagline: "Balanced sample with paychecks, bills, and a summer trip.",
    sourceName: DEMO_SOURCE_NAME,
    bundleJson: GOLDEN_DEMO_BUNDLE_JSON,
    budgets: GOLDEN_DEMO_BUDGETS,
    groups: GOLDEN_DEMO_GROUPS,
    tripLabel: DEMO_TRIP_LABEL,
    tripGroupName: "Coastal Summer Trip",
  },
  {
    id: "student",
    name: "Student",
    tagline: "Tight budget with part-time pay and lots of subscriptions.",
    sourceName: STUDENT_DEMO_SOURCE_NAME,
    bundleJson: STUDENT_DEMO_BUNDLE_JSON,
    budgets: STUDENT_DEMO_BUDGETS,
    groups: STUDENT_DEMO_GROUPS,
    tripLabel: STUDENT_TRIP_LABEL,
    tripGroupName: STUDENT_TRIP_GROUP_NAME,
  },
  {
    id: "freelancer",
    name: "Freelancer",
    tagline: "Irregular client income with quarterly tax set-asides.",
    sourceName: FREELANCER_DEMO_SOURCE_NAME,
    bundleJson: FREELANCER_DEMO_BUNDLE_JSON,
    budgets: FREELANCER_DEMO_BUDGETS,
    groups: FREELANCER_DEMO_GROUPS,
    tripLabel: FREELANCER_TRIP_LABEL,
    tripGroupName: FREELANCER_TRIP_GROUP_NAME,
  },
  {
    id: "family",
    name: "Family",
    tagline: "Groceries-heavy household with shared group costs.",
    sourceName: FAMILY_DEMO_SOURCE_NAME,
    bundleJson: FAMILY_DEMO_BUNDLE_JSON,
    budgets: FAMILY_DEMO_BUDGETS,
    groups: FAMILY_DEMO_GROUPS,
    tripLabel: FAMILY_TRIP_LABEL,
    tripGroupName: FAMILY_TRIP_GROUP_NAME,
  },
]

export const DEMO_SOURCE_NAMES: readonly string[] = DEMO_TEMPLATES.map(
  (template) => template.sourceName,
)

export function isDemoTemplateId(value: unknown): value is DemoTemplateId {
  return value === "golden" || value === "student" || value === "freelancer" || value === "family"
}

export function getDemoTemplate(id: unknown): DemoTemplate {
  const found = DEMO_TEMPLATES.find((template) => template.id === id)
  return found ?? DEMO_TEMPLATES[0]!
}

export function isDemoSourceName(sourceName: string): boolean {
  return DEMO_SOURCE_NAMES.includes(sourceName)
}

export const DEMO_TEMPLATE_STORAGE_KEY = "budgetlens.demo-template.v1"

type TemplateStorage = Pick<Storage, "getItem" | "setItem">

export function readDemoTemplateChoice(storage: TemplateStorage): DemoTemplateId {
  try {
    const raw = storage.getItem(DEMO_TEMPLATE_STORAGE_KEY)
    if (raw !== null && isDemoTemplateId(raw)) return raw
  } catch {
    // Private-mode storage may throw; fall through to the golden default.
  }
  return DEFAULT_DEMO_TEMPLATE_ID
}

export function recordDemoTemplateChoice(storage: TemplateStorage, templateId: string): void {
  if (!isDemoTemplateId(templateId)) return
  try {
    storage.setItem(DEMO_TEMPLATE_STORAGE_KEY, templateId)
  } catch {
    // Private-mode storage may throw; the picker just defaults next launch.
  }
}
