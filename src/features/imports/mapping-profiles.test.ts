import {
  applyMappingProfileToHeaders,
  deleteMappingProfile,
  findExactMappingProfile,
  headerSignature,
  loadMappingProfiles,
  MAPPING_PROFILES_KEY,
  persistMappingProfiles,
  rankFuzzyMappingProfiles,
  renameMappingProfile,
  resolveMappingProfileForHeaders,
  suggestMappingProfileName,
  upsertMappingProfile,
  type MappingProfile,
} from "./mapping-profiles"

const ODD_HEADERS = [
  "Transaction Date",
  "Withdrawal",
  "Narrative",
  "Spending Category",
  "Acct",
  "Flow",
  "Reference ID",
]

const ODD_MAPPING = {
  date: "Transaction Date",
  amount: "Withdrawal",
  description: "Narrative",
  category: "Spending Category",
  account: "Acct",
  type: "Flow",
}

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  } satisfies Storage
}

function savedOddProfile(name = "Odd bank"): { profiles: MappingProfile[]; id: string } {
  const result = upsertMappingProfile(
    [],
    { name, headers: ODD_HEADERS, mapping: { ...ODD_MAPPING }, sourceFileName: "bank.csv" },
    "2026-09-07T00:00:00.000Z",
  )
  if (!result.profile) throw new Error("expected a saved profile")
  return { profiles: result.profiles, id: result.profile.id }
}

describe("mapping profile signatures", () => {
  it("normalizes case, separators, and order", () => {
    expect(headerSignature(["  Withdrawal ", "TRANSACTION-DATE", "narrative"])).toEqual([
      "narrative",
      "transaction date",
      "withdrawal",
    ])
    expect(headerSignature(ODD_HEADERS)).toEqual(headerSignature(ODD_HEADERS.toReversed()))
  })

  it("suggests an editable name from the file name", () => {
    expect(suggestMappingProfileName("bank-odd-headers.csv")).toBe("bank odd headers")
    expect(suggestMappingProfileName("C:\\exports\\chase_checking.CSV")).toBe("chase checking")
    expect(suggestMappingProfileName(".csv")).toBe("CSV mapping")
  })
})

describe("mapping profile CRUD", () => {
  it("creates profiles with ids and synthetic timestamps", () => {
    const result = upsertMappingProfile(
      [],
      { name: "  Odd bank  ", headers: ODD_HEADERS, mapping: { ...ODD_MAPPING } },
      "2026-09-07T00:00:00.000Z",
    )
    expect(result.created).toBe(true)
    expect(result.profile).toMatchObject({
      name: "Odd bank",
      createdAt: "2026-09-07T00:00:00.000Z",
      sourceFileName: null,
    })
    expect(result.profile?.id).toBeTruthy()
    expect(result.profile?.signature).toEqual(headerSignature(ODD_HEADERS))
  })

  it("updates the profile that already covers the same signature", () => {
    const { profiles } = savedOddProfile()
    const refined = { ...ODD_MAPPING, category: null }
    const result = upsertMappingProfile(
      profiles,
      { name: "Odd bank refined", headers: ODD_HEADERS.toReversed(), mapping: refined },
      "2026-09-08T00:00:00.000Z",
    )
    expect(result.created).toBe(false)
    expect(result.profiles).toHaveLength(1)
    expect(result.profile).toMatchObject({
      id: profiles[0]?.id,
      name: "Odd bank refined",
      updatedAt: "2026-09-08T00:00:00.000Z",
    })
    expect(result.profile?.mapping.category).toBeNull()
  })

  it("rejects blank names and invalid mappings without changing the list", () => {
    const { profiles } = savedOddProfile()
    expect(
      upsertMappingProfile(profiles, { name: "   ", headers: ODD_HEADERS, mapping: ODD_MAPPING })
        .profile,
    ).toBeNull()
    expect(
      upsertMappingProfile(profiles, {
        name: "Bad",
        headers: ODD_HEADERS,
        mapping: { ...ODD_MAPPING, date: null },
      }).profile,
    ).toBeNull()
    expect(
      upsertMappingProfile(profiles, {
        name: "Bad",
        headers: ODD_HEADERS,
        mapping: { ...ODD_MAPPING, date: "Withdrawal" },
      }).profile,
    ).toBeNull()
  })

  it("renames profiles and ignores blank or unknown renames", () => {
    const { profiles, id } = savedOddProfile()
    const renamed = renameMappingProfile(profiles, id, " New name ", "2026-09-08T00:00:00.000Z")
    expect(renamed[0]).toMatchObject({ name: "New name", updatedAt: "2026-09-08T00:00:00.000Z" })
    expect(renameMappingProfile(profiles, id, "   ")).toEqual(profiles)
    expect(renameMappingProfile(profiles, "missing", "New")).toEqual(profiles)
  })

  it("deletes only the profile entry and never imported data", () => {
    const { profiles, id } = savedOddProfile()
    const writes: string[] = []
    const storage = memoryStorage()
    const recordWrite = storage.setItem.bind(storage)
    storage.setItem = (key: string, value: string) => {
      writes.push(key)
      recordWrite(key, value)
    }
    persistMappingProfiles(storage, profiles)
    const frozen = Object.freeze(profiles.map((profile) => Object.freeze(profile)))
    const next = deleteMappingProfile(frozen, id)
    expect(next).toEqual([])
    expect(frozen).toHaveLength(1)
    persistMappingProfiles(storage, next)
    // Profile deletion writes only its own versioned key: imported rows live in
    // IndexedDB and no transaction store is reachable from this module.
    expect(writes).toEqual([MAPPING_PROFILES_KEY, MAPPING_PROFILES_KEY])
    expect(loadMappingProfiles(storage)).toEqual([])
    expect(deleteMappingProfile(next, "missing")).toEqual(next)
  })
})

