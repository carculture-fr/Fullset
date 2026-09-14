import { useState } from "react"
import { useTranslation } from "react-i18next"

import { currentTheme, setTheme } from "@/lib/theme"

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
      className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}
