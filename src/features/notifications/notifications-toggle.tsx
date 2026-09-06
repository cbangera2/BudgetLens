import { useEffect, useState } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { readNotificationsEnabled } from "@/features/notifications/preferences"
import { ensureReminderStoreSync, setRemindersEnabled } from "@/features/notifications/scheduler"
import { checkReminderPermission, isNative } from "@/lib/native"

/**
 * Settings toggle block for on-device budget + bill reminders. Default OFF;
 * permission is requested only when enabling. Permission-denied and web
 * (unsupported) paths keep the toggle off and explain the state in copy.
 */
export function NotificationsSettingsCard() {
  const [isNativeShell] = useState(() => {
    try {
      return isNative()
    } catch {
      return false
    }
  })
  const [enabled, setEnabled] = useState(() => {
    try {
      return readNotificationsEnabled(window.localStorage)
    } catch {
      return false
    }
  })
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isNativeShell) return () => undefined
    let cancelled = false
    void checkReminderPermission()
      .then((status) => {
        if (cancelled) return
        // A revoked OS permission must be visible even when the stored
        // preference is still on: nothing will fire until re-granted.
        if (status === "denied") {
          setPermissionDenied(true)
          setEnabled(false)
        }
      })
      .catch(() => undefined)
    // Session singleton: intentionally never stopped here, so budget and
    // transaction commits keep reconciling after leaving Settings. The
    // app-shell mount is a follow-up owned by the shell zone.
    ensureReminderStoreSync()
    return () => {
      cancelled = true
    }
  }, [isNativeShell])

  async function onToggle(next: boolean) {
    if (busy) return
    setBusy(true)
    try {
      const outcome = await setRemindersEnabled(next)
      if (outcome.enabled) {
        setEnabled(true)
        setPermissionDenied(false)
      } else if (outcome.reason === "denied") {
        setEnabled(false)
        setPermissionDenied(true)
      } else if (outcome.reason === "disabled") {
        setEnabled(false)
      } else {
        // "unsupported" (web) and "error" both leave the toggle off silently.
        setEnabled(false)
        if (outcome.reason === "unsupported") setPermissionDenied(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget and bill reminders</CardTitle>
        <CardDescription>
          On-device reminders when a monthly budget crosses 50%, 80%, or 100%, and when a recurring
          bill is due within 3 days. No server, no account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isNativeShell && enabled && !permissionDenied}
            disabled={busy || !isNativeShell}
            onChange={(event) => {
              void onToggle(event.target.checked)
            }}
          />
          <span>Send reminders on this device</span>
        </label>
        <p className="text-xs text-muted-foreground">
          {isNativeShell
            ? "Off by default — reminders interrupt you, so nothing is scheduled until you turn this on."
            : "Reminders need the BudgetLens iPhone app. This preview does nothing on web."}
        </p>
        {isNativeShell && permissionDenied ? (
          <output className="block text-xs text-muted-foreground">
            Notifications are turned off for BudgetLens. Enable them in iOS Settings &gt;
            Notifications &gt; BudgetLens, then try again.
          </output>
        ) : null}
      </CardContent>
    </Card>
  )
}
