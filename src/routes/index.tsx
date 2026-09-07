import { CashflowForecastSection } from "@/features/cashflow/cashflow-forecast-section"
import { DashboardPage } from "@/features/dashboard/dashboard-page"
import { StaleDataNudge } from "@/features/dashboard/stale-nudge-banner"

export function OverviewPage() {
  return (
    <div className="grid gap-6">
      <StaleDataNudge />
      <DashboardPage />
      <CashflowForecastSection />
    </div>
  )
}
