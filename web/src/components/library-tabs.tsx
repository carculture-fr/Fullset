import { ChevronDown, LayoutGrid, List } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { NavLink } from "react-router-dom"

import { KeyedChips } from "@/components/fields"

// Briques communes à la bibliothèque des jeux et à celle du matériel (refonte « Étagère »).

const ICON = { strokeWidth: 2.75 } as const

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-10 items-center rounded-full px-4 py-2 text-[14px] whitespace-nowrap transition-colors duration-150 ${
    isActive ? "bg-primary font-heading text-primary-foreground" : "text-foreground hover:bg-foreground/7"
  }`

/** Segmenté Jeux / Matériel, en tête de la bibliothèque. */
export function LibraryTabs() {
  const { t } = useTranslation()
  return (
    <nav aria-label={t("layout.library")} className="inline-flex shrink-0 rounded-full bg-card">
      <NavLink to="/" end className={tab}>
        {t("libraryTabs.games")}
      </NavLink>
      <NavLink to="/consoles" className={tab}>
        <span className="sm:hidden">{t("libraryTabs.hardwareShort")}</span>
        <span className="hidden sm:inline">{t("libraryTabs.hardware")}</span>
      </NavLink>
    </nav>
  )
}

export type View = "grille" | "liste"

/** Les deux ronds grille / liste. */
export function ViewToggle({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const { t } = useTranslation()
  const button = (v: View, label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={value === v}
      aria-label={label}
      title={label}
      className={`grid size-10 place-items-center rounded-full transition-colors duration-150 ${value === v ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {icon}
    </button>
  )
  return (
    <div role="group" aria-label={t("library.display")} className="flex shrink-0 gap-1.5">
      {button("grille", t("library.grid"), <LayoutGrid size={20} {...ICON} aria-hidden="true" />)}
      {button("liste", t("library.list"), <List size={20} {...ICON} aria-hidden="true" />)}
    </div>
  )
}

/** Libellé d'un champ de tri ou de filtre : petites capitales, comme sur la maquette. */
export function FieldKicker({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 truncate text-[11px] tracking-[0.06em] text-subtle-foreground uppercase">{children}</div>
}

/** « Trié par » : un champ comme ceux des filtres (libellé + menu en pilule). */
export function SortMenu<T extends string>({
  label,
  choices,
  value,
  onChange,
  className = "",
}: {
  label: string
  choices: ReadonlyArray<{ readonly key: T; readonly label: string }>
  value: T
  onChange: (key: T) => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div className={`min-w-0 ${className}`}>
      <FieldKicker>{t("library.sortedBy")}</FieldKicker>
      <KeyedChips label={label} choices={choices} value={value} onChange={onChange} />
    </div>
  )
}

/** Champ de tri posé sur la page (téléphone, matériel) : 40 px au lieu des 48 d'un formulaire. */
export const COMPACT_FIELD = "[&_button[aria-haspopup]]:min-h-10 [&_button[aria-haspopup]]:text-[14px]"

/** En-tête d'un groupe par console, dans un `<details>` : pas de carte, la hiérarchie vient du titre. */
export function GroupSummary({ name, meta }: { name: string; meta: string }) {
  return (
    <summary className="flex cursor-pointer list-none items-center gap-2 px-0.5 pb-2 [&::-webkit-details-marker]:hidden">
      <ChevronDown size={14} {...ICON} aria-hidden="true" className="shrink-0 -rotate-90 text-foreground transition-transform duration-150 group-open:rotate-0" />
      <span className="min-w-0 truncate font-heading text-[18px] leading-tight">{name}</span>
      <span className="num ml-auto shrink-0 text-[12px] text-muted-foreground lg:ml-1">{meta}</span>
    </summary>
  )
}

// Grille des cartes : 3 colonnes à 400 px, 4 dès 520, 5 dès 700, 6 dès 900, 7 dès 1024 (tiroir), 8 dès 1280.
export const GRID_CLASS = "grid grid-cols-3 gap-x-2 gap-y-2.5 min-[520px]:grid-cols-4 min-[700px]:grid-cols-5 min-[900px]:grid-cols-6 lg:grid-cols-7 lg:gap-3.5 xl:grid-cols-8"

/** Cadre de carte (grille) : léger soulèvement au survol, enfoncement au toucher. */
export const CARD_FRAME = "relative rounded-[12px] transition-[transform,box-shadow] duration-150 ease-out group-hover:shadow-sm motion-safe:group-hover:-translate-y-0.5 motion-safe:group-active:scale-[.98]"

/** Ligne de la vue liste. */
export const ROW_CLASS = "-mx-2 grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border px-2 py-2 transition-colors duration-150 hover:bg-foreground/5"

// L'affichage choisi pendant la visite (sessionStorage), sans conséquence si le stockage est indisponible.
export const readSession = (key: string) => {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}
export const writeSession = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // navigation privée : le choix vaut pour la page
  }
}
export const readView = (key: string): View | null => {
  const v = readSession(key)
  return v === "grille" || v === "liste" ? v : null
}
