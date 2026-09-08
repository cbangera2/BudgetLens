import { useEffect, useRef, useState } from "react"

import {
  normalizeCsvHeader,
  validateCsvMapping,
  type CsvColumnMapping,
  type CsvMappableField,
} from "./csv-mapping"

// Saved CSV column-mapping profiles, persisted in localStorage under a
// versioned key so future schema changes can migrate forward without loss.
// A profile pairs a normalized header signature with the field-to-column
// mapping a user confirmed for files shaped like that signature.

export const MAPPING_PROFILES_KEY = "budgetlens.csv-mapping-profiles.v1"

const LEGACY_KEYS = [
  "budgetlens.csv-mapping-profiles",
  "budgetlens.csv-mapping-profiles.v0",
] as const

export const MAPPING_PROFILE_VERSION = 1
export const MAX_MAPPING_PROFILE_NAME_LENGTH = 80
export const MAX_MAPPING_PROFILES = 50
export const FUZZY_PROFILE_MIN_SCORE = 0.5
export const MAX_FUZZY_SUGGESTIONS = 3

export interface MappingProfile {
  id: string
  name: string
  signature: string[]
  mapping: CsvColumnMapping
  sourceFileName: string | null
  createdAt: string
  updatedAt: string
}

export interface MappingProfileInput {
  name: string
  headers: readonly string[]
  mapping: CsvColumnMapping
  sourceFileName?: string
}

interface PersistedPayload {
  version: number
  profiles: MappingProfile[]
}

const MAPPING_FIELDS: readonly CsvMappableField[] = [
  "date",
  "amount",
  "description",
  "category",
  "account",
  "type",
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function makeId(): string {
  const candidate = globalThis.crypto?.randomUUID?.()
  if (typeof candidate === "string" && candidate.length > 0) return candidate
  return `mapping-profile-${Date.now().toString(36)}-${Math.floor(Math.random() * 36 ** 6).toString(36)}`
}

function normalizeName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, MAX_MAPPING_PROFILE_NAME_LENGTH).trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Normalizes the header set of one CSV file into a sorted signature used for
 * profile matching. Sorting makes the signature order-insensitive; normalizing
 * makes it case- and separator-insensitive.
 */
export function headerSignature(headers: readonly string[]): string[] {
  return [
    ...new Set(headers.map(normalizeCsvHeader).filter((header) => header.length > 0)),
  ].toSorted()
}

export function signaturesEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((header, index) => header === b[index])
}

/**
 * Suggests a profile name from the uploaded file name (for example
 * "bank-odd-headers.csv" becomes "bank odd headers"). Editable in the UI.
 */
export function suggestMappingProfileName(sourceFileName: string): string {
  const base = sourceFileName.replaceAll("\\", "/").split("/").at(-1) ?? ""
  const withoutExtension = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base
  const cleaned = withoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MAPPING_PROFILE_NAME_LENGTH)
    .trim()
  return cleaned.length > 0 ? cleaned : "CSV mapping"
}

/**
 * Builds a canonical column mapping from unknown stored data. Returns null
 * when the payload cannot describe a usable mapping (wrong types, missing
 * required fields, or two fields sharing one column).
 */
export function normalizeColumnMapping(value: unknown): CsvColumnMapping | null {
  if (!isRecord(value)) return null
  const mapping: CsvColumnMapping = {
    date: null,
    amount: null,
    description: null,
    category: null,
    account: null,
    type: null,
  }
  for (const field of MAPPING_FIELDS) {
    const entry = value[field]
    if (entry === null || entry === undefined) continue
    if (typeof entry !== "string") return null
    const trimmed = entry.trim()
    mapping[field] = trimmed ? trimmed : null
  }
  return validateCsvMapping(mapping) === null ? mapping : null
}

function normalizeProfile(value: unknown): MappingProfile | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== "string" || !value.id.trim()) return null
  if (typeof value.name !== "string") return null
  const name = normalizeName(value.name)
  if (name === null) return null
  if (!Array.isArray(value.signature)) return null
  const signature = headerSignature(value.signature.filter((entry) => typeof entry === "string"))
  if (signature.length === 0) return null
  const mapping = normalizeColumnMapping(value.mapping)
  if (mapping === null) return null
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return null
  let sourceFileName: string | null = null
  if (typeof value.sourceFileName === "string" && value.sourceFileName.trim()) {
    sourceFileName = value.sourceFileName.trim().slice(0, 255)
  }
  return {
    id: value.id,
    name,
    signature,
    mapping,
    sourceFileName,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

function normalizeProfiles(value: unknown): MappingProfile[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const profiles: MappingProfile[] = []
  for (const entry of value) {
    const profile = normalizeProfile(entry)
    if (!profile || seen.has(profile.id)) continue
    seen.add(profile.id)
    profiles.push(profile)
  }
  return profiles
}

function parseProfiles(raw: string | null): MappingProfile[] | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return normalizeProfiles(parsed)
    if (isRecord(parsed) && Array.isArray(parsed.profiles)) {
      return normalizeProfiles(parsed.profiles)
    }
    return []
  } catch {
    return []
  }
}

