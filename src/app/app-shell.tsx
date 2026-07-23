import { Link, Outlet } from "@tanstack/react-router"
import {
  BarChart3,
  Landmark,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  Sun,
  Target,
  Upload,
} from "lucide-react"
import { useEffect, useState } from "react"

import { AppFooter } from "@/app/app-footer"
import { useTheme } from "@/app/theme-provider"
import { Button } from "@/components/ui/button"

const navigation = [
  { to: "/", label: "Overview", icon: BarChart3 },
  { to: "/net-worth", label: "Net worth", icon: Landmark },
  { to: "/transactions", label: "Transactions", icon: ReceiptText },
  { to: "/budgets", label: "Budgets", icon: Target },
  { to: "/imports", label: "Imports", icon: Upload },
  { to: "/settings", label: "Settings", icon: Settings },
] as const

export const SIDEBAR_PREFERENCE_KEY = "budgetlens.sidebar.v1"

export function readSidebarPreference(storage: Pick<Storage, "getItem">): boolean {
  try {
    const value = storage.getItem(SIDEBAR_PREFERENCE_KEY)
    if (value === null) return false

    const parsed: unknown = JSON.parse(value)
    return typeof parsed === "object" && parsed !== null && "collapsed" in parsed
      ? parsed.collapsed === true
      : false
  } catch {
    return false
  }
}

export function AppShell() {
  const { theme, setTheme } = useTheme()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    readSidebarPreference(window.localStorage),
  )

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_PREFERENCE_KEY,
      JSON.stringify({ collapsed: sidebarCollapsed }),
    )
  }, [sidebarCollapsed])

  const sidebarToggleLabel = sidebarCollapsed ? "Expand navigation" : "Collapse navigation"

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              B
            </span>
            <span>BudgetLens</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle color theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="hidden size-5 dark:block" aria-hidden="true" />
            <Moon className="size-5 dark:hidden" aria-hidden="true" />
          </Button>
        </div>
      </header>
      <div
        className={`mx-auto grid w-full max-w-7xl flex-1 gap-8 px-4 py-6 transition-[grid-template-columns] sm:px-6 ${
          sidebarCollapsed ? "lg:grid-cols-[3.5rem_1fr]" : "lg:grid-cols-[13rem_1fr]"
        }`}
      >
        <nav aria-label="Primary" className="overflow-x-auto lg:sticky lg:top-22 lg:self-start">
          <div
            className={`mb-2 hidden items-center lg:flex ${
              sidebarCollapsed ? "justify-center" : "justify-end"
            }`}
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label={sidebarToggleLabel}
              title={sidebarToggleLabel}
              aria-expanded={!sidebarCollapsed}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <ul className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col">
            {navigation.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link
                  to={to}
                  activeOptions={{ exact: to === "/" }}
                  aria-label={sidebarCollapsed ? label : undefined}
                  title={sidebarCollapsed ? label : undefined}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&.active]:bg-accent [&.active]:text-foreground ${
                    sidebarCollapsed ? "lg:justify-center" : ""
                  }`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className={sidebarCollapsed ? "lg:sr-only" : undefined}>{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main id="main-content" className="min-w-0">
          <Outlet />
        </main>
      </div>
      <AppFooter />
    </div>
  )
}
