import { useParams } from "@tanstack/react-router"

import { TransactionDetailPageContent } from "@/features/transactions/transaction-detail-page"

export function TransactionDetailPage() {
  const { transactionId } = useParams({ from: "/transactions/$transactionId" })
  return <TransactionDetailPageContent transactionId={transactionId} />
}
