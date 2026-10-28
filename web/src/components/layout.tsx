import { BarChart3, Barcode, Heart, LayoutGrid, Plus, SlidersHorizontal, Target, WifiOff, type LucideIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from "react-router-dom"

import { LanguageSwitcher } from "@/components/login"
import { ThemeToggle } from "@/components/theme-toggle"
import { api, type Health } from "@/lib/api"
import { usePreferences } from "@/lib/preferences"
import { CLIENT_VERSION, reloadIfOutdated } from "@/lib/pwa"

// Refonte « Étagère » : barre d'onglets en bas et dock d'actions jusqu'à 1023 px, tiroir de
// navigation à gauche au-delà (les filtres restent sur la page, demande de Tom du 15/09/2026).

const ICON = { strokeWidth: 2.75 } as const

/** Le logo : trois boîtiers rangés sur une étagère, comme l'icône de l'application. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className="shrink-0" role="img" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#201e1d" />
      <rect x="96" y="138" width="86" height="212" rx="16" fill="#e8e2d4" />
      <path d="M112 138h16v212h-16a16 16 0 0 1-16-16V154a16 16 0 0 1 16-16z" fill="#7f9161" />
      <rect x="198" y="104" width="86" height="246" rx="16" fill="#f7f3ea" />
      <path d="M214 104h16v246h-16a16 16 0 0 1-16-16V120a16 16 0 0 1 16-16z" fill="#a9bd86" />
      <rect x="300" y="152" width="86" height="198" rx="16" fill="#e8e2d4" />
      <path d="M316 152h16v198h-16a16 16 0 0 1-16-16V168a16 16 0 0 1 16-16z" fill="#c96f3f" />
      <rect x="80" y="366" width="352" height="26" rx="13" fill="#f7f3ea" />
    </svg>
  )
}

export function Layout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { save } = usePreferences()
  // Jeux et matériel sont les deux onglets de la même bibliothèque.
  const inLibrary = pathname === "/" || ["/jeux", "/consoles", "/ajouter", "/importer"].some((p) => pathname.startsWith(p))
  const showDock = pathname === "/" || pathname === "/consoles"
  const [health, setHealth] = useState<Health | null>(null)
  const online = useOnline()
  useEffect(() => {
    api<Health>("/api/health").then((h) => {
      setHealth(h)
      reloadIfOutdated(h.version)
    }, () => {})
  }, [])

  const tabs: Array<{ to: string; label: string; Icon: LucideIcon; active?: boolean }> = [
    { to: "/", label: t("layout.library"), Icon: LayoutGrid, active: inLibrary },
    { to: "/fullset", label: t("sets.title"), Icon: Target, active: pathname.startsWith("/fullset") },
    { to: "/stats", label: t("layout.stats"), Icon: BarChart3 },
    { to: "/souhaits", label: t("layout.wishlist"), Icon: Heart },
    { to: "/reglages", label: t("layout.settings"), Icon: SlidersHorizontal },
  ]

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* Tiroir (≥ 1024 px) */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-5 overflow-y-auto rounded-l-[28px] bg-card p-[18px] lg:flex">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-heading text-[19px]">Fullset</span>
        </Link>
        <nav aria-label={t("layout.navigation")} className="grid gap-1">
          {tabs.map(({ to, label, Icon, active }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-full px-3.5 py-2 text-[14px] transition-colors duration-150 ${
                  (active ?? isActive) ? "bg-primary-tint font-semibold text-primary-tint-foreground" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                }`
              }
            >
              <Icon size={18} {...ICON} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto grid shrink-0 gap-2">
          <Link to="/brocante" className="flex h-11 items-center justify-center gap-2.5 rounded-full bg-ink font-heading text-[15px] text-ink-foreground transition-transform duration-150 active:scale-[.98]">
            <Barcode size={20} {...ICON} aria-hidden="true" />
            {t("brocante.scannerTitle")}
          </Link>
          <Link to="/ajouter" className="flex h-11 items-center justify-center gap-2.5 rounded-full bg-primary font-heading text-[15px] text-primary-foreground transition-transform duration-150 active:scale-[.98]">
            <Plus size={20} {...ICON} aria-hidden="true" />
            {t("library.addGame")}
          </Link>
          <div className="flex items-center justify-between pt-2">
            <LanguageSwitcher up onChoose={(language) => save({ language }).catch(() => {})} />
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="mx-auto flex min-h-dvh w-full max-w-6xl min-w-0 flex-col px-4 lg:px-8">
        {/* En-tête (≤ 1023 px) */}
        <header className="flex items-center gap-2.5 pt-3.5 pb-2 lg:hidden">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-heading text-[19px]">Fullset</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher onChoose={(language) => save({ language }).catch(() => {})} />
            <ThemeToggle />
          </div>
        </header>
        {!online && (
          <p role="status" className="mt-2 flex items-center gap-2 rounded-full bg-primary-tint px-4 py-2 text-[13px] text-primary-tint-foreground">
            <WifiOff size={16} {...ICON} aria-hidden="true" className="shrink-0" />
            {t("layout.offline")}
          </p>
        )}
        <div className="flex-1 pt-3 pb-[120px] lg:pt-[18px] lg:pb-10">
          <Outlet />
        </div>
        {health && (
          <footer className="pb-[92px] text-xs text-subtle-foreground lg:pb-6">
            {t("layout.footerVersion", { version: CLIENT_VERSION })}
            {health.version !== CLIENT_VERSION && CLIENT_VERSION !== "dev" && ` ${t("layout.footerUpdating", { version: health.version })}`} · {t("layout.footerSchema", { schema: health.schema })}
          </footer>
        )}
      </div>

      {/* Dock d'actions (≤ 1023 px, bibliothèque seulement), au-dessus de la barre d'onglets */}
      {showDock && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(62px+env(safe-area-inset-bottom))] z-30 flex justify-end gap-2.5 px-4 pb-2.5 lg:hidden">
          <Link
            to="/brocante"
            className="pointer-events-auto flex h-[46px] items-center gap-2.5 rounded-full bg-ink px-5 font-heading text-[15px] text-ink-foreground shadow-md transition-transform duration-150 active:scale-[.98]"
          >
            <Barcode size={20} {...ICON} aria-hidden="true" />
            {t("brocante.scannerTitle")}
          </Link>
          <Link
            to={pathname === "/consoles" ? "/consoles/ajouter" : "/ajouter"}
            aria-label={pathname === "/consoles" ? t("hardware.addHardware") : t("library.addGame")}
            title={pathname === "/consoles" ? t("hardware.addHardware") : t("library.addGame")}
            className="pointer-events-auto grid size-[46px] place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform duration-150 active:scale-[.98]"
          >
            <Plus size={24} {...ICON} aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Barre d'onglets (≤ 1023 px) */}
      <nav
        aria-label={t("layout.navigation")}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 rounded-t-[24px] bg-card px-1.5 pt-1.5 pb-[max(10px,env(safe-area-inset-bottom))] lg:hidden"
      >
        {tabs.map(({ to, label, Icon, active }) => (
          <NavLink key={to} to={to} end={to === "/"} className="flex min-h-[44px] min-w-0 flex-col items-center gap-0.5 text-[11px]">
            {({ isActive }) => {
              const on = active ?? isActive
              return (
                <>
                  <span className={`rounded-full px-3.5 py-0.5 transition-colors duration-150 ${on ? "bg-primary-tint text-primary-tint-foreground" : "text-muted-foreground"}`}>
                    <Icon size={20} {...ICON} aria-hidden="true" />
                  </span>
                  <span className={`max-w-full truncate ${on ? "font-semibold text-primary-text" : "text-muted-foreground"}`}>{label}</span>
                </>
              )
            }}
          </NavLink>
        ))}
      </nav>
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
