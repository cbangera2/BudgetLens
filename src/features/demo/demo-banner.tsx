import { Link } from "@tanstack/react-router"
import { Info } from "lucide-react"

import { useIsDemoData } from "@/features/demo/demo-seed"

export function DemoBanner({ visible }: { visible?: boolean }) {
  const isDemo = useIsDemoData()
  if (!(visible ?? isDemo)) return null

  return (
    <output
      data-testid="demo-banner"
      className="block border-b border-border bg-primary/10 text-foreground"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 text-sm sm:px-6">
        <Info className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          You are exploring BudgetLens with sample demo data. Import your own files on the{" "}
          <Link to="/imports" className="font-semibold underline underline-offset-2">
            Imports page
          </Link>{" "}
          to replace it.
        </span>
      </div>
    </output>
  )
}
