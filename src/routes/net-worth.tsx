import { useLiveQuery } from "dexie-react-hooks"

import { repositories } from "@/db/repositories"
import { NetWorthDashboard } from "@/features/net-worth/net-worth-dashboard"

export function NetWorthPage() {
  const snapshots = useLiveQuery(() => repositories.wealth.list(), [])

  if (snapshots === undefined) {
    return (
      <section aria-labelledby="net-worth-loading" className="space-y-4">
        <h1 id="net-worth-loading" className="text-3xl font-semibold tracking-tight">
          Net worth
        </h1>
        <div
          className="h-40 animate-pulse rounded-2xl bg-muted"
          aria-label="Loading wealth history"
        />
      </section>
    )
  }

  return <NetWorthDashboard snapshots={snapshots} />
}