function readKey(storage: Pick<Storage, "getItem">, key: string): MappingProfile[] | null {
  try {
    return parseProfiles(storage.getItem(key))
  } catch {
    return []
  }
}

/**
 * Loads mapping profiles, migrating any legacy-key payload forward to the
 * versioned key. Never throws: corrupt payloads read as an empty list.
 */
export function loadMappingProfiles(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
): MappingProfile[] {
  const current = readKey(storage, MAPPING_PROFILES_KEY)
  if (current !== null) return current
  for (const legacy of LEGACY_KEYS) {
    const migrated = readKey(storage, legacy)
    if (migrated !== null && migrated.length > 0) {
      persistMappingProfiles(storage, migrated)
      return migrated
    }
  }
  return []
}

export function persistMappingProfiles(
  storage: Pick<Storage, "setItem">,
  profiles: readonly MappingProfile[],
): void {
  const payload: PersistedPayload = { version: MAPPING_PROFILE_VERSION, profiles: [...profiles] }
  try {
    storage.setItem(MAPPING_PROFILES_KEY, JSON.stringify(payload))
  } catch {
    // Private-mode storage may throw; profiles still apply for this session.
  }
}

export interface UpsertMappingProfileResult {
  profiles: MappingProfile[]
  profile: MappingProfile | null
  created: boolean
}

/**
 * Creates a profile, or updates the profile that already covers the same
 * header signature. One signature maps to at most one profile, so remembering
 * a refined mapping for a familiar shape replaces the older one.
 */
export function upsertMappingProfile(
  profiles: readonly MappingProfile[],
  input: MappingProfileInput,
  now: string = new Date().toISOString(),
): UpsertMappingProfileResult {
  const name = normalizeName(input.name)
  const mapping = normalizeColumnMapping(input.mapping)
  const signature = headerSignature(input.headers)
  if (name === null || mapping === null || signature.length === 0) {
    return { profiles: [...profiles], profile: null, created: false }
  }
  const sourceFileName =
    typeof input.sourceFileName === "string" && input.sourceFileName.trim()
      ? input.sourceFileName.trim().slice(0, 255)
      : null
  const existingIndex = profiles.findIndex((profile) =>
    signaturesEqual(profile.signature, signature),
  )
  if (existingIndex >= 0) {
    const existing = profiles[existingIndex]!
    const updated: MappingProfile = {
      ...existing,
      name,
      mapping,
      sourceFileName: sourceFileName ?? existing.sourceFileName,
      updatedAt: now,
    }
    const next = [...profiles]
    next[existingIndex] = updated
    return { profiles: next, profile: updated, created: false }
  }
  if (profiles.length >= MAX_MAPPING_PROFILES) {
    return { profiles: [...profiles], profile: null, created: false }
  }
  const createdProfile: MappingProfile = {
    id: makeId(),
    name,
    signature,
    mapping,
    sourceFileName,
    createdAt: now,
    updatedAt: now,
  }
  return { profiles: [...profiles, createdProfile], profile: createdProfile, created: true }
}

export function renameMappingProfile(
  profiles: readonly MappingProfile[],
  id: string,
  name: string,
  now: string = new Date().toISOString(),
): MappingProfile[] {
  const normalized = normalizeName(name)
  if (normalized === null) return [...profiles]
  let changed = false
  const next = profiles.map((profile) => {
    if (profile.id !== id || profile.name === normalized) return profile
    changed = true
    return { ...profile, name: normalized, updatedAt: now }
  })
  return changed ? next : [...profiles]
}

export function deleteMappingProfile(
  profiles: readonly MappingProfile[],
  id: string,
): MappingProfile[] {
  // Deleting a profile only removes the matcher. Already-imported transactions
  // live in IndexedDB and never reference profiles, so stored data is untouched.
  if (!profiles.some((profile) => profile.id === id)) return [...profiles]
  return profiles.filter((profile) => profile.id !== id)
}

/**
 * Finds the profile whose header signature exactly matches the file. Returns
 * the most recently updated profile when duplicates exist.
 */
export function findExactMappingProfile(
  profiles: readonly MappingProfile[],
  headers: readonly string[],
): MappingProfile | null {
  const signature = headerSignature(headers)
  let best: MappingProfile | null = null
  for (const profile of profiles) {
    if (!signaturesEqual(profile.signature, signature)) continue
    if (best === null || profile.updatedAt.localeCompare(best.updatedAt) > 0) best = profile
  }
  return best
}

export interface RankedMappingProfile {
  profile: MappingProfile
  score: number
  sharedCount: number
  profileColumnCount: number
  fileColumnCount: number
}

/**
 * Ranks profiles by Jaccard similarity between their signature and the file
 * headers. Exact matches are excluded: they resolve through the exact path,
 * and fuzzy candidates must always be confirmed by the user before use.
 */
