import { RouterProvider } from "@tanstack/react-router"
import { Toaster } from "sonner"

import { router } from "@/app/router"
import { ThemeProvider } from "@/app/theme-provider"
import { OnboardingGate } from "@/features/onboarding/onboarding-gate"

export function App() {
  return (
    <ThemeProvider>
      <a
        href="#main-content"
        className="sr-only fixed top-4 left-4 z-50 rounded bg-background px-3 py-2 focus:not-sr-only"
      >
        Skip to main content
      </a>
      <OnboardingGate>
        <RouterProvider router={router} />
      </OnboardingGate>
      <Toaster richColors position="bottom-right" />
    </ThemeProvider>
  )
}
