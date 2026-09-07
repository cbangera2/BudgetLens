import { Database, FolderInput, Sparkles } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DEFAULT_DEMO_TEMPLATE_ID,
  DEMO_TEMPLATES,
  type DemoTemplateId,
} from "@/features/demo/demo-templates"
import type { OnboardingChoice } from "@/features/onboarding/onboarding-storage"

interface OnboardingScreenProps {
  onSelect: (choice: OnboardingChoice) => void
  pendingChoice?: OnboardingChoice | null
  demoError?: boolean
  selectedDemoTemplate?: DemoTemplateId
  onSelectDemoTemplate?: (templateId: DemoTemplateId) => void
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

export function OnboardingScreen({
  onSelect,
  pendingChoice = null,
  demoError = false,
  selectedDemoTemplate,
  onSelectDemoTemplate,
}: OnboardingScreenProps) {
  const busy = pendingChoice !== null
  const [internalTemplate, setInternalTemplate] = useState<DemoTemplateId>(DEFAULT_DEMO_TEMPLATE_ID)
  const activeTemplate = selectedDemoTemplate ?? internalTemplate
  const handleTemplateSelect = onSelectDemoTemplate ?? setInternalTemplate

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
              {choice === "demo" ? (
                <fieldset className="mb-4 grid gap-2" disabled={busy} aria-label="Sample dataset">
                  <legend className="mb-1 text-sm font-medium">Choose a sample story</legend>
                  {DEMO_TEMPLATES.map((template) => {
                    const inputId = `demo-template-${template.id}`
                    return (
                      <div
                        key={template.id}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left has-checked:border-primary has-checked:bg-accent"
                      >
                        <input
                          id={inputId}
                          type="radio"
                          name="demo-template"
                          value={template.id}
                          checked={activeTemplate === template.id}
                          onChange={() => handleTemplateSelect(template.id)}
                          data-testid={inputId}
                          className="mt-1"
                        />
                        <label htmlFor={inputId} className="cursor-pointer">
                          {template.name}
                          {template.id === DEFAULT_DEMO_TEMPLATE_ID ? " (default)" : null} —{" "}
                          {template.tagline}
                        </label>
                      </div>
                    )
                  })}
                </fieldset>
              ) : null}
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
      {demoError && !busy ? (
        <p role="alert" className="mt-4 text-center text-sm font-medium text-destructive">
          The sample budget could not be loaded. Check browser storage and select Explore demo data
          again to retry.
        </p>
      ) : null}
    </main>
  )
}
