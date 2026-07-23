import { Eye, EyeOff, Plus, RotateCcw, Search } from "lucide-react"
import { useId, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  DASHBOARD_MODULE_CATALOG,
  type DashboardModuleCategory,
  type DashboardModuleDefinition,
} from "./catalog"
import {
  addDashboardModule,
  defaultDashboardCustomization,
  setDashboardModuleVisibility,
  type DashboardCustomization,
} from "./model"

export interface DashboardCustomizationPanelProps {
  customization: DashboardCustomization
  onCustomizationChange: (customization: DashboardCustomization) => void
  showHeading?: boolean
}

const categories = ["All", "Analyze", "Plan", "Review", "Manage"] as const

function matchesSearch(module: DashboardModuleDefinition, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return true
  return [module.title, module.description, module.category, ...module.searchTerms]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalizedQuery)
}

export function DashboardCustomizationPanel({
  customization,
  onCustomizationChange,
  showHeading = true,
}: DashboardCustomizationPanelProps) {
  const searchId = useId()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<"All" | DashboardModuleCategory>("All")
  const filteredModules = useMemo(
    () =>
      DASHBOARD_MODULE_CATALOG.filter(
        (module) =>
          (category === "All" || module.category === category) && matchesSearch(module, query),
      ),
    [category, query],
  )

  return (
    <aside
      className={showHeading ? "rounded-xl border bg-card p-4" : ""}
      aria-labelledby={showHeading ? `${searchId}-heading` : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        {showHeading && (
          <div>
            <h2 id={`${searchId}-heading`} className="font-semibold">
              Dashboard modules
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add, hide, or restore modules. Drag visible modules or use their arrow buttons to
              reorder.
            </p>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onCustomizationChange(defaultDashboardCustomization)}
        >
          <RotateCcw className="size-4" />
          Reset layout
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_auto]">
        <div className="relative">
          <Label htmlFor={searchId} className="sr-only">
            Search dashboard modules
          </Label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={searchId}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search modules"
            className="pl-9"
          />
        </div>
        <fieldset className="flex max-w-full gap-1 overflow-x-auto pb-1">
          <legend className="sr-only">Filter modules by category</legend>
          {categories.map((item) => (
            <Button
              type="button"
              size="sm"
              variant={category === item ? "secondary" : "ghost"}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
              key={item}
            >
              {item}
            </Button>
          ))}
        </fieldset>
      </div>

      {filteredModules.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No modules match those filters.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filteredModules.map((module) => {
            const removed = customization.removed.includes(module.id)
            const hidden = customization.hidden.includes(module.id)
            const Icon = module.icon
            return (
              <li key={module.id} className="flex min-w-0 items-start gap-3 rounded-lg border p-3">
                <span className="rounded-md bg-muted p-2" aria-hidden="true">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">{module.title}</h3>
                    {removed ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onCustomizationChange(addDashboardModule(customization, module.id))
                        }
                      >
                        <Plus className="size-4" /> Add
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`${hidden ? "Show" : "Hide"} ${module.title}`}
                        onClick={() =>
                          onCustomizationChange(
                            setDashboardModuleVisibility(customization, module.id, hidden),
                          )
                        }
                      >
                        {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                        {hidden ? "Show" : "Hide"}
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{module.description}</p>
                  <p className="mt-2 text-xs font-medium text-muted-foreground">
                    {module.category}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
