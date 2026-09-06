import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// The .mjs implementation is plain JS; scripts/ios-patcher.d.mts provides the
// type contract while vite resolves the real module at runtime.
import {
  APP_GROUP_TOKEN,
  TARGET_MARKER,
  WIDGET_SOURCES,
  applyPbxprojEdits,
  diffLines,
  ensureAppGroupEntitlements,
  ensureTopLevelDictKey,
  buildWidgetExtensionPlist,
  planProjectEdits,
  stableId,
  upsertMarkedBlock,
} from "../../../scripts/ios-patcher.mjs"

const PATCHER_PATH = path.resolve(process.cwd(), "scripts", "ios-patcher.mjs")
const GROUP = "group.com.cbangera2.budgetlens"

const INFO_PLIST = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
  `<plist version="1.0">`,
  `<dict>`,
  `\t<key>CFBundleIdentifier</key>`,
  `\t<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>`,
  `</dict>`,
  `</plist>`,
  ``,
].join("\n")

const PBXPROJ = [
  `// !$*UTF8*$!`,
  `{`,
  `\tarchiveVersion = 1;`,
  `\tobjects = {`,
  `/* Begin PBXBuildFile section */`,
  `\t\tAAA000000000000000000001 /* AppDelegate.swift in Sources */ = {isa = PBXBuildFile; };`,
  `/* End PBXBuildFile section */`,
  `/* Begin PBXFileReference section */`,
  `\t\tAAA000000000000000000002 /* AppDelegate.swift */ = {isa = PBXFileReference; };`,
  `/* End PBXFileReference section */`,
  `/* Begin PBXNativeTarget section */`,
  `\t\tAAA000000000000000000003 /* App */ = {isa = PBXNativeTarget; };`,
  `/* End PBXNativeTarget section */`,
  `/* Begin PBXProject section */`,
  `\t\tAAA000000000000000000004 /* Project object */ = {isa = PBXProject; targets = (`,
  `\t\t\t\tAAA000000000000000000003 /* App */,`,
  `\t\t\t); };`,
  `/* End PBXProject section */`,
  `/* Begin PBXSourcesBuildPhase section */`,
  `\t\tAAA000000000000000000005 /* Sources */ = {isa = PBXSourcesBuildPhase; };`,
  `/* End PBXSourcesBuildPhase section */`,
  `/* Begin XCBuildConfiguration section */`,
  `\t\tAAA000000000000000000006 /* Debug */ = {isa = XCBuildConfiguration; };`,
  `/* End XCBuildConfiguration section */`,
  `/* Begin XCConfigurationList section */`,
  `\t\tAAA000000000000000000007 /* List */ = {isa = XCConfigurationList; };`,
  `/* End XCConfigurationList section */`,
  `\t};`,
  `\trootObject = AAA000000000000000000004;`,
  `}`,
  ``,
].join("\n")

const SWIFT_TEMPLATE = `import Foundation\n// group: ${APP_GROUP_TOKEN}\n`

