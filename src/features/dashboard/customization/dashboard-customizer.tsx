import { GripVertical, Plus, X } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

import { DashboardCustomizationPanel } from "./customization-panel"
import { SortableDashboard, type DashboardModuleRenderContext } from "./sortable-dashboard"
import { useDashboardCustomization } from "./use-dashboard-customization"

export interface DashboardCustomizerProps {
  renderModule: (context: DashboardModuleRenderContext) => ReactNode
  storage?: Storage | undefined
  className?: string | undefined
}

/**
 * Integration boundary for the dashboard page. Consumers own module contents;
 * this component owns the local layout, catalog controls, and accessible sorting.
 */
export function DashboardCustomizer({
  renderModule,
  storage,
  className,
}: DashboardCustomizerProps) {
  const [customization, setCustomization] = useDashboardCustomization(storage)
  const [editing, setEditing] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState(false)

  return (
    <div className="grid gap-6">
      <div className="flex w-full flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="mr-auto">
          <p className="text-sm font-semibold">
            {editing ? "Rearranging dashboard" : "Dashboard layout"}
          </p>
          <p className="text-xs text-muted-foreground">
            {editing
              ? "Drag modules to reorder them, or use the controls above each module."
              : "Add, hide, or rearrange the modules on your overview."}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setCatalogOpen(true)}>
          <Plus className="size-4" />
          Add or hide modules
        </Button>
        <Button type="button" onClick={() => setEditing((current) => !current)}>
          {!editing && <GripVertical className="size-4" />}
          {editing ? "Done" : "Rearrange"}
        </Button>
      </div>

      {catalogOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCatalogOpen(false)
          }}
        >
          <dialog
            open
            aria-modal="true"
            aria-labelledby="dashboard-catalog-title"
            className="relative m-0 max-h-[min(46rem,calc(100vh-2rem))] w-full max-w-5xl overflow-y-auto rounded-2xl border bg-background p-4 text-foreground shadow-2xl sm:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="dashboard-catalog-title" className="text-xl font-semibold">
                  Dashboard modules
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose what belongs on your overview. Your dashboard stays visible behind this
                  panel.
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Close dashboard modules"
                onClick={() => setCatalogOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <DashboardCustomizationPanel
              customization={customization}
              onCustomizationChange={setCustomization}
              showHeading={false}
            />
          </dialog>
        </div>
      )}

      <SortableDashboard
        customization={customization}
        onCustomizationChange={setCustomization}
        renderModule={renderModule}
        editing={editing}
        className={className}
      />
    </div>
  )
}
