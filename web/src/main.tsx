import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import "./lib/i18n"
import App from "./App"
import { startPwa } from "./lib/pwa"
import { followSystemTheme } from "./lib/theme"

followSystemTheme()
// Le service worker garde l'application et les dernières données pour la consultation hors ligne.
startPwa()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
