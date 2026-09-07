import { DashboardPage } from "@/features/dashboard/dashboard-page"
import { StaleDataNudge } from "@/features/dashboard/stale-nudge-banner"
import { SubscriptionsSection } from "@/features/subscriptions/subscriptions-section"

export function OverviewPage() {
  return (
    <div className="grid gap-6">
      <StaleDataNudge />
      <DashboardPage />
      <SubscriptionsSection />
    </div>
  )
}
