import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from "react-router-dom"

import { BarcodeIcon } from "@/components/copy-form"
import { ThemeToggle } from "@/components/theme-toggle"
import { api, type Health } from "@/lib/api"
import { CLIENT_VERSION, reloadIfOutdated } from "@/lib/pwa"

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2.5 py-1.5 ${isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`

const iconClass = ({ isActive }: { isActive: boolean }) =>
  `flex size-9 items-center justify-center rounded-md hover:bg-muted hover:text-foreground ${isActive ? "bg-muted text-foreground" : "text-muted-foreground"}`

export function Layout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  // Jeux et matériel sont les deux onglets de la même bibliothèque.
  const inLibrary = pathname === "/" || ["/jeux", "/consoles", "/ajouter", "/importer"].some((p) => pathname.startsWith(p))
  const [health, setHealth] = useState<Health | null>(null)
  const online = useOnline()
  useEffect(() => {
    api<Health>("/api/health").then((h) => {
      setHealth(h)
      reloadIfOutdated(h.version)
    }, () => {})
  }, [])

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4">
      <header className="flex items-center gap-2 py-3 sm:gap-3">
        <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <img src="/icon.svg" alt="" className="size-7" />
          <span className="hidden sm:inline">Fullset</span>
        </Link>
        <nav className="flex min-w-0 gap-1 text-sm">
          <Link to="/" className={navClass({ isActive: inLibrary })}>
            {t("layout.library")}
          </Link>
          <NavLink to="/stats" className={navClass}>
            <span className="sm:hidden">{t("layout.statsShort")}</span>
            <span className="hidden sm:inline">{t("layout.stats")}</span>
          </NavLink>
          <NavLink to="/souhaits" className={navClass}>
            {t("layout.wishlist")}
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <NavLink to="/brocante" aria-label={t("layout.brocante")} title={t("layout.brocante")} className={iconClass}>
            <BarcodeIcon />
          </NavLink>
          <ThemeToggle />
          <NavLink to="/reglages" aria-label={t("layout.settings")} title={t("layout.settings")} className={iconClass}>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </NavLink>
        </div>
      </header>
      {!online && (
        <p role="status" className="mb-3 rounded-lg bg-muted px-3 py-2 text-sm">
          {t("layout.offline")}
        </p>
      )}
      <div className="flex-1">
        <Outlet />
      </div>
      {health && (
        <footer className="py-4 text-xs text-muted-foreground">
          {t("layout.footerVersion", { version: CLIENT_VERSION })}
          {health.version !== CLIENT_VERSION && CLIENT_VERSION !== "dev" && ` ${t("layout.footerUpdating", { version: health.version })}`} · {t("layout.footerSchema", { schema: health.schema })}
        </footer>
      )}
      <ScrollRestoration />
    </div>
  )
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])
  return online
}
