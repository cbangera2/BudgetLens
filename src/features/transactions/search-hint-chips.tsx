import { useMemo } from "react"

import { Badge } from "@/components/ui/badge"

import { parseSearchQuery } from "./search-operators"

/** Inline hint chips describing the structured operators in the search box. */
export function SearchHintChips({ search }: { search: string }) {
  const parsed = useMemo(() => parseSearchQuery(search), [search])
  return (
    <div className="grid gap-1.5">
      <p className="text-xs text-muted-foreground">
        Tip: use amount:&gt;100, merchant:name, or cat:name. Unknown words like foo:bar are searched
        as plain text.
      </p>
      {parsed.chips.length > 0 && (
        <ul aria-label="Detected query operators" className="flex flex-wrap gap-1.5">
          {parsed.chips.map((chip) => (
            <li key={chip.key}>
              <Badge variant="secondary">{chip.label}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
