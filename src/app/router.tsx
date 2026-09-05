import {
  createBrowserHistory,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router"

import { AppShell } from "@/app/app-shell"
import { isTauriSync } from "@/lib/isTauri"

const rootRoute = createRootRoute({ component: AppShell })

const routes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: lazyRouteComponent(() => import("@/routes/index"), "OverviewPage"),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/net-worth",
    component: lazyRouteComponent(() => import("@/routes/net-worth"), "NetWorthPage"),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/transactions",
    component: lazyRouteComponent(() => import("@/routes/transactions"), "TransactionsPage"),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/groups",
    component: lazyRouteComponent(() => import("@/routes/groups"), "GroupsPage"),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/groups/$groupId",
    component: lazyRouteComponent(() => import("@/routes/group-detail"), "GroupDetailPage"),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/budgets",
    component: lazyRouteComponent(() => import("@/routes/budgets"), "BudgetsPage"),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/imports",
    component: lazyRouteComponent(() => import("@/routes/imports"), "ImportsPage"),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: lazyRouteComponent(() => import("@/routes/settings"), "SettingsPage"),
  }),
]

const routeTree = rootRoute.addChildren(routes)

// Keep router base in sync with Vite `base` (import.meta.env.BASE_URL).
// "/BudgetLens/" -> "/BudgetLens", "/" -> "/"
// Desktop binary (Tauri, custom protocol, no history fallback): hash history
// with base "/". Gated on runtime detection so one dist/ serves web + desktop.
const desktop = isTauriSync()
const rawBase = import.meta.env.BASE_URL
const basepath = desktop ? "/" : rawBase.replace(/\/$/, "") || "/"
const history = desktop ? createHashHistory() : createBrowserHistory()

export const router = createRouter({ routeTree, basepath, history })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
