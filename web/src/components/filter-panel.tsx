import { X } from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { Field, Menu } from "@/components/fields"
import { anyValueLabel } from "@/lib/i18n"
import { FACETS, NONE, type FacetOption, type Filters } from "@/lib/library"
import type fr from "@/locales/fr.json"

type FacetKey = keyof typeof fr.facets
type FacetDef = (typeof FACETS)[number]

/** Valeur d'un filtre telle qu'affichée : les listes fixes sont traduites, pas celles de l'utilisateur (lieux, tags, consoles). */
export const facetValueLabel = (f: FacetDef, value: string) => (f.order || value === NONE ? anyValueLabel(value) : value)

// Au-delà de 1023 px, le tiroir de navigation est affiché et les filtres y vivent en permanence.
const DESKTOP = "(min-width: 1024px)"
const subscribe = (notify: () => void) => {
  const mq = window.matchMedia(DESKTOP)
  mq.addEventListener("change", notify)
  return () => mq.removeEventListener("change", notify)
}
export const useDesktop = () => useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => false)

// Dans le tiroir, ces critères restent visibles ; les autres se replient en une ligne.
const PRIMARY = ["plateforme", "support", "region", "contenu", "etat-jeu"]

type Props = {
  open: boolean
  onClose: () => void
  counts: Record<string, FacetOption[]>
  filters: Filters
  onChange: (filters: Filters) => void
  resultCount: number
}

export function FilterPanel(props: Props) {
  const desktop = useDesktop()
  // Le tiroir est rendu par la mise en page, dans le même passage que la page : on le cherche après coup.
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setSlot(document.getElementById("drawer-slot")), [desktop])
  if (desktop) return slot ? createPortal(<DrawerFilters {...props} />, slot) : null
  return props.open ? <FullScreenFilters {...props} /> : null
}

function useFacets({ counts, filters, onChange }: Pick<Props, "counts" | "filters" | "onChange">) {
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
function FullScreenFilters({ onClose, counts, filters, onChange, resultCount }: Props) {
  const { t } = useTranslation()
  const { toggle, clear, visible, active } = useFacets({ counts, filters, onChange })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" aria-label={t("filterPanel.title")} className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-3 px-[18px] pt-3.5 pb-3">
        <h2 className="text-[24px]">{t("filterPanel.title")}</h2>
        {active && (
          <button type="button" onClick={() => onChange({})} className="ml-auto text-[13px] text-muted-foreground underline">
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
      <div className="flex-1 space-y-4 overflow-y-auto px-[18px] pt-2 pb-72">
        {visible.map((f) => (
          <Field key={f.key} label={t(`facets.${f.key as FacetKey}`)}>
            <FacetMenu f={f} counts={counts} filters={filters} toggle={toggle} clear={clear} />
          </Field>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background from-70% to-transparent px-[18px] pt-8 pb-[max(16px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto h-[54px] w-full rounded-full bg-primary font-heading text-[16px] text-primary-foreground shadow-md transition-transform duration-150 active:scale-[.98]"
        >
          {t("filterPanel.show", { count: resultCount })}
        </button>
      </div>
    </div>
  )
}

// Champs du tiroir : 40 px, posés sur le fond (le tiroir est sur la surface) ; critère actif bordé de sauge.
const DRAWER_FIELD = "[&_button[aria-haspopup]]:min-h-10 [&_button[aria-haspopup]]:bg-background [&_button[aria-haspopup]]:text-[13px]"
const DRAWER_FIELD_ON = "[&_button[aria-haspopup]]:border-primary"

/** Grand écran : les critères vivent dans le tiroir de gauche, sous la navigation. */
function DrawerFilters({ counts, filters, onChange }: Props) {
  const { t } = useTranslation()
  const { toggle, clear, visible, active } = useFacets({ counts, filters, onChange })
  const [more, setMore] = useState(false)
  // Un critère secondaire coché reste visible : un filtre actif ne doit pas être caché.
  const shown = visible.filter((f) => more || PRIMARY.includes(f.key) || filters[f.key]?.length)
  const hidden = visible.filter((f) => !shown.includes(f))

  return (
    <section aria-label={t("filterPanel.title")} className="flex flex-col gap-3.5 border-t border-border pt-4">
      <div className="flex items-baseline">
        <h2 className="text-[18px]">{t("filterPanel.title")}</h2>
        {active && (
          <button type="button" onClick={() => onChange({})} className="ml-auto text-[12px] text-muted-foreground underline">
            {t("filterPanel.clearAll")}
          </button>
        )}
      </div>
      {shown.map((f) => (
        <div key={f.key} className={`${DRAWER_FIELD} ${filters[f.key]?.length ? DRAWER_FIELD_ON : ""}`}>
          <div className="mb-1.5 text-[11px] tracking-[0.06em] text-subtle-foreground uppercase">{t(`facets.${f.key as FacetKey}`)}</div>
          <FacetMenu f={f} counts={counts} filters={filters} toggle={toggle} clear={clear} />
        </div>
      ))}
      {hidden.length > 0 && (
        <button type="button" onClick={() => setMore(true)} aria-expanded={false} className="text-left text-[12px] text-subtle-foreground hover:text-foreground">
          {hidden.map((f) => t(`facets.${f.key as FacetKey}`)).join(" · ")}
        </button>
      )}
    </section>
  )
}
