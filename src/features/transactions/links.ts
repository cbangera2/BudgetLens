export function transactionDetailPath(id: string): string {
  return `/transactions/${encodeURIComponent(id)}`
}

export interface TransactionFacet {
  merchant?: string
  category?: string
  account?: string
}

export function transactionsFilteredPath(facet: TransactionFacet = {}): string {
  const params = new URLSearchParams()
  if (facet.merchant) params.set("merchant", facet.merchant)
  if (facet.category) params.set("category", facet.category)
  if (facet.account) params.set("account", facet.account)
  const query = params.toString()
  return query ? `/transactions?${query}` : "/transactions"
}

export function transactionsByImportBatchPath(importBatchId: string): string {
  const params = new URLSearchParams()
  params.set("importBatch", importBatchId)
  return `/transactions?${params.toString()}`
}
