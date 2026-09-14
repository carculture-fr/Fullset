import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { euros } from "@/lib/format"
import { locale, valueLabel, type ValueGroup } from "@/lib/i18n"

const NONE = "Non renseigné"

/**
 * Barres horizontales d'une seule série : fines (8 px), bout arrondi côté valeur, carré à la base.
 * La valeur est écrite en toutes lettres ; « Non renseigné » passe en gris pour ne pas voler l'attention.
 */
export function BarList<T extends { label: string }>({
  rows,
  value,
  format,
  detail,
  group,
}: {
  rows: T[]
  value: (r: T) => number
  format: (r: T) => string
  detail?: (r: T) => string
  /** Liste de valeurs enregistrées (contenu, statut, état) : libellés traduits ; sinon affichés tels quels. */
  group?: ValueGroup
}) {
  const { t } = useTranslation()
  const max = Math.max(1, ...rows.map(value))
  const show = (label: string) => (label === NONE ? valueLabel("misc", label) : group ? valueLabel(group, label) : label)
  if (!rows.length) return <p className="text-sm text-muted-foreground">{t("charts.noData")}</p>
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const v = value(r)
        return (
          <li key={r.label} title={detail?.(r)} className="rounded-md">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={`min-w-0 truncate ${r.label === NONE ? "text-muted-foreground" : ""}`}>{show(r.label)}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{format(r)}</span>
            </div>
            <div className="mt-1 h-2">
              <div
                className="h-full rounded-r-[4px]"
                style={{ width: `${v > 0 ? Math.max((v / max) * 100, 1.5) : 0}%`, background: r.label === NONE ? "var(--viz-muted)" : "var(--viz-bar)" }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const asDate = (month: string) => new Date(`${month}-01T00:00:00Z`)
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`

/** Pas « rond » (1, 2, 2,5 ou 5 × 10ⁿ euros) pour trois ou quatre graduations. */
function ticksFor(maxCents: number) {
  const raw = Math.max(maxCents, 100) / 3
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw)!
  const ticks = [0]
  while (ticks[ticks.length - 1] < maxCents) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

type Month = { month: string; count: number; spentCents: number }
type Column = { key: string; short: string; long: string; count: number; spentCents: number }

/** Les douze derniers mois jusqu'au mois en cours, mois vides compris. */
function lastTwelveMonths(data: Month[]): Column[] {
  // Construits à l'appel : la langue peut changer.
  const monthShort = new Intl.DateTimeFormat(locale(), { month: "short", timeZone: "UTC" })
  const monthLong = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric", timeZone: "UTC" })
  const byMonth = new Map(data.map((d) => [d.month, d]))
  const now = monthKey(new Date())
  const end = data.length && data[data.length - 1].month > now ? data[data.length - 1].month : now
  const endDate = asDate(end)
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - 11 + i, 1))
    const key = monthKey(d)
    const m = byMonth.get(key)
    return { key, short: monthShort.format(d).replace(".", ""), long: monthLong.format(d), count: m?.count ?? 0, spentCents: m?.spentCents ?? 0 }
  })
}

/** Toutes les années du premier au dernier achat daté, années vides comprises. */
function byYear(data: Month[]): Column[] {
  if (!data.length) return []
  const totals = new Map<number, { count: number; spentCents: number }>()
  for (const d of data) {
    const y = Number(d.month.slice(0, 4))
    const t = totals.get(y) ?? { count: 0, spentCents: 0 }
    totals.set(y, { count: t.count + d.count, spentCents: t.spentCents + d.spentCents })
  }
  const first = Number(data[0].month.slice(0, 4))
  const last = Number(data[data.length - 1].month.slice(0, 4))
  return Array.from({ length: last - first + 1 }, (_, i) => {
    const y = first + i
    const t = totals.get(y) ?? { count: 0, spentCents: 0 }
    return { key: String(y), short: `’${String(y).slice(2)}`, long: String(y), ...t }
  })
}

/**
 * Dépenses dans le temps, en colonnes : les douze derniers mois, ou tout l'historique par année
 * (les achats Steam remontent à 2012 : 170 colonnes mensuelles ne tiennent pas sur un téléphone).
 * Toucher ou survoler une colonne affiche son détail dans le bandeau ; par défaut, la plus haute.
 */
export function SpendingColumns({ data }: { data: Month[] }) {
  const { t, i18n } = useTranslation()
  const [view, setView] = useState<"mois" | "annees">("mois")
  const [active, setActive] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  // La langue fait partie des dépendances : noms des mois dans la langue affichée.
  const columns = useMemo(() => (view === "mois" ? lastTwelveMonths(data) : byYear(data)), [data, view, i18n.language])
  if (!data.length) return <p className="text-sm text-muted-foreground">{t("charts.noDatedPurchase")}</p>

  const ticks = ticksFor(Math.max(...columns.map((c) => c.spentCents)))
  const top = ticks[ticks.length - 1]
  const peak = columns.reduce((best, c, i) => (c.spentCents > columns[best].spentCents ? i : best), 0)
  const shown = columns[active ?? peak]
  const labelEvery = Math.ceil(columns.length / 12)
  const total = columns.reduce((n, c) => n + c.spentCents, 0)
  const tab = (on: boolean) => `rounded-md px-2.5 py-1 text-xs ${on ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label={t("charts.period")}>
          <button className={tab(view === "mois")} aria-pressed={view === "mois"} onClick={() => { setView("mois"); setActive(null) }}>
            {t("charts.lastTwelveMonths")}
          </button>
          <button className={tab(view === "annees")} aria-pressed={view === "annees"} onClick={() => { setView("annees"); setActive(null) }}>
            {t("charts.byYear")}
          </button>
        </div>
        <button onClick={() => setTable((v) => !v)} className="text-xs text-muted-foreground underline">
          {table ? t("charts.showChart") : t("charts.showTable")}
        </button>
      </div>

      <div className="mb-3 text-sm" aria-live="polite">
        <span className="mr-2 inline-block size-2.5 rounded-sm align-middle" style={{ background: "var(--viz-bar)" }} />
        <span className="font-medium">{shown.long}</span>
        <span className="text-muted-foreground">
          {" "}
          · {t("charts.copies", { count: shown.count })} · {euros(shown.spentCents)}
        </span>
        {view === "mois" && <span className="block text-xs text-muted-foreground">{t("charts.twelveMonthsTotal", { amount: euros(total) })}</span>}
      </div>

      {table ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">{view === "mois" ? t("charts.month") : t("charts.year")}</th>
                <th className="py-1.5 text-right font-medium">{t("charts.copiesHeader")}</th>
                <th className="py-1.5 text-right font-medium">{t("charts.spentHeader")}</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((c) => (
                <tr key={c.key} className="border-t border-border">
                  <td className="py-1.5">{c.long}</td>
                  <td className="py-1.5 text-right tabular-nums">{c.count}</td>
                  <td className="py-1.5 text-right tabular-nums">{euros(c.spentCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div onPointerLeave={() => setActive(null)} className="pt-3">
          <div className="relative h-44">
            {ticks.map((tick) => (
              // Ligne de hauteur nulle : la graduation tombe pile sur la valeur, étiquette centrée dessus.
              <div key={tick} className="absolute inset-x-0 flex h-0 items-center" style={{ bottom: `${(tick / top) * 100}%` }}>
                <span className="w-12 shrink-0 pr-2 text-right text-[11px] text-muted-foreground tabular-nums">{t("charts.tick", { value: Math.round(tick / 100) })}</span>
                <div className="h-px flex-1" style={{ background: "var(--viz-grid)" }} />
              </div>
            ))}
            <div className="absolute inset-y-0 right-0 left-12 flex items-end gap-[2px]">
              {columns.map((c, i) => (
                <button
                  key={c.key}
                  type="button"
                  aria-label={t("charts.column", { period: c.long, amount: euros(c.spentCents), copies: t("charts.copies", { count: c.count }) })}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  className="flex h-full min-w-0 flex-1 items-end justify-center outline-none"
                >
                  <span
                    className="w-full max-w-6 rounded-t-[4px] transition-opacity"
                    style={{
                      height: `${(c.spentCents / top) * 100}%`,
                      background: "var(--viz-bar)",
                      opacity: active === null || active === i ? 1 : 0.4,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="mt-1.5 ml-12 flex gap-[2px]">
            {columns.map((c, i) => (
              // Sur téléphone, une étiquette sur deux : « janv. févr. mars » ne tient pas dans 26 px.
              <span key={c.key} className="min-w-0 flex-1 text-center text-[11px] whitespace-nowrap text-muted-foreground">
                <span className={(i / labelEvery) % 2 === 1 ? "hidden sm:inline" : ""}>{i % labelEvery === 0 ? c.short : ""}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
