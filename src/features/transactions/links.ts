/**
 * Prefix an app-absolute path with the deploy base ("/" locally and in the
 * desktop app, "/BudgetLens" on GitHub Pages). Raw `<a href>` and
 * `location.assign` targets must go through here — the router `<Link>`
 * handles the base automatically, but plain strings do not.
 */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "")
  return `${base}${path}`
}

export function transactionDetailPath(id: string): string {
  return withBase(`/transactions/${encodeURIComponent(id)}`)
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
  return withBase(query ? `/transactions?${query}` : "/transactions")
}

export function transactionsByImportBatchPath(importBatchId: string): string {
  const params = new URLSearchParams()
  params.set("importBatch", importBatchId)
  return withBase(`/transactions?${params.toString()}`)
}
