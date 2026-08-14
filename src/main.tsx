import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "@/App"
// Side-effect import: initialises i18next (and the first paint's locale, read
// from the URL prefix) before any component asks for a translation.
import "@/i18n/config"
import "@/globals.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
