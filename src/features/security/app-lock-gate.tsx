import { Lock } from "lucide-react"
import { useCallback, useEffect, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { APP_LOCK_EVENT, readAppLockMode } from "@/features/security/app-lock"
import { isNative, requestBiometricUnlock } from "@/lib/native"

/**
 * Device app lock gate. When the biometric lock is enabled in Settings and
 * this is the native shell, finance UI stays behind a Face ID / device
 * passcode challenge. Content underneath keeps rendering (opaque overlay —
 * no unmount churn, subscriptions stay alive). Web builds never lock.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const [lockEnabled, setLockEnabled] = useState(
    () => isNative() && readAppLockMode(window.localStorage) === "biometric",
  )
  const [unlocked, setUnlocked] = useState(() => !lockEnabled)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const refresh = useCallback(() => {
    const enabled = isNative() && readAppLockMode(window.localStorage) === "biometric"
    setLockEnabled(enabled)
    // Any settings change re-locks: enabling mid-session proves the setup
    // immediately, and disabling releases without a challenge.
    setUnlocked(!enabled)
    setFailed(false)
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener(APP_LOCK_EVENT, refresh)
    function onVisibility() {
      if (document.hidden) refresh()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener(APP_LOCK_EVENT, refresh)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [refresh])

  async function unlock() {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      if (await requestBiometricUnlock("Unlock BudgetLens")) {
        setUnlocked(true)
      } else {
        setFailed(true)
      }
    } finally {
      setBusy(false)
    }
  }

  if (!lockEnabled || unlocked) return <>{children}</>

  return (
    <>
      {children}
      <dialog
        open
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background p-6 text-center"
        aria-label="BudgetLens is locked"
      >
        <span className="grid size-14 place-items-center rounded-full bg-muted">
          <Lock className="size-6 text-muted-foreground" aria-hidden="true" />
        </span>
        <div>
          <p className="font-semibold">BudgetLens is locked</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Unlock with Face ID or your device passcode to continue.
          </p>
        </div>
        <Button
          onClick={() => {
            void unlock()
          }}
          disabled={busy}
        >
          {busy ? "Checking…" : "Unlock"}
        </Button>
        {failed ? (
          <p role="alert" className="text-sm text-destructive">
            Unlock did not complete. Try again.
          </p>
        ) : null}
      </dialog>
    </>
  )
}
