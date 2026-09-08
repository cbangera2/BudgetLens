import { CashflowForecastSection } from "@/features/cashflow/cashflow-forecast-section"
import { DashboardPage } from "@/features/dashboard/dashboard-page"
import { StaleDataNudge } from "@/features/dashboard/stale-nudge-banner"
import { InsightsSection } from "@/features/insights/insights-section"
import { SafeToSpendSection } from "@/features/safe-to-spend/safe-to-spend-section"

export function OverviewPage() {
  return (
    <div className="grid gap-6">
      <StaleDataNudge />
      <SafeToSpendSection />
      <DashboardPage />
      <CashflowForecastSection />
      <InsightsSection />
    </div>
  )
}