export function rankFuzzyMappingProfiles(
  profiles: readonly MappingProfile[],
  headers: readonly string[],
  options?: { minScore?: number; maxSuggestions?: number },
): RankedMappingProfile[] {
  const minScore = options?.minScore ?? FUZZY_PROFILE_MIN_SCORE
  const maxSuggestions = options?.maxSuggestions ?? MAX_FUZZY_SUGGESTIONS
  const fileSignature = headerSignature(headers)
  if (fileSignature.length === 0) return []
  const fileSet = new Set(fileSignature)
  const ranked: RankedMappingProfile[] = []
  for (const profile of profiles) {
    const profileSet = new Set(profile.signature)
    let shared = 0
    for (const header of fileSet) {
      if (profileSet.has(header)) shared += 1
    }
    const union = fileSet.size + profileSet.size - shared
    if (union === 0) continue
    const score = shared / union
    if (score >= 1 || score < minScore) continue
    ranked.push({
      profile,
      score,
      sharedCount: shared,
      profileColumnCount: profileSet.size,
      fileColumnCount: fileSet.size,
    })
  }
  ranked.sort((a, b) => b.score - a.score || b.profile.updatedAt.localeCompare(a.profile.updatedAt))
  return ranked.slice(0, maxSuggestions)
}

export type MappingProfileResolution =
  | { kind: "exact"; profile: MappingProfile }
  | { kind: "suggest"; suggestions: RankedMappingProfile[] }
  | { kind: "none" }

/**
 * Resolves which profile applies to an uploaded file. Exact signature matches
 * may be pre-applied; near misses are returned as suggestions that the UI
 * must ask the user to confirm. Fuzzy matches are never silently applied.
 */
export function resolveMappingProfileForHeaders(
  profiles: readonly MappingProfile[],
  headers: readonly string[],
  options?: { minScore?: number; maxSuggestions?: number },
): MappingProfileResolution {
  const exact = findExactMappingProfile(profiles, headers)
  if (exact) return { kind: "exact", profile: exact }
  const suggestions = rankFuzzyMappingProfiles(profiles, headers, options)
  if (suggestions.length > 0) return { kind: "suggest", suggestions }
  return { kind: "none" }
}

/**
 * Translates a stored profile mapping onto the actual headers of the current
 * file. Saved column names are matched by normalized value, so harmless
 * casing or spacing drift still resolves; columns that no longer exist come
 * back blank for the user to fix.
 */
export function applyMappingProfileToHeaders(
  profile: MappingProfile,
  headers: readonly string[],
): Record<CsvMappableField, string> {
  const byNormalized = new Map<string, string>()
  for (const header of headers) {
    const normalized = normalizeCsvHeader(header)
    if (!byNormalized.has(normalized)) byNormalized.set(normalized, header)
  }
  const result: Record<CsvMappableField, string> = {
    date: "",
    amount: "",
    description: "",
    category: "",
    account: "",
    type: "",
  }
  for (const field of MAPPING_FIELDS) {
    const saved = profile.mapping[field]
    if (!saved) continue
    result[field] = byNormalized.get(normalizeCsvHeader(saved)) ?? ""
  }
  return result
}

export function defaultMappingProfilesStorage(): Storage | undefined {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage
  } catch {
    // Ignore and fall through to globalThis.
  }
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage
    if (candidate) return candidate
  } catch {
    return undefined
  }
  return undefined
}

export interface MappingProfileActions {
  saveProfile: (input: MappingProfileInput) => MappingProfile | null
  renameProfile: (id: string, name: string) => void
  removeProfile: (id: string) => void
}

function readProfiles(storage: Storage | undefined): MappingProfile[] {
  if (!storage) return []
  try {
    return loadMappingProfiles(storage)
  } catch {
    return []
  }
}

export function useMappingProfiles(
  storage?: Storage,
): readonly [MappingProfile[], MappingProfileActions] {
  const resolvedStorage =
    storage ?? (typeof window === "undefined" ? undefined : defaultMappingProfilesStorage())
  const [profiles, setProfiles] = useState<MappingProfile[]>(() => readProfiles(resolvedStorage))
  const currentRef = useRef(profiles)

  useEffect(() => {
    currentRef.current = profiles
    if (resolvedStorage) persistMappingProfiles(resolvedStorage, profiles)
  }, [profiles, resolvedStorage])

  const actions: MappingProfileActions = {
    saveProfile: (input) => {
      const result = upsertMappingProfile(currentRef.current, input)
      if (!result.profile) return null
      setProfiles(result.profiles)
      return result.profile
    },
    renameProfile: (id, name) => {
      setProfiles((current) => renameMappingProfile(current, id, name))
    },
    removeProfile: (id) => {
      // Removing a profile only drops the matcher entry above; imported rows
      // are stored separately and are never touched here.
      setProfiles((current) => deleteMappingProfile(current, id))
    },
  }

  return [profiles, actions] as const
}
