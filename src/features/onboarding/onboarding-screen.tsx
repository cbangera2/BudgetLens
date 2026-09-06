import { Database, FolderInput, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { OnboardingChoice } from "@/features/onboarding/onboarding-storage"

interface OnboardingScreenProps {
  onSelect: (choice: OnboardingChoice) => void
  pendingChoice?: OnboardingChoice | null
}

const options: {
  choice: OnboardingChoice
  title: string
  description: string
  icon: typeof Database
}[] = [
  {
    choice: "demo",
    title: "Explore demo data",
    description:
      "Tour BudgetLens with a synthetic sample budget. Replace it with your data anytime.",
    icon: Sparkles,
  },
  {
    choice: "import",
    title: "Import my files",
    description: "Bring your own CSV or JSON exports. Everything stays in this browser.",
    icon: FolderInput,
  },
  {
    choice: "empty",
    title: "Start empty",
    description: "Begin with a clean workspace and add transactions manually when ready.",
    icon: Database,
  },
]

export function OnboardingScreen({ onSelect, pendingChoice = null }: OnboardingScreenProps) {
  const busy = pendingChoice !== null

  return (
    <main
      id="main-content"
      data-testid="onboarding-screen"
      className="mx-auto flex min-h-svh w-full max-w-2xl flex-col justify-center px-4 py-12 sm:px-6"
    >
      <div className="text-center">
        <p className="text-sm font-medium text-primary">Private by default</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome to BudgetLens</h1>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">
          Your financial picture, without sending financial data to a server. Choose how to begin;
          you only see this once.
        </p>
      </div>
      <div className="mt-8 grid gap-4">
        {options.map(({ choice, title, description, icon: Icon }) => (
          <Card key={choice}>
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                variant={choice === "demo" ? "default" : "outline"}
                disabled={busy}
                aria-busy={busy && pendingChoice === choice}
                onClick={() => onSelect(choice)}
              >
                {pendingChoice === choice ? "Preparing demo data…" : title}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground" aria-live="polite">
        {busy
          ? "Loading the sample budget. This takes a moment on first launch."
          : "Sample data is synthetic and clearly labeled. Imports never leave this browser."}
      </p>
    </main>
  )
}
