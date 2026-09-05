export interface CitationRow {
  id?: string
  amount: string
  description: string | null
  category: string | null
  date: string
}

export interface Cite {
  /** 1-based marker number shown as [N]. */
  index: number
  label: string
  href: string
}

export const MAX_CITATIONS = 8

export interface SnapshotLike {
  generatedAt: string
  topTransactions?: Array<{
    id?: string
    amount: string
    description: string | null
    category: string | null
    date: string
  }>
  extremes?: {
    largestExpense?: {
      id?: string
      amount: string
      description: string | null
      category: string | null
      date: string
    } | null
    largestIncome?: {
      id?: string
      amount: string
      description: string | null
      category: string | null
      date: string
    } | null
  }
  spending?: Array<{ category: string; total: string }>
}

/**
 * Citation rows from a finance snapshot: individual top rows first, then
 * category totals (so aggregate prose like "Housing -$3,300.00" also links).
 */
export function rowsFromSnapshot(snapshot: SnapshotLike): CitationRow[] {
  const rows: CitationRow[] = []
  const push = (row: {
    id?: string
    amount: string
    description: string | null
    category: string | null
    date: string
  }): void => {
    rows.push({
      amount: row.amount,
      description: row.description,
      category: row.category,
      date: row.date,
      ...(typeof row.id === "string" ? { id: row.id } : {}),
    })
  }
  for (const row of snapshot.topTransactions ?? []) {
    push(row)
  }
  for (const key of ["largestExpense", "largestIncome"] as const) {
    const extreme = snapshot.extremes?.[key]
    if (extreme) push(extreme)
  }
  for (const bucket of snapshot.spending ?? []) {
    push({
      id: `cat:${bucket.category}`,
      amount: bucket.total,
      description: null,
      category: bucket.category,
      date: snapshot.generatedAt.slice(0, 10),
    })
  }
  return rows
}

function transactionsHref(row: CitationRow, base: string): string {
  const params = new URLSearchParams()
  const query = (row.description ?? "").replace(/…/g, "").trim().split(/\s+/).slice(0, 4).join(" ")
  if (query) params.set("q", query)
  if (row.category) params.set("categories", row.category)
  params.set("sort", "amount-desc")
  return `${base}transactions?${params.toString()}`
}

function citeLabel(row: CitationRow): string {
  const what = row.description ?? row.category ?? row.amount
  return `${what} · ${row.amount} · ${row.date} — open in Transactions`
}

interface FenceSpan {
  start: number
  end: number
}

function fencedSpans(text: string): FenceSpan[] {
  const spans: FenceSpan[] = []
  const fence = /```[\s\S]*?(?:```|$)/g
  let match: RegExpExecArray | null
  while ((match = fence.exec(text)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length })
  }
  return spans
}

function insideSpans(index: number, spans: FenceSpan[]): boolean {
  return spans.some((span) => index >= span.start && index < span.end)
}

/**
 * Deterministic citation pass: links exact snapshot amounts in model prose to
 * filtered Transactions views. Longest amounts first so "-$3,300.00" wins over
 * "$3,300.00"; fenced code blocks are never touched; at most MAX_CITATIONS
 * markers per message. Returns display text with [[cite:N]] markers plus the
 * cite table for the renderer.
 */
export function extractCitations(
  markdown: string,
  rows: CitationRow[],
  base: string,
): { text: string; cites: Cite[] } {
  const fences = fencedSpans(markdown)
  const ordered = [...rows]
    .filter((row) => row.amount)
    .toSorted((left, right) => right.amount.length - left.amount.length)
  const claimed: FenceSpan[] = []
  const hits: Array<{ index: number; row: CitationRow }> = []

  for (const row of ordered) {
    if (hits.length >= MAX_CITATIONS) break
    if (hits.some((hit) => citeLabel(hit.row) === citeLabel(row))) continue
    let from = 0
    while (from <= markdown.length - row.amount.length) {
      const index = markdown.indexOf(row.amount, from)
      if (index < 0) break
      if (!insideSpans(index, fences) && !insideSpans(index, claimed)) {
        hits.push({ index, row })
        claimed.push({ start: index, end: index + row.amount.length })
        break
      }
      from = index + row.amount.length
    }
  }

  // Number cites in reading order, then splice markers back-to-front
  // so earlier indexes stay valid.
  const inReadingOrder = [...hits].toSorted((left, right) => left.index - right.index)
  const numbered = inReadingOrder.map((hit, order) => ({ ...hit, number: order + 1 }))
  let text = markdown
  for (const hit of [...numbered].toSorted((left, right) => right.index - left.index)) {
    const marker = `[[cite:${hit.number}]]`
    const at = hit.index + hit.row.amount.length
    text = `${text.slice(0, at)}${marker}${text.slice(at)}`
  }
  const cites: Cite[] = numbered.map((hit) => ({
    index: hit.number,
    label: citeLabel(hit.row),
    href: transactionsHref(hit.row, base),
  }))

  return { text, cites }
}
