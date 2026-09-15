import { Moon, Sun } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { currentTheme, setTheme } from "@/lib/theme"

/** Bouton rond du thème (36 px, surface). */
export function ThemeToggle() {
  const { t } = useTranslation()
  const [theme, setState] = useState(currentTheme)
  const next = theme === "dark" ? "light" : "dark"
  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next)
        setState(next)
      }}
      aria-label={next === "light" ? t("theme.toLight") : t("theme.toDark")}
      title={next === "light" ? t("theme.light") : t("theme.dark")}
      className="grid size-9 place-items-center rounded-full bg-card text-foreground transition-colors duration-150 hover:bg-primary-tint hover:text-primary-tint-foreground"
    >
      {theme === "dark" ? <Sun size={18} strokeWidth={2.75} aria-hidden="true" /> : <Moon size={18} strokeWidth={2.75} aria-hidden="true" />}
    </button>
  )
}
