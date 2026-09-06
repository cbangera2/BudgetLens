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
  QUICK_ACTION_ADD_TYPE,
  QUICK_ACTION_BUDGETS_TYPE,
  QUICK_ACTION_EVENT,
  QUICK_ACTION_ITEMS,
  QUICK_ACTION_LAUNCH_MARKER,
  TARGET_MARKER,
  buildQuickActionItemsValue,
  ensureQuickActionShortcutItems,
  ensureSceneDelegateQuickActions,
  planProjectEdits,
  quickActionItemXml,
  quickActionSceneDelegateBlock,
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

const SCENE_DELEGATE = [
  `import UIKit`,
  `import Capacitor`,
  ``,
  `class SceneDelegate: UIResponder, UIWindowSceneDelegate {`,
  `    var window: UIWindow?`,
  ``,
  `    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {`,
  `        guard let windowScene = scene as? UIWindowScene else { return }`,
  ``,
  `        window = UIWindow(windowScene: windowScene)`,
  `        window?.rootViewController = CAPBridgeViewController()`,
  `        window?.makeKeyAndVisible()`,
  ``,
  `        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)`,
  `    }`,
  ``,
  `    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {`,
  `        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)`,
  `    }`,
  `}`,
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
  `\t\tAAA000000000000000000003 /* App */ = {`,
  `\t\t\tisa = PBXNativeTarget;`,
  `\t\t\tbuildConfigurationList = AAA000000000000000000009;`,
  `\t\t\tbuildPhases = (`,
  `\t\t\t\tAAA000000000000000000005 /* Sources */,`,
  `\t\t\t);`,
  `\t\t\tbuildRules = (`,
  `\t\t\t);`,
  `\t\t\tdependencies = (`,
  `\t\t\t);`,
  `\t\t\tname = App;`,
  `\t\t\tproductName = App;`,
  `\t\t\tproductType = "com.apple.product-type.application";`,
  `\t\t};`,
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

const SWIFT_TEMPLATE = `import Foundation\n// group: __APP_GROUP_ID__\n`

describe("quick-actions plist entries", () => {
  it("builds shortcut items for the add and budgets actions", () => {
    expect(QUICK_ACTION_ITEMS).toHaveLength(2)
    const value = buildQuickActionItemsValue()
    expect(value).toContain(`<string>${QUICK_ACTION_ADD_TYPE}</string>`)
    expect(value).toContain(`<string>${QUICK_ACTION_BUDGETS_TYPE}</string>`)
    expect(value).toContain("Add transaction")
    expect(value).toContain("View budgets")
    expect(value).toContain("UIApplicationShortcutIconTypeAdd")
    expect(value).toContain("UIApplicationShortcutIconTypeBookmark")
    expect(quickActionItemXml(QUICK_ACTION_ITEMS[0]!)).toContain(QUICK_ACTION_ADD_TYPE)
  })

  it("inserts the shortcut key into a fresh plist and is a no-op on re-run", () => {
    const first = ensureQuickActionShortcutItems(INFO_PLIST)
    expect(first.changed).toBe(true)
    expect(first.text).toContain("UIApplicationShortcutItems")
    expect(first.text).toContain(QUICK_ACTION_ADD_TYPE)
    expect(first.text).toContain(QUICK_ACTION_BUDGETS_TYPE)
    // Existing keys survive the insert.
    expect(first.text).toContain("CFBundleIdentifier")

    const second = ensureQuickActionShortcutItems(first.text)
    expect(second).toEqual({ text: first.text, changed: false })
  })

  it("merges absent types into an existing shortcut array without duplicating", () => {
    const partial = ensureQuickActionShortcutItems(INFO_PLIST).text.replace(
      new RegExp(
        `\\s*<dict>\\s*<key>UIApplicationShortcutItemType</key>\\s*<string>${QUICK_ACTION_BUDGETS_TYPE}</string>[\\s\\S]*?</dict>`,
      ),
      "",
    )
    expect(partial).toContain(QUICK_ACTION_ADD_TYPE)
    expect(partial).not.toContain(QUICK_ACTION_BUDGETS_TYPE)

    const merged = ensureQuickActionShortcutItems(partial)
    expect(merged.changed).toBe(true)
    expect(merged.text).toContain(QUICK_ACTION_ADD_TYPE)
    expect(merged.text).toContain(QUICK_ACTION_BUDGETS_TYPE)
    expect(merged.text.split(QUICK_ACTION_ADD_TYPE)).toHaveLength(2)

    expect(ensureQuickActionShortcutItems(merged.text).changed).toBe(false)
  })

  it("fails clearly when the shortcut key is not an array", () => {
    const bad = INFO_PLIST.replace(
      "</dict>",
      `\t<key>UIApplicationShortcutItems</key>\n\t<string>nope</string>\n</dict>`,
    )
    expect(() => ensureQuickActionShortcutItems(bad)).toThrow(/not an <array>/)
  })
})

describe("quick-actions SceneDelegate handler", () => {
  it("builds a bridge block forwarding the action type as a CustomEvent", () => {
    const block = quickActionSceneDelegateBlock()
    expect(block).toContain("BudgetLensQuickActions")
    expect(block).toContain(QUICK_ACTION_EVENT)
    expect(block).toContain("performActionFor")
    expect(block).toContain("captureLaunchShortcut")
    expect(block).toContain("CustomEvent")
    expect(block).toContain("CAPBridgeViewController")
  })

  it("injects the block plus the cold-start capture and is a no-op on re-run", () => {
    const first = ensureSceneDelegateQuickActions(SCENE_DELEGATE)
    expect(first.changed).toBe(true)
    expect(first.text).toContain("BudgetLensQuickActions:begin")
    expect(first.text).toContain("BudgetLensQuickActions:end")
    expect(first.text).toContain(QUICK_ACTION_LAUNCH_MARKER)
    expect(first.text).toContain(
      "BudgetLensQuickActions.captureLaunchShortcut(connectionOptions.shortcutItem)",
    )
    // The capture lands ahead of the Capacitor proxy call.
    expect(first.text.indexOf(QUICK_ACTION_LAUNCH_MARKER)).toBeLessThan(
      first.text.indexOf("SceneDelegateProxy.shared.scene(scene, willConnectTo:"),
    )
    // Untouched delegate methods survive.
    expect(first.text).toContain("openURLContexts")

    const second = ensureSceneDelegateQuickActions(first.text)
    expect(second).toEqual({ text: first.text, changed: false })
  })

  it("replaces a stale block instead of appending a second one", () => {
    const injected = ensureSceneDelegateQuickActions(SCENE_DELEGATE).text
    const stale = injected.replace("pendingType: String?", "pendingType: String???")
    const repaired = ensureSceneDelegateQuickActions(stale)
    expect(repaired.changed).toBe(true)
    expect(repaired.text).toBe(injected)
  })

  it("fails clearly when the willConnectTo proxy line is missing", () => {
    expect(() => ensureSceneDelegateQuickActions("class SceneDelegate {}")).toThrow(
      /willConnectTo proxy/,
    )
  })
})

describe("quick-actions in the full project plan", () => {
  it("reaches a fixed point with plist entries and handler injection", () => {
    const files = new Map<string, string>([
      ["App/Info.plist", INFO_PLIST],
      ["App/SceneDelegate.swift", SCENE_DELEGATE],
      ["App.xcodeproj/project.pbxproj", PBXPROJ],
    ])
    const readFile = (name: string): string | null => files.get(name) ?? null
    const readTemplate = (): string => SWIFT_TEMPLATE
    const options = { projectDir: "/fake/ios", appGroup: GROUP, appId: "com.cbangera2.budgetlens" }

    const first = planProjectEdits(readFile, readTemplate, options)
    const plist = first.find((change) => change.path === path.join("App", "Info.plist"))
    expect(plist?.after).toContain(QUICK_ACTION_ADD_TYPE)
    expect(plist?.after).toContain(QUICK_ACTION_BUDGETS_TYPE)
    expect(plist?.after).toContain("NSFaceIDUsageDescription")
    const scene = first.find((change) => change.path === path.join("App", "SceneDelegate.swift"))
    expect(scene?.after).toContain("BudgetLensQuickActions:begin")
    expect(scene?.after).toContain(QUICK_ACTION_LAUNCH_MARKER)

    for (const change of first) files.set(change.path, change.after)
    expect(planProjectEdits(readFile, readTemplate, options)).toEqual([])
  })

  it("leaves projects without a SceneDelegate alone (pre-cap-add checkout)", () => {
    const files = new Map<string, string>([
      ["App/Info.plist", INFO_PLIST],
      ["App.xcodeproj/project.pbxproj", PBXPROJ],
    ])
    const readFile = (name: string): string | null => files.get(name) ?? null
    const readTemplate = (): string => SWIFT_TEMPLATE
    const options = { projectDir: "/fake/ios", appGroup: GROUP, appId: "com.cbangera2.budgetlens" }

    const changes = planProjectEdits(readFile, readTemplate, options)
    expect(changes.some((change) => change.path.endsWith("SceneDelegate.swift"))).toBe(false)
    expect(changes.some((change) => change.path.endsWith("Info.plist"))).toBe(true)
  })
})

describe("quick-actions patcher CLI on a fixture project copy", () => {
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
    writeFileSync(path.join(projectDir, "App", "SceneDelegate.swift"), SCENE_DELEGATE, "utf8")
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
    scratch = `${tmpdir()}/budgetlens-quick-actions-${crypto.randomUUID()}`
    projectDir = path.join(scratch, "ios")
    writeFixture()
  })

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true })
  })

  it("applies plist entries plus handler injection and is byte-identical on re-run", () => {
    expect(runPatcher(["--project", projectDir, "--check"]).status).toBe(1)

    const first = runPatcher(["--project", projectDir])
    expect(first.status).toBe(0)
    expect(first.stdout).toContain("file(s) changed")

    const plist = readFileSync(path.join(projectDir, "App", "Info.plist"), "utf8")
    expect(plist).toContain("UIApplicationShortcutItems")
    expect(plist).toContain(QUICK_ACTION_ADD_TYPE)
    expect(plist).toContain(QUICK_ACTION_BUDGETS_TYPE)
    expect(plist).toContain("NSFaceIDUsageDescription")

    const scene = readFileSync(path.join(projectDir, "App", "SceneDelegate.swift"), "utf8")
    expect(scene).toContain("BudgetLensQuickActions:begin")
    expect(scene).toContain("performActionFor")
    expect(scene).toContain(QUICK_ACTION_LAUNCH_MARKER)
    expect(scene).toContain(QUICK_ACTION_EVENT)

    // The pre-existing widget registration still applies alongside.
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
    expect(dry.stdout).toContain(QUICK_ACTION_ADD_TYPE)
    expect(dry.stdout).toContain("SceneDelegate.swift")
    expect(readFileSync(path.join(projectDir, "App", "Info.plist"), "utf8")).toBe(INFO_PLIST)
    expect(readFileSync(path.join(projectDir, "App", "SceneDelegate.swift"), "utf8")).toBe(
      SCENE_DELEGATE,
    )
    expect(existsSync(path.join(projectDir, "App", "BudgetLensWidget"))).toBe(false)
  })
})
