// Tiny subsequence fuzzy matcher with single-typo tolerance (no dependencies).
//
// Scoring favors word-boundary and consecutive matches so "net" ranks
// "Net worth" above "Planet"; far jumps and substitutions cost points.
// Queries shorter than 4 chars must match exactly (no typo allowance), so
// single-keystroke filters stay precise. Returns null when there is no match.

export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase().trim()
  if (!q) return 0
  const t = target.toLowerCase()
  const allowance = q.length < 4 ? 0 : 1
  let score = 0
  let pos = 0
  let run = 0
  let typos = 0
  for (const ch of q) {
    const at = t.indexOf(ch, pos)
    if (at === -1) {
      // Typo: skip the query char (substitution/insertion) with a penalty.
      // Distant matches stay on the gap-penalty path below, never here.
      typos += 1
      if (typos > allowance) return null
      score -= 10
      run = 0
      continue
    }
    if (at === 0 || /[\s\-_./]/.test(t[at - 1] ?? "")) score += 8
    else if (at === pos) {
      run += 1
      score += 5 + Math.min(run, 4)
    } else {
      run = 0
      score -= at - pos
    }
    pos = at + 1
  }
  return score - t.length * 0.05
}
