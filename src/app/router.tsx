import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router"

import { AppShell } from "@/app/app-shell"

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

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
