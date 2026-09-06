// Type contract for scripts/ios-patcher.mjs (plain JS; see the JSDoc there).
// Lets TypeScript tests import the patcher without turning on allowJs.

export declare const DEFAULT_APP_GROUP: string
export declare const DEFAULT_APP_ID: string
export declare const WIDGET_TARGET_NAME: string
export declare const WIDGET_SOURCES: string[]
export declare const WIDGET_INFO_PLIST: string
export declare const WIDGET_ENTITLEMENTS: string
export declare const APP_ENTITLEMENTS: string
export declare const APP_GROUP_ENTITLEMENT_KEY: string
export declare const IOS_DEPLOYMENT_TARGET: string
export declare const APP_GROUP_TOKEN: string
export declare const BLOCK_BEGIN: string
export declare const BLOCK_END: string
export declare const TARGET_MARKER: string

export interface PatcherOptions {
  projectDir: string
  appGroup: string
  appId: string
}

export interface FileChange {
  path: string
  before: string | null
  after: string
}

export interface TextEdit {
  text: string
  changed: boolean
}

export interface PbxprojEdit {
  text: string
  changed: boolean
  notes: string[]
}

export interface DiffLine {
  type: " " | "-" | "+"
  text: string
}

export declare function stableId(name: string): string
export declare function escapeXml(value: string): string
export declare function topLevelDictCloseIndex(plistXml: string): number
export declare function ensureTopLevelDictKey(
  plistXml: string,
  key: string,
  valueXml: string,
): TextEdit
export declare function ensureAppGroupEntitlements(
  existingXml: string | null,
  groupId: string,
): TextEdit
export declare function buildWidgetExtensionPlist(): string
export declare function upsertMarkedBlock(text: string, section: string, inner: string): TextEdit
export declare function applyPbxprojEdits(text: string, context: { appId: string }): PbxprojEdit
export declare function applyHostTargetEmbedEdits(
  text: string,
  ids: { embedPhase: string; targetDep: string },
): PbxprojEdit
export declare function diffLines(before: string, after: string): DiffLine[]
export declare function planProjectEdits(
  readFile: (relativePath: string) => string | null,
  readTemplate: (name: string) => string,
  options: PatcherOptions,
): FileChange[]
