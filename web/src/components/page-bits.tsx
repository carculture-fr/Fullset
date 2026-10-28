import { ArrowLeft } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

export const ICON = { strokeWidth: 2.75 } as const

/** Petit tag en pilule (fiche, exemplaire) : neutre sur carte, encre, accent ou données. */
export const tagClass = {
  neutral: "rounded-full bg-muted px-3 py-1 text-[13px]",
  ink: "rounded-full bg-ink px-3 py-1 text-[13px] text-ink-foreground",
  accent: "rounded-full bg-primary-tint px-3 py-1 text-[13px] text-primary-tint-foreground",
  outline: "rounded-full border-[1.5px] border-primary px-3.5 py-1.5 text-[13px] whitespace-nowrap text-primary-text transition-colors duration-150 hover:bg-primary-tint",
  viz: "rounded-full bg-viz-bg px-3.5 py-1.5 text-[13px] whitespace-nowrap text-viz-fg",
  surface: "rounded-full bg-card px-3.5 py-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground",
} as const

/** Barre de retour : rond 40 px + libellé atténué, action à droite (« Modifier », étape…). */
export function BackBar({ to, onBack, replace, label, children }: { to?: string; onBack?: () => void; replace?: boolean; label: ReactNode; children?: ReactNode }) {
  const inner = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card text-foreground">
        <ArrowLeft size={20} {...ICON} aria-hidden="true" />
      </span>
      <span className="min-w-0 truncate text-[13px] text-muted-foreground">{label}</span>
    </>
  )
  const cls = "flex min-h-11 min-w-0 items-center gap-3 hover:[&>span:last-child]:text-foreground"
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      {to ? (
        <Link to={to} replace={replace} className={cls}>
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={onBack} className={cls}>
          {inner}
        </button>
      )}
      {children}
    </div>
  )
}

/** Segmenté pleine largeur (Physique / Dématérialisé, type de matériel) : option active en pilule encre. */
export function Segmented<T extends string>({ options, value, onChange, label, display }: { options: readonly T[]; value: T | null; onChange: (v: T) => void; label: string; display: (v: T) => string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-full bg-card p-1">
      {options.map((o) => {
        const on = o === value
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o)}
            className={`min-h-11 truncate rounded-full px-3 text-[14px] transition-colors duration-150 focus-visible:outline-offset-[-2px] ${on ? "bg-ink font-heading text-ink-foreground" : "text-foreground hover:bg-background/60"}`}
          >
            {display(o)}
          </button>
        )
      })}
    </div>
  )
}

export function useOnline() {
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

/**
 * Bouton principal fixé en bas des formulaires (pilule sauge 54 px). Jusqu'à 1023 px il se pose
 * au-dessus de la barre d'onglets (même hauteur que le dock de la bibliothèque) ; au-delà, en bas
 * de la colonne de contenu, à droite du tiroir. Hors ligne : désactivé, avec le bandeau.
 */
export function StickyCta({ label, disabled }: { label: string; disabled?: boolean }) {
  const { t } = useTranslation()
  const online = useOnline()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(78px+env(safe-area-inset-bottom))] z-30 px-4 pb-3 lg:bottom-0 lg:left-[280px] lg:px-8 lg:pb-5">
      <div className="pointer-events-auto mx-auto max-w-2xl space-y-2">
        {!online && <p className="rounded-[16px] bg-primary-tint px-4 py-2 text-[13px] text-primary-tint-foreground">{t("common.offlineWrite")}</p>}
        <button
          disabled={disabled || !online}
          className="h-[48px] w-full truncate rounded-full bg-primary px-5 font-heading text-[17px] text-primary-foreground shadow-md transition-[transform,filter] duration-150 hover:brightness-95 active:scale-[.98] disabled:opacity-45 disabled:active:scale-100"
        >
          {label}
        </button>
      </div>
    </div>
  )
}