describe("mapping profile persistence", () => {
  it("persists under the versioned key and reloads", () => {
    const storage = memoryStorage()
    const { profiles } = savedOddProfile()
    persistMappingProfiles(storage, profiles)
    expect(storage.getItem(MAPPING_PROFILES_KEY)).toContain('"version":1')
    expect(loadMappingProfiles(storage)).toEqual(profiles)
  })

  it("migrates legacy-key payloads to the versioned key", () => {
    const { profiles } = savedOddProfile()
    const storage = memoryStorage({
      "budgetlens.csv-mapping-profiles": JSON.stringify(profiles),
    })
    expect(loadMappingProfiles(storage)).toEqual(profiles)
    expect(JSON.parse(storage.getItem(MAPPING_PROFILES_KEY) ?? "")).toMatchObject({ version: 1 })
  })

  it("drops stored profiles with malformed signatures or mappings", () => {
    const { profiles } = savedOddProfile()
    const valid = profiles[0]
    if (!valid) throw new Error("expected a saved profile")
    const storage = memoryStorage({
      [MAPPING_PROFILES_KEY]: JSON.stringify({
        version: 1,
        profiles: [
          { ...valid, id: "bad-signature", signature: [] },
          { ...valid, id: "bad-mapping", mapping: { ...ODD_MAPPING, date: null } },
          valid,
        ],
      }),
    })
    expect(loadMappingProfiles(storage)).toEqual([valid])
  })

  it("treats corrupt or missing payloads as an empty list", () => {
    expect(loadMappingProfiles(memoryStorage())).toEqual([])
    expect(loadMappingProfiles(memoryStorage({ [MAPPING_PROFILES_KEY]: "not json" }))).toEqual([])
    expect(
      loadMappingProfiles(
        memoryStorage({ [MAPPING_PROFILES_KEY]: JSON.stringify({ version: 1 }) }),
      ),
    ).toEqual([])
  })
})

describe("mapping profile matching", () => {
  it("matches exact signatures regardless of order or casing", () => {
    const { profiles } = savedOddProfile()
    const headers = ODD_HEADERS.toReversed().map((header) => ` ${header.toUpperCase()} `)
    expect(findExactMappingProfile(profiles, headers)?.name).toBe("Odd bank")
    expect(findExactMappingProfile([], headers)).toBeNull()
  })

  it("ranks fuzzy candidates by overlap and excludes exact matches", () => {
    const first = upsertMappingProfile(
      [],
      { name: "Odd bank", headers: ODD_HEADERS, mapping: { ...ODD_MAPPING } },
      "2026-09-07T00:00:00.000Z",
    ).profiles
    const second = upsertMappingProfile(
      first,
      {
        name: "Other",
        headers: ["When", "How Much", "What", "Reference ID"],
        mapping: {
          date: "When",
          amount: "How Much",
          description: "What",
          category: null,
          account: null,
          type: null,
        },
      },
      "2026-09-08T00:00:00.000Z",
    ).profiles
    const renamed = [...ODD_HEADERS.slice(0, 6), "Reference No."]
    const ranked = rankFuzzyMappingProfiles(second, renamed)
    expect(ranked).toHaveLength(1)
    expect(ranked[0]).toMatchObject({
      profile: expect.objectContaining({ name: "Odd bank" }),
      sharedCount: 6,
    })
    expect(ranked[0]?.score).toBeCloseTo(6 / 8)
    // The exact file itself is not a fuzzy candidate.
    expect(rankFuzzyMappingProfiles(second, ODD_HEADERS)).toEqual([])
    // Unrelated headers score below the threshold.
    expect(rankFuzzyMappingProfiles(second, ["Apples", "Oranges"])).toEqual([])
  })

  it("resolves exact matches first and suggestions second", () => {
    const { profiles } = savedOddProfile()
    const exact = resolveMappingProfileForHeaders(profiles, ODD_HEADERS)
    expect(exact.kind).toBe("exact")
    const renamed = [...ODD_HEADERS.slice(0, 6), "Reference No."]
    const suggested = resolveMappingProfileForHeaders(profiles, renamed)
    expect(suggested.kind).toBe("suggest")
    expect(resolveMappingProfileForHeaders(profiles, ["Apples", "Oranges"]).kind).toBe("none")
  })

  it("never resolves a near miss as an exact match", () => {
    const { profiles } = savedOddProfile()
    const renamed = [...ODD_HEADERS.slice(0, 6), "Reference No."]
    // The exact finder stays null so the UI cannot pre-apply the profile; the
    // near miss is only ever exposed as a suggestion the user must confirm.
    expect(findExactMappingProfile(profiles, renamed)).toBeNull()
    const resolution = resolveMappingProfileForHeaders(profiles, renamed)
    if (resolution.kind !== "suggest") throw new Error("expected a fuzzy suggestion")
    expect(resolution.suggestions[0]?.profile.name).toBe("Odd bank")
  })

  it("translates a stored mapping onto the current file headers", () => {
    const { profiles } = savedOddProfile()
    const profile = profiles[0]
    if (!profile) throw new Error("expected a saved profile")
    expect(applyMappingProfileToHeaders(profile, ODD_HEADERS)).toEqual(ODD_MAPPING)
    const renamed = [...ODD_HEADERS.slice(0, 6), "Reference No."]
    // Every mapped column still exists; only the ignored extra changed.
    expect(applyMappingProfileToHeaders(profile, renamed)).toEqual(ODD_MAPPING)
    const dropped = ODD_HEADERS.filter((header) => header !== "Acct")
    const applied = applyMappingProfileToHeaders(profile, dropped)
    expect(applied.account).toBe("")
    expect(applied.date).toBe("Transaction Date")
  })
})
