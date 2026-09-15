import { BarChart3, Barcode, Heart, LayoutGrid, Plus, SlidersHorizontal, WifiOff, type LucideIcon } from "lucide-react"
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

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-[10px] bg-primary" style={{ width: size, height: size }} aria-hidden="true">
      <span className="rounded-full bg-background" style={{ width: size * 0.4, height: size * 0.4 }} />
    </span>
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
    { to: "/stats", label: t("layout.stats"), Icon: BarChart3 },
    { to: "/souhaits", label: t("layout.wishlist"), Icon: Heart },
    { to: "/reglages", label: t("layout.settings"), Icon: SlidersHorizontal },
  ]

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* Tiroir (≥ 1024 px) */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto rounded-l-[28px] bg-card p-[22px] lg:flex">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-heading text-[22px]">Fullset</span>
        </Link>
        <nav aria-label={t("layout.navigation")} className="grid gap-1">
          {tabs.map(({ to, label, Icon, active }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[14px] transition-colors duration-150 ${
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
          <Link to="/brocante" className="flex h-12 items-center justify-center gap-2.5 rounded-full bg-ink font-heading text-[15px] text-ink-foreground transition-transform duration-150 active:scale-[.98]">
            <Barcode size={20} {...ICON} aria-hidden="true" />
            {t("brocante.scannerTitle")}
          </Link>
          <Link to="/ajouter" className="flex h-12 items-center justify-center gap-2.5 rounded-full bg-primary font-heading text-[15px] text-primary-foreground transition-transform duration-150 active:scale-[.98]">
            <Plus size={20} {...ICON} aria-hidden="true" />
            {t("library.addGame")}
          </Link>
          <div className="flex items-center justify-between pt-2">
            <LanguageSwitcher onChoose={(language) => save({ language }).catch(() => {})} />
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="mx-auto flex min-h-dvh w-full max-w-6xl min-w-0 flex-col px-[18px] lg:px-8">
        {/* En-tête (≤ 1023 px) */}
        <header className="flex items-center gap-2.5 pt-3.5 pb-2 lg:hidden">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-heading text-[22px]">Fullset</span>
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
        <div className="flex-1 pt-3 pb-[140px] lg:pt-[22px] lg:pb-10">
          <Outlet />
        </div>
        {health && (
          <footer className="pb-[110px] text-xs text-subtle-foreground lg:pb-6">
            {t("layout.footerVersion", { version: CLIENT_VERSION })}
            {health.version !== CLIENT_VERSION && CLIENT_VERSION !== "dev" && ` ${t("layout.footerUpdating", { version: health.version })}`} · {t("layout.footerSchema", { schema: health.schema })}
          </footer>
        )}
      </div>

      {/* Dock d'actions (≤ 1023 px, bibliothèque seulement), au-dessus de la barre d'onglets */}
      {showDock && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(78px+env(safe-area-inset-bottom))] z-30 flex justify-end gap-2.5 bg-gradient-to-t from-background from-70% to-transparent px-[18px] pt-10 pb-3 lg:hidden">
          <Link
            to="/brocante"
            className="pointer-events-auto flex h-[52px] items-center gap-2.5 rounded-full bg-ink px-5 font-heading text-[15px] text-ink-foreground shadow-md transition-transform duration-150 active:scale-[.98]"
          >
            <Barcode size={20} {...ICON} aria-hidden="true" />
            {t("brocante.scannerTitle")}
          </Link>
          <Link
            to={pathname === "/consoles" ? "/consoles/ajouter" : "/ajouter"}
            aria-label={pathname === "/consoles" ? t("hardware.addHardware") : t("library.addGame")}
            title={pathname === "/consoles" ? t("hardware.addHardware") : t("library.addGame")}
            className="pointer-events-auto grid size-[52px] place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform duration-150 active:scale-[.98]"
          >
            <Plus size={24} {...ICON} aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Barre d'onglets (≤ 1023 px) */}
      <nav
        aria-label={t("layout.navigation")}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 rounded-t-[28px] bg-card px-2.5 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] lg:hidden"
      >
        {tabs.map(({ to, label, Icon, active }) => (
          <NavLink key={to} to={to} end={to === "/"} className="flex min-h-[44px] min-w-0 flex-col items-center gap-[3px] text-[11px]">
            {({ isActive }) => {
              const on = active ?? isActive
              return (
                <>
                  <span className={`rounded-full px-4 py-1 transition-colors duration-150 ${on ? "bg-primary-tint text-primary-tint-foreground" : "text-muted-foreground"}`}>
                    <Icon size={22} {...ICON} aria-hidden="true" />
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
