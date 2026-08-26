import path from "node:path"
import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const rootDirectory = path.dirname(fileURLToPath(import.meta.url))

// GitHub Pages serves project sites at https://<user>.github.io/<repo>/.
// Use "/BudgetLens/" when built in GitHub Actions; "/" elsewhere (local dev, previews, custom domains).
// Allow override via VITE_BASE e.g. VITE_BASE=/ pnpm build for custom domain.
const base =
  process.env.VITE_BASE ?? (process.env.GITHUB_ACTIONS ? "/BudgetLens/" : "/")

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rootDirectory, "src"),
    },
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    environment: "jsdom",
    environmentOptions: {
      jsdom: { url: "http://localhost/" },
    },
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx", "src/test/**", "src/components/ui/**"],
    },
  },
})