describe("ios-patcher pure parts", () => {
  it("derives deterministic 24-hex Xcode ids", () => {
    const first = stableId("BudgetLensWidget:target:widget")
    expect(first).toMatch(/^[0-9A-F]{24}$/)
    expect(stableId("BudgetLensWidget:target:widget")).toBe(first)
    expect(stableId("BudgetLensWidget:target:other")).not.toBe(first)
  })

  it("creates fresh entitlements and merges idempotently", () => {
    const fresh = ensureAppGroupEntitlements(null, GROUP)
    expect(fresh.changed).toBe(true)
    expect(fresh.text).toContain(`<string>${GROUP}</string>`)

    const again = ensureAppGroupEntitlements(fresh.text, GROUP)
    expect(again).toEqual({ text: fresh.text, changed: false })

    const other = ensureAppGroupEntitlements(fresh.text, "group.example.other")
    expect(other.changed).toBe(true)
    expect(other.text).toContain(GROUP)
    expect(other.text).toContain("group.example.other")
  })

  it("adds the group key to existing entitlements while preserving other keys", () => {
    const existing = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<plist version="1.0">`,
      `<dict>`,
      `\t<key>aps-environment</key>`,
      `\t<string>development</string>`,
      `</dict>`,
      `</plist>`,
      ``,
    ].join("\n")

    const merged = ensureAppGroupEntitlements(existing, GROUP)
    expect(merged.changed).toBe(true)
    expect(merged.text).toContain("aps-environment")
    expect(merged.text).toContain(GROUP)
  })

  it("refuses non-XML entitlements and non-array group keys", () => {
    expect(() => ensureAppGroupEntitlements("binary-plist", GROUP)).toThrow(/XML plist/)
    const bad = [
      `<?xml version="1.0"?>`,
      `<plist version="1.0"><dict>`,
      `<key>com.apple.security.application-groups</key><string>${GROUP}</string>`,
      `</dict></plist>`,
    ].join("\n")
    expect(() => ensureAppGroupEntitlements(bad, GROUP)).toThrow(/not an <array>/)
  })

  it("inserts missing plist keys without touching nested dicts or existing values", () => {
    const nested = [
      `<?xml version="1.0"?>`,
      `<plist version="1.0">`,
      `<dict>`,
      `\t<key>Nested</key>`,
      `\t<dict>`,
      `\t\t<key>Inner</key><string>x</string>`,
      `\t</dict>`,
      `</dict>`,
      `</plist>`,
      ``,
    ].join("\n")

    const inserted = ensureTopLevelDictKey(nested, "Top", "<string>y</string>")
    expect(inserted.changed).toBe(true)
    // The new key lands in the TOP dict (after the nested close), not inside it.
    expect(inserted.text.indexOf("<key>Top</key>")).toBeGreaterThan(
      inserted.text.indexOf("</dict>"),
    )
    expect(inserted.text).toContain("<key>Inner</key>")

    const preserved = ensureTopLevelDictKey(inserted.text, "Top", "<string>changed</string>")
    expect(preserved.changed).toBe(false)
    expect(preserved.text).not.toContain("changed")
  })

  it("builds a WidgetKit widget extension plist", () => {
    const plist = buildWidgetExtensionPlist()
    expect(plist).toContain("com.apple.widgetkit-extension")
    expect(plist).toContain("NSExtensionPointIdentifier")
  })

  it("inserts marked pbxproj blocks and replaces them stably", () => {
    const first = upsertMarkedBlock("head\n/* End X section */\ntail", "X", "inner")
    expect(first.changed).toBe(true)
    expect(first.text).toContain("BudgetLensWidget:begin")

    const second = upsertMarkedBlock(first.text, "X", "inner")
    expect(second.changed).toBe(false)

    const replaced = upsertMarkedBlock(first.text, "X", "new-inner")
    expect(replaced.changed).toBe(true)
    expect(replaced.text).toContain("new-inner")

    expect(() => upsertMarkedBlock("no anchors", "Missing", "x")).toThrow(/missing/)
  })

  it("registers the widget target with cross-referenced deterministic ids", () => {
    const first = applyPbxprojEdits(PBXPROJ, { appId: "com.cbangera2.budgetlens" })
    expect(first.changed).toBe(true)
    expect(first.text).toContain(TARGET_MARKER)
    expect(first.text).toContain("com.apple.product-type.app-extension")
    expect(first.text).toContain("com.cbangera2.budgetlens.widget")
    for (const name of WIDGET_SOURCES) {
      expect(first.text).toContain(name)
    }

    const targetId = stableId("BudgetLensWidget:target:widget")
    const occurrences = first.text.split(targetId).length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2) // definition + project targets entry

    const second = applyPbxprojEdits(first.text, { appId: "com.cbangera2.budgetlens" })
    expect(second.changed).toBe(false)
    expect(second.text).toBe(first.text)
  })

  it("fails clearly when the pbxproj has no targets array", () => {
    const noTargets = PBXPROJ.replace(/targets = \(\n[\s\S]*?\n[ \t]+\);/, "targets = ();")
    expect(() => applyPbxprojEdits(noTargets, { appId: "x" })).toThrow(/targets/)
  })

  it("diffs lines for dry-run output", () => {
    const hunks = diffLines("a\nb\nc", "a\nB\nc\nd")
    expect(hunks.filter((line) => line.type === " ")).toHaveLength(2)
    expect(hunks).toContainEqual({ type: "-", text: "b" })
    expect(hunks).toContainEqual({ type: "+", text: "B" })
    expect(hunks).toContainEqual({ type: "+", text: "d" })
  })

  it("plans the full edit set and reaches a fixed point", () => {
    const files = new Map<string, string>([
      ["App/Info.plist", INFO_PLIST],
      ["App.xcodeproj/project.pbxproj", PBXPROJ],
    ])
    const readFile = (name: string): string | null => files.get(name) ?? null
    const readTemplate = (): string => SWIFT_TEMPLATE
    const options = { projectDir: "/fake/ios", appGroup: GROUP, appId: "com.cbangera2.budgetlens" }

    const first = planProjectEdits(readFile, readTemplate, options)
    const paths = first.map((change) => change.path)
    expect(paths).toContain(path.join("App", "App.entitlements"))
    expect(paths).toContain(path.join("App", "Info.plist"))
    expect(paths).toContain(path.join("App.xcodeproj", "project.pbxproj"))
    for (const name of WIDGET_SOURCES) {
      expect(paths).toContain(path.join("App", "BudgetLensWidget", name))
    }
    const swift = first.find((change) => change.path.endsWith("WidgetSnapshot.swift"))
    expect(swift?.after).toContain(GROUP)
    expect(swift?.after).not.toContain(APP_GROUP_TOKEN)

    for (const change of first) files.set(change.path, change.after)
    expect(planProjectEdits(readFile, readTemplate, options)).toEqual([])
  })
})

describe("ios-patcher CLI on a fixture project copy", () => {
  let scratch: string
  let projectDir: string

  function runPatcher(args: string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [PATCHER_PATH, ...args], { encoding: "utf8" })
    return { status: result.status, stdout: result.stdout, stderr: result.stderr }
  }

  function writeFixture(): void {
    rmSync(scratch, { recursive: true, force: true })
    mkdirSync(path.join(projectDir, "App"), { recursive: true })
    mkdirSync(path.join(projectDir, "App.xcodeproj"), { recursive: true })
    writeFileSync(path.join(projectDir, "App", "Info.plist"), INFO_PLIST, "utf8")
    writeFileSync(path.join(projectDir, "App.xcodeproj", "project.pbxproj"), PBXPROJ, "utf8")
  }

  function treeHash(): string {
    const digest = createHash("sha256")
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir).toSorted()) {
        const absolute = path.join(dir, entry)
        if (statSync(absolute).isDirectory()) walk(absolute)
        else {
          digest.update(path.relative(scratch, absolute))
          digest.update(readFileSync(absolute))
        }
      }
    }
    walk(scratch)
    return digest.digest("hex")
  }

  beforeEach(() => {
    scratch = `${tmpdir()}/budgetlens-patcher-${crypto.randomUUID()}`
    projectDir = path.join(scratch, "ios")
    writeFixture()
  })

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true })
  })

  it("applies all capabilities and is byte-identical on re-run", () => {
    expect(runPatcher(["--project", projectDir, "--check"]).status).toBe(1)

    const first = runPatcher(["--project", projectDir])
    expect(first.status).toBe(0)
    expect(first.stdout).toContain("file(s) changed")

    const entitlements = readFileSync(path.join(projectDir, "App", "App.entitlements"), "utf8")
    expect(entitlements).toContain(GROUP)
    expect(readFileSync(path.join(projectDir, "App", "Info.plist"), "utf8")).toContain(
      "NSFaceIDUsageDescription",
    )
    for (const name of WIDGET_SOURCES) {
      const copied = readFileSync(path.join(projectDir, "App", "BudgetLensWidget", name), "utf8")
      expect(copied).toContain(GROUP)
      expect(copied).not.toContain(APP_GROUP_TOKEN)
    }
    expect(
      readFileSync(
        path.join(projectDir, "App", "BudgetLensWidget", "BudgetLensWidget-Info.plist"),
        "utf8",
      ),
    ).toContain("com.apple.widgetkit-extension")
    expect(
      readFileSync(path.join(projectDir, "App.xcodeproj", "project.pbxproj"), "utf8"),
    ).toContain(TARGET_MARKER)

    const before = treeHash()
    const second = runPatcher(["--project", projectDir])
    expect(second.status).toBe(0)
    expect(second.stdout).toContain("0 file(s) changed")
    expect(treeHash()).toBe(before)

    expect(runPatcher(["--project", projectDir, "--check"]).status).toBe(0)
  })

  it("dry-runs with diffs and writes nothing", () => {
    const dry = runPatcher(["--project", projectDir, "--dry-run"])
    expect(dry.status).toBe(0)
    expect(dry.stdout).toContain(GROUP)
    expect(existsSync(path.join(projectDir, "App", "BudgetLensWidget"))).toBe(false)
    expect(readFileSync(path.join(projectDir, "App", "Info.plist"), "utf8")).toBe(INFO_PLIST)
  })

  it("honors a custom app group id", () => {
    const custom = "group.example.custom"
    expect(runPatcher(["--project", projectDir, "--app-group", custom]).status).toBe(0)
    expect(readFileSync(path.join(projectDir, "App", "App.entitlements"), "utf8")).toContain(custom)
    expect(
      readFileSync(
        path.join(projectDir, "App", "BudgetLensWidget", "WidgetSnapshot.swift"),
        "utf8",
      ),
    ).toContain(custom)
  })

  it("fails clearly when the project is missing", () => {
    const missing = runPatcher(["--project", path.join(scratch, "nope")])
    expect(missing.status).toBe(1)
    expect(missing.stderr).toContain("cap add ios")
  })
})
