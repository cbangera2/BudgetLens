import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "@/app/app"

import "@/styles.css"

const root = document.getElementById("root")

if (!root) {
  throw new Error("BudgetLens root element was not found")
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
