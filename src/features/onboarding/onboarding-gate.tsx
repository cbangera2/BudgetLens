import { useEffect, useRef, useState } from "react"

import { router } from "@/app/router"
import { seedDemoDataIfEmpty } from "@/features/demo/demo-seed"
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen"
import {
  readOnboardingChoice,
  recordOnboardingChoice,
  safeOnboardingStorage,
  type OnboardingChoice,
} from "@/features/onboarding/onboarding-storage"

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [completedChoice, setCompletedChoice] = useState<OnboardingChoice | null>(() =>
    readOnboardingChoice(safeOnboardingStorage()),
  )
  const [pendingChoice, setPendingChoice] = useState<OnboardingChoice | null>(null)
  const [demoError, setDemoError] = useState(false)
  const importRedirectArmed = useRef(false)

  // The router only mounts with the shell after onboarding completes, so the
  // import choice navigates once the shell is rendered.
  useEffect(() => {
    if (completedChoice === "import" && importRedirectArmed.current) {
      importRedirectArmed.current = false
      void router.navigate({ to: "/imports" })
    }
  }, [completedChoice])

  if (completedChoice !== null) return <>{children}</>

  const handleSelect = (next: OnboardingChoice) => {
    if (pendingChoice !== null) return
    if (next === "demo") {
      setPendingChoice("demo")
      setDemoError(false)
      recordOnboardingChoice(safeOnboardingStorage(), "demo")
      // Seed directly (not via the cached ensureDemoData) so every attempt is
      // fresh and a failed attempt keeps onboarding visible with a retry. A
      // false no-op (sample already present) still proceeds; only a throw is a
      // seed failure.
      void seedDemoDataIfEmpty()
        .then(() => {
          setPendingChoice(null)
          setCompletedChoice("demo")
        })
        .catch(() => {
          setPendingChoice(null)
          setDemoError(true)
        })
      return
    }
    recordOnboardingChoice(safeOnboardingStorage(), next)
    if (next === "import") importRedirectArmed.current = true
    setCompletedChoice(next)
  }

  return (
    <OnboardingScreen onSelect={handleSelect} pendingChoice={pendingChoice} demoError={demoError} />
  )
}
