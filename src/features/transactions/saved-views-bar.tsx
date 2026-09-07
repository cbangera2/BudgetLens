import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type { TransactionViewFilters } from "./filtering"
import {
  createSavedView,
  deleteSavedView,
  loadSavedViews,
  persistSavedViews,
  renameSavedView,
  type SavedView,
} from "./saved-views"

interface SavedViewsBarProps {
  filters: TransactionViewFilters
  onApply: (filters: TransactionViewFilters) => void
}

/** Name, list, apply, rename, and delete for saved filter views. */
export function SavedViewsBar({ filters, onApply }: SavedViewsBarProps) {
  const [views, setViews] = useState<SavedView[]>([])
  const [name, setName] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")

  useEffect(() => {
    setViews(loadSavedViews(window.localStorage))
  }, [])

  function update(next: SavedView[]) {
    setViews(next)
    persistSavedViews(window.localStorage, next)
  }

  function handleSave() {
    const next = createSavedView(views, name, filters)
    if (next.length === views.length) return
    setName("")
    update(next)
  }

  function handleRename(id: string) {
    const next = renameSavedView(views, id, renameDraft)
    setRenamingId(null)
    setRenameDraft("")
    update(next)
  }

  return (
    <div className="grid gap-1.5 sm:col-span-2 xl:col-span-3">
      <Label htmlFor="saved-view-name">Saved views</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="saved-view-name"
          placeholder="Name this filter combination"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSave()
          }}
          className="h-9 flex-1 sm:max-w-64"
        />
        <Button type="button" size="sm" onClick={handleSave} disabled={!name.trim()}>
          Save view
        </Button>
      </div>
      {views.length > 0 && (
        <ul aria-label="Saved view list" className="flex flex-wrap gap-1.5">
          {views.map((view) =>
            renamingId === view.id ? (
              <li key={view.id} className="flex flex-wrap items-center gap-1.5">
                <Input
                  aria-label={`New name for ${view.name}`}
                  value={renameDraft}
                  maxLength={80}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleRename(view.id)
                    if (event.key === "Escape") setRenamingId(null)
                  }}
                  className="h-8 w-44"
                />
                <Button type="button" size="sm" onClick={() => handleRename(view.id)}>
                  Confirm rename
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRenamingId(null)}>
                  Cancel
                </Button>
              </li>
            ) : (
              <li
                key={view.id}
                className="flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs"
              >
                <button
                  type="button"
                  className="font-semibold underline-offset-4 hover:underline"
                  aria-label={`Apply ${view.name} view`}
                  onClick={() => onApply({ ...view.filters })}
                >
                  {view.name}
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  aria-label={`Rename ${view.name} view`}
                  onClick={() => {
                    setRenamingId(view.id)
                    setRenameDraft(view.name)
                  }}
                >
                  Rename
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  aria-label={`Delete ${view.name} view`}
                  onClick={() => update(deleteSavedView(views, view.id))}
                >
                  Delete
                </Button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}
