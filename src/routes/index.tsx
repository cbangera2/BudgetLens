import { DashboardPage } from "@/features/dashboard/dashboard-page"
import { SubscriptionsSection } from "@/features/subscriptions/subscriptions-section"

export function OverviewPage() {
  return (
    <div className="grid gap-6">
      <DashboardPage />
      <SubscriptionsSection />
    </div>
  )
}
