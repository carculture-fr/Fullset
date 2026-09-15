import { Check, ChevronDown, LayoutGrid, List } from "lucide-react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { NavLink } from "react-router-dom"

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

/**
 * « Trié par Par console ⌄ » : la valeur ouvre la liste des tris, dessinée comme les menus
 * (le composant `Menu` n'accepte pas de déclencheur en texte).
 */
export function SortMenu<T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string
  choices: ReadonlyArray<{ readonly key: T; readonly label: string }>
  value: T
  onChange: (key: T) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = choices.find((c) => c.key === value)

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", outside)
    return () => document.removeEventListener("pointerdown", outside)
  }, [open])

  const toggle = () => {
    setActive(Math.max(0, choices.findIndex((c) => c.key === value)))
    setOpen((o) => !o)
  }
  const pick = (key: T) => {
    onChange(key)
    setOpen(false)
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!open) toggle()
      else setActive((i) => Math.min(i + 1, choices.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault()
      pick(choices[active].key)
    } else if (e.key === "Escape") setOpen(false)
  }

  return (
    <div ref={box} className="relative flex min-w-0 items-center gap-2">
      <span className="shrink-0">{t("library.sortedBy")}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label} : ${current?.label ?? ""}`}
        onClick={toggle}
        onKeyDown={keys}
        className="-my-3 inline-flex min-w-0 items-center gap-[3px] py-3 font-semibold text-foreground"
      >
        <span className="truncate">{current?.label}</span>
        <ChevronDown size={14} {...ICON} aria-hidden="true" className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute top-full left-0 z-40 mt-3 w-64 max-w-[calc(100vw-36px)] overflow-hidden rounded-[20px] border border-border bg-background py-1 shadow-md"
        >
          {choices.map((c, i) => {
            const on = c.key === value
            return (
              <li
                key={c.key}
                role="option"
                aria-selected={on}
                // mousedown : choisir avant que le bouton ne perde le focus.
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(c.key)
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-11 cursor-pointer items-center gap-2.5 px-4 py-3 text-[14px] text-foreground ${i === active ? "bg-card" : ""} ${on ? "font-semibold" : ""}`}
              >
                <span className="min-w-0 flex-1">{c.label}</span>
                {on && (
                  <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check size={12} {...ICON} />
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

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

// Grille des cartes : 3 colonnes à 400 px, 4 dès 640, 5 dès 900, 6 dès 1024.
export const GRID_CLASS = "grid grid-cols-3 gap-x-2.5 gap-y-3 sm:grid-cols-4 min-[900px]:grid-cols-5 lg:grid-cols-6 lg:gap-4"

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
