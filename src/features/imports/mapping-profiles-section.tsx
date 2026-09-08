import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type { MappingProfile, MappingProfileActions } from "./mapping-profiles"

interface MappingProfilesSectionProps {
  profiles: readonly MappingProfile[]
  actions: MappingProfileActions
}

export function MappingProfilesSection({ profiles, actions }: MappingProfilesSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")
  const [error, setError] = useState("")

  function beginRename(profile: MappingProfile) {
    setEditingId(profile.id)
    setDraftName(profile.name)
    setError("")
  }

  function cancel() {
    setEditingId(null)
    setDraftName("")
    setError("")
  }

  function save(id: string) {
    if (!draftName.trim()) {
      setError("Enter a profile name.")
      return
    }
    actions.renameProfile(id, draftName)
    cancel()
  }

  return (
    <Card aria-labelledby="mapping-profiles-title">
      <CardHeader>
        <CardTitle id="mapping-profiles-title">Saved mapping profiles</CardTitle>
        <CardDescription>
          Files with exactly the same headers apply a profile automatically. Close matches are only
          ever suggested. Deleting a profile never changes already-imported data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No saved profiles yet. Map a CSV file above and check “Remember for files like this” to
            save one.
          </p>
        ) : (
          <ol className="space-y-2">
            {profiles.map((profile) => (
              <li
                key={profile.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                {editingId === profile.id ? (
                  <div className="grid w-full gap-1.5">
                    <Label htmlFor={`mapping-profile-name-${profile.id}`}>Profile name</Label>
                    <Input
                      id={`mapping-profile-name-${profile.id}`}
                      value={draftName}
                      maxLength={80}
                      autoComplete="off"
                      onChange={(event) => setDraftName(event.target.value)}
                    />
                    {error ? (
                      <p role="alert" className="text-sm text-destructive">
                        {error}
                      </p>
                    ) : null}
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="ghost" onClick={cancel}>
                        Cancel
                      </Button>
                      <Button type="button" size="sm" onClick={() => save(profile.id)}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{profile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {profile.signature.length} column{profile.signature.length === 1 ? "" : "s"}
                        {profile.sourceFileName ? ` · First seen in ${profile.sourceFileName}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Rename ${profile.name}`}
                        onClick={() => beginRename(profile)}
                      >
                        Rename
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${profile.name}`}
                        onClick={() => {
                          if (editingId === profile.id) cancel()
                          actions.removeProfile(profile.id)
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
