// CI bundle-size gate for BudgetLens production JS: per-PR DELTA budget.
//
// History: an absolute total cap (scripts/check-bundle-size.mjs, since #60)
// fired four times, every time on legitimate feature growth and never on a
// real regression — each firing cost a rebaseline PR. A delta gate keeps the
// protection that matters (one PR must not balloon the bundle, e.g. an
// accidentally huge dependency or a lost code-split boundary) without
// punishing accumulated features.
//
// Usage (CI runs `pnpm build` first, then):
//   node scripts/check-bundle-delta.mjs --base <git-ref> [--limit <bytes>]
// Exit 0 when under budget, 1 when over (or when dist/ is missing).
//
// How it works: measures dist/**/*.js for the working tree, then builds the
// base ref in a disposable worktree (its own lockfile) and diffs the totals.
// The temp worktree is always removed, even on failure.

import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dirname, "..")
const DEFAULT_LIMIT_BYTES = 75 * 1024 // ~75 KB per PR: room for a real feature, bites on a bad dep.

function parseArgs(argv) {
  const args = { base: "origin/main", limit: DEFAULT_LIMIT_BYTES }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--base") args.base = argv[index + 1] ?? args.base
    if (argv[index] === "--limit") {
      const parsed = Number.parseInt(argv[index + 1] ?? "", 10)
      if (Number.isFinite(parsed) && parsed > 0) args.limit = parsed
    }
  }
  return args
}

function collectJsBytes(dir) {
  let total = 0
  const files = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        const size = statSync(full).size
        total += size
        files.push({ path: full, size })
      }
    }
  }
  walk(dir)
  return { total, files }
}

function measureBuiltTree(dir, label) {
  const dist = join(dir, "dist")
  let entries = []
  try {
    entries = readdirSync(dist)
  } catch {
    throw new Error(`bundle-delta: ${label} has no dist/ — run pnpm build first`)
  }
  if (entries.length === 0) {
    throw new Error(`bundle-delta: ${label} dist/ is empty — run pnpm build first`)
  }
  return collectJsBytes(dist).total
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "pipe", encoding: "utf8" })
}

const { base, limit } = parseArgs(process.argv.slice(2))
const headTotal = measureBuiltTree(REPO_ROOT, "working tree")

const scratchRoot = mkdtempSync(join(tmpdir(), "budgetlens-base-"))
const scratch = join(scratchRoot, "base")
try {
  run("git", ["worktree", "add", "--detach", scratch, base], REPO_ROOT)
  run("pnpm", ["install", "--frozen-lockfile"], scratch)
  run("pnpm", ["build"], scratch)
  const baseTotal = measureBuiltTree(scratch, `base ${base}`)
  const delta = headTotal - baseTotal
  const largest = collectJsFilesSorted(join(REPO_ROOT, "dist")).slice(0, 5)
  console.log(
    `bundle-delta: head ${headTotal} bytes vs base ${base} ${baseTotal} bytes (delta ${delta >= 0 ? "+" : ""}${delta}, limit +${limit}).`,
  )
  for (const file of largest) {
    console.log(`  head largest: ${file.size} bytes ${file.path}`)
  }
  if (delta > limit) {
    console.error(
      `bundle-delta: OVER BUDGET by ${delta - limit} bytes. Shrink the change (code-split, drop the dep) or, if the growth is intentional and large, split the PR.`,
    )
    process.exitCode = 1
  } else {
    console.log("bundle-delta: within budget.")
  }
} finally {
  try {
    run("git", ["worktree", "remove", "--force", scratch], REPO_ROOT)
  } catch {
    rmSync(scratchRoot, { recursive: true, force: true })
  }
  try {
    run("git", ["worktree", "prune"], REPO_ROOT)
  } catch {
    // Pruning is best-effort; a stale admin entry harms nothing.
  }
}

function collectJsFilesSorted(dir) {
  const { files } = collectJsBytes(dir)
  return files
    .map((file) => ({ ...file, path: file.path.replace(`${REPO_ROOT}/dist/`, "") }))
    .toSorted((a, b) => b.size - a.size)
}
