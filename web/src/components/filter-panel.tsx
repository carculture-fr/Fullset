import { useEffect } from "react"

import { Field, Menu } from "@/components/fields"
import { plural } from "@/lib/format"
import { FACETS, type FacetOption, type Filters } from "@/lib/library"

type Props = {
  open: boolean
  onClose: () => void
  counts: Record<string, FacetOption[]>
  filters: Filters
  onChange: (filters: Filters) => void
  resultCount: number
}

export function FilterPanel({ open, onClose, counts, filters, onChange, resultCount }: Props) {
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

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Filtres"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col bg-background md:max-w-md md:border-l md:border-border"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold">Filtres</h2>
          <button onClick={onClose} aria-label="Fermer" className="px-2 text-2xl leading-none text-muted-foreground hover:text-foreground">
            ×
          </button>
        </div>

        {/* Menus plutôt que pastilles ; le nombre de jeux suit chaque valeur. */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-72">
          {visible.map((f) => (
            <Field key={f.key} label={f.label}>
              <Menu
                label={f.label}
                multiple
                placeholder="Tous"
                options={counts[f.key].map((o) => o.value)}
                counts={Object.fromEntries(counts[f.key].map((o) => [o.value, o.count]))}
                selected={filters[f.key] ?? []}
                onPick={(v) => toggle(f.key, v)}
                onClear={filters[f.key]?.length ? () => clear(f.key) : undefined}
              />
            </Field>
          ))}
        </div>

        <div className="flex gap-3 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={() => onChange({})} className="rounded-lg border border-border px-4 py-2.5 text-sm">
            Tout effacer
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg bg-primary py-2.5 font-medium text-primary-foreground">
            Voir {plural(resultCount, "jeu", "jeux")}
          </button>
        </div>
      </aside>
    </div>
  )
}
