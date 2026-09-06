import { useEffect, useRef, useState } from "react"

import { router } from "@/app/router"
import { ensureDemoData } from "@/features/demo/demo-seed"
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen"
import {
  readOnboardingChoice,
  recordOnboardingChoice,
  type OnboardingChoice,
} from "@/features/onboarding/onboarding-storage"

function appStorage(): Pick<Storage, "getItem" | "setItem"> {
  return window.localStorage
}

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [completedChoice, setCompletedChoice] = useState<OnboardingChoice | null>(() =>
    readOnboardingChoice(appStorage()),
  )
  const [pendingChoice, setPendingChoice] = useState<OnboardingChoice | null>(null)
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
      recordOnboardingChoice(appStorage(), "demo")
      // Choice is recorded before seeding so the seed gate in ensureDemoData
      // treats this explicit choice as consent to load the sample budget.
      void ensureDemoData().finally(() => {
        setPendingChoice(null)
        setCompletedChoice("demo")
      })
      return
    }
    recordOnboardingChoice(appStorage(), next)
    if (next === "import") importRedirectArmed.current = true
    setCompletedChoice(next)
  }

  return <OnboardingScreen onSelect={handleSelect} pendingChoice={pendingChoice} />
}
