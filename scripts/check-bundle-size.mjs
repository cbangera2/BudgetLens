// CI bundle-size budget for BudgetLens production JS.
//
// Measured baseline: `pnpm build` on base 47af951 emitted 1,471,039 bytes of
// JS across dist/**/*.js. Vite already warns that index-*.js exceeds its
// 500 kB per-chunk hint, so a per-chunk cap would be red on arrival; a total
// cap still catches the failure mode we care about: an accidentally huge new
// dependency or a lost code-split boundary inflating what ships.
// Cap: 1,760,000 bytes raw -- raised from 1,750,000 for the tax-summary
// report route (local re-measure 1,757,036 bytes on feat/tax-summary, 7,036
// over the old cap; the lazy route chunk is ~9.5 KB against ~3.5 KB of
// headroom on current main, so any new route trips it). History: 1,750,000
// + monthly-close wave (local re-measure 1,715,999 bytes on current main with
// only 4,001 bytes of headroom left; the two features add ~13 KB and ~17.5 KB
// respectively). History: 1,705,000 proved too tight once receipt OCR landed
// (1,707,024 on main, 2,024 over); 1,720,000 covered OCR but not the next
// wave. Still tight enough to bite on a real regression.
// Raise it deliberately in a PR (re-measure, update BOTH numbers below) when
// growth is intentional; never silence it by excluding files.
//
// Usage: `pnpm build && node scripts/check-bundle-size.mjs`
// Exit 0 when under budget, 1 when over (or when dist/ is missing).

import { readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dirname, "..")
const DIST_DIR = join(REPO_ROOT, "dist")
const BASELINE_BYTES = 1_471_039 // measured via `pnpm build` on base 47af951
const CAP_BYTES = 1_760_000 // raised deliberately; see note above

function collectJsFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...collectJsFiles(full))
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(full)
  }
  return files
}

let files
try {
  files = collectJsFiles(DIST_DIR)
} catch {
  console.error(`bundle-size: cannot read ${DIST_DIR} -- run \`pnpm build\` first.`)
  process.exit(1)
}

let total = 0
for (const file of files) total += statSync(file).size

console.log(
  `bundle-size: ${files.length} JS files, ${total} bytes total (cap ${CAP_BYTES}, baseline ${BASELINE_BYTES}).`,
)
if (total > CAP_BYTES) {
  console.error(
    `bundle-size: OVER BUDGET by ${total - CAP_BYTES} bytes. Shrink the bundle (code-split, drop the dep) or, if the growth is intentional, re-measure and raise CAP_BYTES in scripts/check-bundle-size.mjs in the same PR.`,
  )
  process.exit(1)
}
console.log("bundle-size: within budget.")
