export type Theme = "light" | "dark"

const KEY = "fullset-theme"
const THEME_COLOR: Record<Theme, string> = { dark: "#1b1917", light: "#f7f3ea" }

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark")

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme])
}

/** Choix explicite : il est retenu et prend le pas sur le réglage du téléphone. */
export function setTheme(theme: Theme) {
  apply(theme)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Navigation privée : le choix vaut pour la session.
  }
}

/** Sans choix enregistré, l'application suit le mode clair / sombre du téléphone, y compris quand il change. */
export function followSystemTheme() {
  const media = matchMedia("(prefers-color-scheme: light)")
  media.addEventListener("change", (e) => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(KEY)
    } catch {
      // ignoré
    }
    if (!stored) apply(e.matches ? "light" : "dark")
  })
}
