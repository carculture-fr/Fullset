import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router-dom"

import { KeyedChips } from "@/components/fields"
import { LibraryTabs } from "@/components/library-tabs"
import { api, errorMessage, type HardwareItem } from "@/lib/api"
import { euros, formatDate } from "@/lib/format"
import { valueLabel } from "@/lib/i18n"
import { HARDWARE_SORTS, usePreferences, type HardwareSort } from "@/lib/preferences"

export const hardwareTitle = (h: Pick<HardwareItem, "platform" | "model" | "kind">) =>
  h.model ? `${h.platform} ${h.model}` : h.kind === "Console" ? h.platform : `${valueLabel("hwKind", h.kind)} ${h.platform}`

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true })

// Plus récent ou plus cher d'abord ; sans date ni prix, en fin de liste.
function sortHardware(items: HardwareItem[], sort: HardwareSort) {
  const byTitle = (a: HardwareItem, b: HardwareItem) => collator.compare(hardwareTitle(a), hardwareTitle(b))
  const list = [...items]
  if (sort === "achat") return list.sort((a, b) => (b.purchase_date ?? "").localeCompare(a.purchase_date ?? "") || byTitle(a, b))
  if (sort === "prix") return list.sort((a, b) => (b.price_cents ?? -1) - (a.price_cents ?? -1) || byTitle(a, b))
  return list.sort(byTitle)
}

export default function Hardware() {
  const { t } = useTranslation()
  const { prefs } = usePreferences()
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<HardwareItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api<{ items: HardwareItem[] }>("/api/hardware").then((r) => setItems(r.items), (err) => setError(errorMessage(err)))
  }, [])

  // Le tri choisi ici vit dans l'adresse, le temps de la visite ; celui par défaut vient des réglages.
  const sort = HARDWARE_SORTS.find((s) => s.key === params.get("tri"))?.key ?? prefs.hardware_sort
  const setSort = (key: HardwareSort) => setParams(key === prefs.hardware_sort ? {} : { tri: key }, { replace: true })

  const groups = useMemo(() => {
    const map = new Map<string, HardwareItem[]>()
    for (const h of sortHardware(items ?? [], "nom")) map.set(h.platform, [...(map.get(h.platform) ?? []), h])
    return [...map].sort((a, b) => collator.compare(a[0], b[0]))
  }, [items])
  const flat = useMemo(() => (items && sort !== "plateforme" ? sortHardware(items, sort) : []), [items, sort])

  if (error) return <p className="py-16 text-center text-destructive">{error}</p>
  if (!items) return <p className="py-16 text-center text-muted-foreground">{t("library.loading")}</p>
  const spent = items.reduce((n, h) => n + (h.price_cents ?? 0), 0)

  return (
    <div className="pb-24">
      <LibraryTabs />
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {items.length > 1 && (
          <div className="w-52">
            <KeyedChips
              label={t("hardware.sortLabel")}
              choices={HARDWARE_SORTS.map((s) => ({ key: s.key, label: t(`sorts.hardware.${s.key}`) }))}
              value={sort}
              onChange={setSort}
            />
          </div>
        )}
        <span className="text-muted-foreground">
          {t("hardware.items", { count: items.length })} · {euros(spent)}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <p>{t("hardware.empty")}</p>
          <Link to="/consoles/ajouter" className="mt-3 inline-block text-primary underline">
            {t("hardware.addConsole")}
          </Link>
        </div>
      ) : sort !== "plateforme" ? (
        <ul className="divide-y divide-border rounded-lg bg-card px-2 py-1">
          {flat.map((h) => (
            <li key={h.id}>
              <HardwareRow item={h} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-2">
          {groups.map(([platform, list]) => (
            <details key={platform} open className="group rounded-lg bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
                <span className="min-w-0 flex-1 truncate font-medium">{platform}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {t("hardware.items", { count: list.length })} · {euros(list.reduce((n, h) => n + (h.price_cents ?? 0), 0))}
                </span>
              </summary>
              <ul className="divide-y divide-border px-2 pb-2">
                {list.map((h) => (
                  <li key={h.id}>
                    <HardwareRow item={h} />
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}

      <Link
        to="/consoles/ajouter"
        aria-label={t("hardware.addHardware")}
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-primary text-3xl text-primary-foreground shadow-lg shadow-black/40"
      >
        +
      </Link>
    </div>
  )
}

function HardwareRow({ item: h }: { item: HardwareItem }) {
  useTranslation()
  const details = [h.kind !== "Console" ? valueLabel("hwKind", h.kind) : null, h.edition, h.color, valueLabel("condition", h.condition_item)].filter(Boolean).join(" · ")
  return (
    <Link to={`/consoles/${h.id}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
      {h.photo ? (
        <img src={h.photo} alt="" loading="lazy" className="size-12 shrink-0 rounded object-cover" />
      ) : h.image ? (
        <img src={h.image} alt="" loading="lazy" className="size-12 shrink-0 rounded bg-white object-contain p-0.5" />
      ) : (
        <div className="flex size-12 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="7" width="20" height="11" rx="5" />
            <path d="M7 11v3M5.5 12.5h3M16 11.5h.01M18 13.5h.01" />
          </svg>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{hardwareTitle(h)}</div>
        <div className="truncate text-xs text-muted-foreground">{details}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm tabular-nums">{h.price_cents === null ? "—" : euros(h.price_cents)}</div>
        {h.purchase_date && <div className="text-xs text-muted-foreground tabular-nums">{formatDate(h.purchase_date)}</div>}
      </div>
    </Link>
  )
}
