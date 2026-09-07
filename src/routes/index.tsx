import { DashboardPage } from "@/features/dashboard/dashboard-page"
import { StaleDataNudge } from "@/features/dashboard/stale-nudge-banner"

export function OverviewPage() {
  return (
    <div className="grid gap-6">
      <StaleDataNudge />
      <DashboardPage />
    </div>
  )
}
