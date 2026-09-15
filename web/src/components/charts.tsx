import { useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { euros } from "@/lib/format"
import { locale, valueLabel, type ValueGroup } from "@/lib/i18n"

const NONE = "Non renseigné"

const useShow = (group?: ValueGroup) => (label: string) => (label === NONE ? valueLabel("misc", label) : group ? valueLabel(group, label) : label)

/**
 * Barres horizontales d'une seule série, en pilules terracotta : libellé, barre, montant écrit en toutes lettres.
 * « Non renseigné » passe en gris pour ne pas voler l'attention.
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
  const show = useShow(group)
  const max = Math.max(1, ...rows.map(value))
  if (!rows.length) return <p className="text-sm text-muted-foreground">{t("charts.noData")}</p>
  // Noms de console RomM longs (« Nintendo GameCube ») : la colonne des libellés s'élargit un peu au-delà des 76 px de la maquette.
  return (
    <ul className="grid grid-cols-[minmax(76px,34%)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3">
      {rows.map((r) => {
        const v = value(r)
        return (
          <li key={r.label} title={detail?.(r)} className="contents">
            <span className={`min-w-0 truncate text-[14px] ${r.label === NONE ? "text-muted-foreground" : ""}`}>{show(r.label)}</span>
            <span className="h-3 min-w-0">
              <span
                className="block h-full rounded-full"
                style={{ width: `${v > 0 ? Math.max((v / max) * 100, 4) : 0}%`, background: r.label === NONE ? "var(--viz-muted)" : "var(--viz-bar)" }}
              />
            </span>
            <span className="num text-right text-[14px]">
              {format(r)}
              {detail && <span className="sr-only"> · {detail(r)}</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Répartition en une barre empilée (états, contenu, statut), dans l'ordre de la liste,
 * puis une légende pastille + libellé + nombre : la couleur n'est jamais seule.
 */
export function StackedBar<T extends { label: string; count: number; spentCents?: number }>({
  rows,
  group,
  tone,
}: {
  rows: T[]
  group?: ValueGroup
  tone: (label: string) => string
}) {
  const { t } = useTranslation()
  const show = useShow(group)
  const shown = rows.filter((r) => r.count > 0)
  if (!shown.length) return <p className="text-sm text-muted-foreground">{t("charts.noData")}</p>
  const summary = shown.map((r) => `${show(r.label)} ${r.count}`).join(", ")
  return (
    <div>
      <div role="img" aria-label={summary} className="flex h-3.5 gap-[2px] overflow-hidden rounded-full">
        {shown.map((r) => (
          <span key={r.label} className="h-full min-w-1.5" style={{ flex: `${r.count} 1 0`, background: tone(r.label) }} />
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px]" aria-hidden="true">
        {shown.map((r) => (
          <li key={r.label} title={r.spentCents !== undefined ? euros(r.spentCents) : undefined} className="inline-flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full" style={{ background: tone(r.label) }} />
            <span className={r.label === NONE ? "text-muted-foreground" : ""}>{show(r.label)}</span>
            <span className="num">{r.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Vue tableau d'une répartition ou d'une série : en-têtes 11 px en capitales, lignes 14 px. */
export function DataTable({ head, rows, caption }: { head: string[]; rows: Array<{ key: string; cells: ReactNode[] }>; caption?: string }) {
  const { t } = useTranslation()
  if (!rows.length) return <p className="text-sm text-muted-foreground">{t("charts.noData")}</p>
  return (
    <div className="max-h-80 overflow-auto">
      <table className="w-full text-[14px]">
        {caption && <caption className="pb-2 text-left text-[13px] font-semibold">{caption}</caption>}
        <thead className="text-left text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`py-2 font-semibold ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-border">
              {r.cells.map((c, i) => (
                <td key={i} className={`py-2 ${i > 0 ? "num text-right" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Tableau d'une répartition : libellé traduit, exemplaires, dépensé. */
export function BreakdownTable<T extends { label: string; count: number; spentCents: number }>({ rows, head, group }: { rows: T[]; head: string; group?: ValueGroup }) {
  const { t } = useTranslation()
  const show = useShow(group)
  return (
    <DataTable
      head={[head, t("charts.copiesHeader"), t("charts.spentHeader")]}
      rows={rows.map((r) => ({ key: r.label, cells: [show(r.label), r.count, euros(r.spentCents)] }))}
    />
  )
}

const asDate = (month: string) => new Date(`${month}-01T00:00:00Z`)
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`

type Month = { month: string; count: number; spentCents: number }
type Column = { key: string; short: string; long: string; count: number; spentCents: number }
export type SpendingView = "mois" | "annees"

/** Les douze derniers mois jusqu'au mois en cours, mois vides compris. */
export function lastTwelveMonths(data: Month[]): Column[] {
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
    return { key, short: monthShort.format(d), long: monthLong.format(d), count: m?.count ?? 0, spentCents: m?.spentCents ?? 0 }
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
 * Dépenses dans le temps, en colonnes terracotta : les douze derniers mois, ou tout l'historique par année
 * (les achats Steam remontent à 2012 : 170 colonnes mensuelles ne tiennent pas sur un téléphone).
 * Période en cours plus foncée, période vide en simple trait. Toucher ou survoler une colonne affiche
 * son détail sous le graphique ; par défaut, la plus haute.
 */
export function SpendingColumns({ data, view }: { data: Month[]; view: SpendingView }) {
  const { t, i18n } = useTranslation()
  const [active, setActive] = useState<number | null>(null)
  // La langue fait partie des dépendances : noms des mois dans la langue affichée.
  const columns = useMemo(() => (view === "mois" ? lastTwelveMonths(data) : byYear(data)), [data, view, i18n.language])
  if (!data.length) return <p className="text-sm text-muted-foreground">{t("charts.noDatedPurchase")}</p>

  const max = Math.max(1, ...columns.map((c) => c.spentCents))
  const current = view === "mois" ? monthKey(new Date()) : String(new Date().getUTCFullYear())
  const peak = columns.reduce((best, c, i) => (c.spentCents > columns[best].spentCents ? i : best), 0)
  const shown = columns[active ?? peak]
  const labelEvery = Math.ceil(columns.length / 12)

  return (
    <div onPointerLeave={() => setActive(null)} className="flex h-full flex-col">
      <div className="flex h-56 items-end gap-1.5 sm:gap-2.5 lg:h-auto lg:min-h-64 lg:flex-1">
        {columns.map((c, i) => (
          <button
            key={c.key}
            type="button"
            aria-label={t("charts.column", { period: c.long, amount: euros(c.spentCents), copies: t("charts.copies", { count: c.count }) })}
            onPointerEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            className="flex h-full min-w-0 flex-1 flex-col justify-end rounded-[8px_8px_3px_3px]"
          >
            {c.spentCents > 0 ? (
              <span
                className="block w-full rounded-[8px_8px_3px_3px] transition-opacity duration-150"
                style={{
                  height: `${Math.max((c.spentCents / max) * 100, 3)}%`,
                  background: c.key === current ? "var(--viz-bar-strong)" : "var(--viz-bar)",
                  opacity: active === null || active === i ? 1 : 0.45,
                }}
              />
            ) : (
              <span className="block h-[2px] w-full rounded-full" style={{ background: "var(--viz-muted)" }} />
            )}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-2.5" aria-hidden="true">
        {columns.map((c, i) => (
          // Sur téléphone, une étiquette sur deux : « janv. févr. mars » ne tient pas dans 20 px.
          <span key={c.key} className="min-w-0 flex-1 text-center font-mono text-[10px] whitespace-nowrap text-subtle-foreground">
            <span className={(i / labelEvery) % 2 === 1 ? "hidden sm:inline" : ""}>{i % labelEvery === 0 ? c.short : ""}</span>
          </span>
        ))}
      </div>
      <p className="mt-3 text-[13px]" aria-live="polite">
        <span className="font-semibold">{shown.long}</span>
        <span className="text-muted-foreground">
          {" "}
          · {t("charts.copies", { count: shown.count })} · <span className="num">{euros(shown.spentCents)}</span>
        </span>
      </p>
    </div>
  )
}

/** Vue tableau des dépenses dans le temps : les douze derniers mois et toutes les années. */
export function SpendingTables({ data }: { data: Month[] }) {
  const { t, i18n } = useTranslation()
  const tables = useMemo(() => ({ months: lastTwelveMonths(data), years: byYear(data) }), [data, i18n.language])
  if (!data.length) return <p className="text-sm text-muted-foreground">{t("charts.noDatedPurchase")}</p>
  const rows = (cols: Column[]) => cols.map((c) => ({ key: c.key, cells: [c.long, c.count, euros(c.spentCents)] }))
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <DataTable caption={t("charts.lastTwelveMonths")} head={[t("charts.month"), t("charts.copiesHeader"), t("charts.spentHeader")]} rows={rows(tables.months)} />
      <DataTable caption={t("charts.byYear")} head={[t("charts.year"), t("charts.copiesHeader"), t("charts.spentHeader")]} rows={rows(tables.years)} />
    </div>
  )
}
