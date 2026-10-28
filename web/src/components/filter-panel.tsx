import { X } from "lucide-react"
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Field, Menu } from "@/components/fields"
import { FieldKicker } from "@/components/library-tabs"
import { anyValueLabel } from "@/lib/i18n"
import { FACETS, NONE, type FacetOption, type Filters } from "@/lib/library"
import type fr from "@/locales/fr.json"

type FacetKey = keyof typeof fr.facets
type FacetDef = (typeof FACETS)[number]

/** Valeur d'un filtre telle qu'affichée : les listes fixes sont traduites, pas celles de l'utilisateur (lieux, tags, consoles). */
export const facetValueLabel = (f: FacetDef, value: string) => (f.order || value === NONE ? anyValueLabel(value) : value)

// Au-delà de 1023 px, les filtres sont posés sur la page, au-dessus des jeux (demande de Tom, 15/09/2026).
const DESKTOP = "(min-width: 1024px)"
const subscribe = (notify: () => void) => {
  const mq = window.matchMedia(DESKTOP)
  mq.addEventListener("change", notify)
  return () => mq.removeEventListener("change", notify)
}
export const useDesktop = () => useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => false)

// Sur la page, ces critères restent visibles ; les autres se déplient au besoin.
const PRIMARY = ["plateforme", "support", "contenu", "etat-jeu"]

type Props = {
  counts: Record<string, FacetOption[]>
  filters: Filters
  onChange: (filters: Filters) => void
}

function useFacets({ counts, filters, onChange }: Props) {
  const toggle = (key: string, value: string) => {
    const current = filters[key] ?? []
    onChange({ ...filters, [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] })
  }
  const clear = (key: string) => {
    const next = { ...filters }
    delete next[key]
    onChange(next)
  }
  // Un critère à une seule valeur ne permet pas de choisir : on le masque, sauf s'il est coché.
  const visible = FACETS.filter((f) => filters[f.key]?.length || (counts[f.key]?.length ?? 0) > 1)
  const active = FACETS.some((f) => filters[f.key]?.length)
  return { toggle, clear, visible, active }
}

function FacetMenu({ f, counts, filters, toggle, clear }: { f: FacetDef; counts: Props["counts"]; filters: Filters; toggle: (k: string, v: string) => void; clear: (k: string) => void }) {
  const { t } = useTranslation()
  const options = counts[f.key] ?? []
  return (
    <Menu
      label={t(`facets.${f.key as FacetKey}`)}
      multiple
      placeholder={t("filterPanel.all")}
      display={(v) => facetValueLabel(f, v)}
      options={options.map((o) => o.value)}
      counts={Object.fromEntries(options.map((o) => [o.value, o.count]))}
      selected={filters[f.key] ?? []}
      onPick={(v) => toggle(f.key, v)}
      onClear={filters[f.key]?.length ? () => clear(f.key) : undefined}
    />
  )
}

/** Téléphone et tablette : plein écran, un menu par critère, le bouton bas donne le nombre de jeux. */
export function FilterPanel({ open, onClose, resultCount, ...props }: Props & { open: boolean; onClose: () => void; resultCount: number }) {
  const { t } = useTranslation()
  const { toggle, clear, visible, active } = useFacets(props)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])
  if (!open) return null

  return (
    <div role="dialog" aria-modal="true" aria-label={t("filterPanel.title")} className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <h2 className="text-[21px]">{t("filterPanel.title")}</h2>
        {active && (
          <button type="button" onClick={() => props.onChange({})} className="ml-auto text-[13px] text-muted-foreground underline">
            {t("filterPanel.clearAll")}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("filterPanel.close")}
          className={`grid size-10 shrink-0 place-items-center rounded-full bg-card text-foreground ${active ? "" : "ml-auto"}`}
        >
          <X size={20} strokeWidth={2.75} aria-hidden="true" />
        </button>
      </div>

      {/* La marge basse laisse la place à la liste ouverte du dernier menu et au bouton fixe. */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pt-2 pb-72">
        {visible.map((f) => (
          <Field key={f.key} label={t(`facets.${f.key as FacetKey}`)}>
            <FacetMenu f={f} counts={props.counts} filters={props.filters} toggle={toggle} clear={clear} />
          </Field>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto h-[48px] w-full rounded-full bg-primary font-heading text-[16px] text-primary-foreground shadow-md transition-transform duration-150 active:scale-[.98]"
        >
          {t("filterPanel.show", { count: resultCount })}
        </button>
      </div>
    </div>
  )
}

// Champs posés sur la carte (surface) : fond de page, 40 px ; critère actif bordé de sauge.
export const ON_CARD_FIELD = "[&_button[aria-haspopup]]:min-h-10 [&_button[aria-haspopup]]:bg-background [&_button[aria-haspopup]]:text-[13px]"
const FIELD_ON = "[&_button[aria-haspopup]]:border-primary"

/** Grand écran : le tri et les critères sur la page, dans une carte au-dessus des jeux. */
export function PageFilters({ sortField, ...props }: Props & { sortField: ReactNode }) {
  const { t } = useTranslation()
  const { toggle, clear, visible, active } = useFacets(props)
  const [more, setMore] = useState(false)
  // Un critère secondaire coché reste visible : un filtre actif ne doit pas être caché.
  const shown = visible.filter((f) => more || PRIMARY.includes(f.key) || props.filters[f.key]?.length)
  const hidden = visible.filter((f) => !shown.includes(f))

  return (
    <section aria-label={t("filterPanel.title")} className="mt-3.5 rounded-card bg-card p-4">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-[18px]">{t("filterPanel.title")}</h2>
        {active && (
          <button type="button" onClick={() => props.onChange({})} className="ml-auto text-[12px] text-muted-foreground underline">
            {t("filterPanel.clearAll")}
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-3.5 xl:grid-cols-5">
        <div className={ON_CARD_FIELD}>{sortField}</div>
        {shown.map((f) => (
          <div key={f.key} className={`min-w-0 ${ON_CARD_FIELD} ${props.filters[f.key]?.length ? FIELD_ON : ""}`}>
            <FieldKicker>{t(`facets.${f.key as FacetKey}`)}</FieldKicker>
            <FacetMenu f={f} counts={props.counts} filters={props.filters} toggle={toggle} clear={clear} />
          </div>
        ))}
      </div>
      {(hidden.length > 0 || more) && (
        <button
          type="button"
          onClick={() => setMore(!more)}
          aria-expanded={more}
          className="mt-3 text-left text-[12px] text-muted-foreground hover:text-foreground"
        >
          {more ? t("filterPanel.fewer") : `+ ${hidden.map((f) => t(`facets.${f.key as FacetKey}`)).join(" · ")}`}
        </button>
      )}
    </section>
  )
}
