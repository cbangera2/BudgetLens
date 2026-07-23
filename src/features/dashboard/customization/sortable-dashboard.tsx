import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowDown, ArrowUp, EyeOff, GripVertical, Trash2 } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

import { getDashboardModule, isDashboardModuleId, type DashboardModuleId } from "./catalog"
import {
  moveDashboardModule,
  removeDashboardModule,
  reorderDashboardModules,
  setDashboardModuleVisibility,
  type DashboardCustomization,
} from "./model"

export interface DashboardModuleRenderContext {
  id: DashboardModuleId
  title: string
}

export interface SortableDashboardProps {
  customization: DashboardCustomization
  onCustomizationChange: (customization: DashboardCustomization) => void
  renderModule: (context: DashboardModuleRenderContext) => ReactNode
  editing?: boolean
  className?: string | undefined
}

interface SortableDashboardItemProps {
  id: DashboardModuleId
  index: number
  count: number
  customization: DashboardCustomization
  onCustomizationChange: (customization: DashboardCustomization) => void
  editing: boolean
  children: ReactNode
}

function SortableDashboardItem({
  id,
  index,
  count,
  customization,
  onCustomizationChange,
  editing,
  children,
}: SortableDashboardItemProps) {
  const [confirmingRemoval, setConfirmingRemoval] = useState(false)
  const module = getDashboardModule(id)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !editing,
  })

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`min-w-0 ${module.defaultSpan === "full" ? "md:col-span-2" : ""} ${isDragging ? "relative z-10 opacity-70" : ""}`}
      aria-label={`${module.title} dashboard module`}
    >
      {editing && (
        <div className="mb-2 flex min-h-10 flex-wrap items-center justify-end gap-1 rounded-lg border bg-card px-2 py-1 shadow-sm">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="mr-auto cursor-grab touch-none active:cursor-grabbing"
            aria-label={`Drag ${module.title} to reorder`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Move ${module.title} up`}
            disabled={index === 0}
            onClick={() => onCustomizationChange(moveDashboardModule(customization, id, -1))}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Move ${module.title} down`}
            disabled={index === count - 1}
            onClick={() => onCustomizationChange(moveDashboardModule(customization, id, 1))}
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Hide ${module.title}`}
            onClick={() =>
              onCustomizationChange(setDashboardModuleVisibility(customization, id, false))
            }
          >
            <EyeOff className="size-4" />
          </Button>
          {confirmingRemoval ? (
            <fieldset className="flex flex-wrap items-center gap-1">
              <legend className="sr-only">Remove {module.title}?</legend>
              <span className="px-1 text-xs text-muted-foreground" aria-hidden="true">
                Remove?
              </span>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => onCustomizationChange(removeDashboardModule(customization, id))}
              >
                Confirm
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmingRemoval(false)}
              >
                Cancel
              </Button>
            </fieldset>
          ) : (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Remove ${module.title}`}
              onClick={() => setConfirmingRemoval(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      )}
      {children}
    </article>
  )
}

export function SortableDashboard({
  customization,
  onCustomizationChange,
  renderModule,
  editing = false,
  className = "",
}: SortableDashboardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const visible = customization.order.filter((id) => !customization.hidden.includes(id))

  function onDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return
    if (!isDashboardModuleId(event.active.id) || !isDashboardModuleId(event.over.id)) return
    onCustomizationChange(reorderDashboardModules(customization, event.active.id, event.over.id))
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No dashboard modules are visible. Use the customization panel to show or add one.
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={visible} strategy={verticalListSortingStrategy}>
        <section
          aria-label="Customizable dashboard modules"
          className={`grid grid-cols-1 gap-6 md:grid-cols-2 ${className}`}
        >
          {visible.map((id, index) => {
            const module = getDashboardModule(id)
            return (
              <SortableDashboardItem
                key={id}
                id={id}
                index={index}
                count={visible.length}
                customization={customization}
                onCustomizationChange={onCustomizationChange}
                editing={editing}
              >
                {renderModule({ id, title: module.title })}
              </SortableDashboardItem>
            )
          })}
        </section>
      </SortableContext>
    </DndContext>
  )
}
