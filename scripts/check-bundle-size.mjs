// CI bundle-size budget for BudgetLens production JS.
//
// Measured baseline: `pnpm build` on base 47af951 emitted 1,471,039 bytes of
// JS across dist/**/*.js. Vite already warns that index-*.js exceeds its
// 500 kB per-chunk hint, so a per-chunk cap would be red on arrival; a total
// cap still catches the failure mode we care about: an accidentally huge new
// dependency or a lost code-split boundary inflating what ships.
// Cap: 1,650,000 bytes raw (~12% headroom over baseline) -- enough slack for
// normal feature growth, tight enough to bite on a real regression. Raise it
// deliberately in a PR (re-measure, update BOTH numbers below) when growth is
// intentional; never silence it by excluding files.
//
// Usage: `pnpm build && node scripts/check-bundle-size.mjs`
// Exit 0 when under budget, 1 when over (or when dist/ is missing).

import { readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dirname, "..")
const DIST_DIR = join(REPO_ROOT, "dist")
const BASELINE_BYTES = 1_471_039 // measured via `pnpm build` on base 47af951
const CAP_BYTES = 1_650_000 // BASELINE_BYTES + ~12% headroom

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
