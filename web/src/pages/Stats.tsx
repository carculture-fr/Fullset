import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { BarList, BreakdownTable, DataTable, SpendingColumns, SpendingTables, StackedBar, lastTwelveMonths, type SpendingView } from "@/components/charts"
import { toneOf } from "@/components/condition"
import { ErrorNote } from "@/components/fields"
import { api, errorMessage, upload, type Breakdown, type Stats as StatsData } from "@/lib/api"
import { euros } from "@/lib/format"
import { valueLabel } from "@/lib/i18n"
import { useLibrary } from "@/lib/library-data"

type View = SpendingView | "tableau"

// Couleurs des répartitions sans état : sauge pour le meilleur, terracotta pour le moins bon, neutre pour l'inconnu.
const CONTENT_TONE: Record<string, string> = {
  "Complet (jeu + boîte + notice)": "var(--cond-good)",
  "Jeu + boîte": "var(--cond-ok)",
  "Jeu seul": "var(--cond-fair)",
  Dématérialisé: "var(--spine-playstation)",
}
const STATUS_TONE: Record<string, string> = {
  Terminé: "var(--cond-good)",
  "En cours": "var(--cond-ok)",
  "Pas commencé": "var(--subtle-foreground)",
  Abandonné: "var(--cond-bad)",
}
const toneIn = (map: Record<string, string>) => (label: string) => map[label] ?? "var(--cond-none)"

const kicker = "text-[11px] tracking-[0.08em] uppercase"
const hero = "mt-2 font-heading text-[30px] leading-[1.05] lg:text-[40px]"
const ghostPill = "inline-flex min-h-11 items-center rounded-full border border-border-strong bg-background px-4 text-sm font-semibold transition-colors duration-150 hover:bg-foreground/[.07]"

export default function Stats() {
  const { t } = useTranslation()
  const [s, setS] = useState<StatsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>("mois")
  const load = () => {
    setError(null)
    return api<StatsData>("/api/stats").then(setS, (err) => setError(errorMessage(err)))
  }
  useEffect(() => {
    load()
  }, [])

  if (error)
    return (
      <div className="py-16 text-center">
        <p className="text-destructive">{error}</p>
        <button onClick={load} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-card px-5 text-sm font-semibold">
          {t("common.retry")}
        </button>
      </div>
    )
  if (!s) return <p className="py-16 text-center text-muted-foreground">{t("stats.loading")}</p>

  const table = view === "tableau"
  const spent = (r: { spentCents: number }) => r.spentCents
  const copies = (r: { count: number }) => t("stats.copies", { count: r.count })
  const gamesAndCopies = (games: number, n: number) => `${t("stats.games", { count: games })} · ${t("stats.copies", { count: n })}`
  const platforms = [...s.byPlatform].sort((a, b) => b.spentCents - a.spentCents)
  const physicalTotal = s.conditions.game.reduce((n, r) => n + r.count, 0)

  const delta = s.value.estimatedCents - s.value.costOfEstimatedCents
  const overTimeNote = [
    view === "annees" ? t("charts.allYearsTotal", { amount: euros(s.spentCents - s.undated.spentCents) }) : t("charts.twelveMonthsTotal", { amount: euros(lastTwelveMonths(s.byMonth).reduce((n, c) => n + c.spentCents, 0)) }),
    s.undated.count > 0 ? t("stats.undatedShort", { count: s.undated.count, amount: euros(s.undated.spentCents) }) : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const hardwareLine =
    s.hardware.count === 0
      ? t("stats.hardwareNone")
      : t("stats.hardwareLine", {
          items: s.hardware.byKind.map((k) => t("stats.kindCount", { count: k.count, kind: k.count > 1 ? valueLabel("hwKindPlural", k.label) : valueLabel("hwKind", k.label).toLowerCase() })).join(", "),
          amount: euros(s.hardware.spentCents),
        }) + (s.hardware.value.estimatedItems > 0 ? ` · ${t("stats.hardwareValue", { amount: euros(s.hardware.value.estimatedCents) })}` : "")

  const breakdown = (rows: Breakdown, head: string, group: "content" | "playStatus" | "condition", tone: (l: string) => string) =>
    table ? <BreakdownTable rows={rows} head={head} group={group} /> : <StackedBar rows={rows} group={group} tone={tone} />

  return (
    <main className="space-y-4 pb-4 lg:space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-[36px]">{t("layout.stats")}</h1>
          <p className="text-[13px] text-muted-foreground">
            {gamesAndCopies(s.games, s.copies)} · {t("stats.consoles", { count: s.byPlatform.length })}
          </p>
        </div>
        <div role="group" aria-label={t("stats.viewLabel")} className="flex w-full overflow-hidden rounded-full border border-border-strong sm:w-auto">
          {(
            [
              ["mois", t("charts.lastTwelveMonths")],
              ["annees", t("charts.byYear")],
              ["tableau", t("stats.table")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={`min-h-11 flex-1 border-l border-border-strong px-4 text-[14px] whitespace-nowrap transition-colors duration-150 first:border-l-0 focus-visible:outline-offset-[-2px] sm:flex-none ${
                view === key ? "bg-ink text-ink-foreground" : "hover:bg-foreground/[.07]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-5">
        <section className="min-w-0 rounded-card bg-ink p-4 text-ink-foreground sm:p-5">
          <p className={`${kicker} opacity-75`}>{t("stats.totalSpent")}</p>
          <div className={`${hero} num`}>{euros(s.spentCents)}</div>
          <p className="mt-2 text-[13px] opacity-85">
            {t("stats.bySupport", { physical: euros(s.spentPhysicalCents), physicalCount: s.physical, digital: euros(s.spentDigitalCents), digitalCount: s.digital })}
          </p>
        </section>

        <section className="min-w-0 rounded-card bg-viz-bg p-4 text-viz-fg sm:p-5">
          <p className={`${kicker} text-[var(--viz-label)]`}>{t("stats.estimatedValue")}</p>
          {s.value.estimatedCopies === 0 ? (
            <p className="mt-2 text-[13px]">{t("stats.noEstimate")}</p>
          ) : (
            <>
              <div className={`${hero} num`}>{euros(s.value.estimatedCents)}</div>
              <p className="mt-2 text-[13px]">
                <span className="num">{`${delta > 0 ? "+" : ""}${euros(delta)}`}</span> ·{" "}
                {t("stats.estimatedCopies", { count: s.value.estimatedCopies, total: s.copies, cost: euros(s.value.costOfEstimatedCents) })}
              </p>
            </>
          )}
        </section>

        <section className="col-span-2 min-w-0 rounded-card bg-card p-4 sm:p-5 lg:col-span-1">
          <p className={`${kicker} text-subtle-foreground`}>{t("stats.wishlist")}</p>
          <Link to="/souhaits" className={`${hero} block hover:underline`}>
            {t("stats.games", { count: s.wishlist.count })}
          </Link>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {s.wishlist.targetCents > 0 && `${t("stats.wishlistBudget", { amount: euros(s.wishlist.targetCents) })} · `}
            <Link to="/consoles" className="hover:text-foreground hover:underline">
              {hardwareLine}
            </Link>
          </p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-5">
        <Card title={t("stats.overTime")} note={overTimeNote} className="lg:row-span-2 lg:flex lg:flex-col">
          {table ? <SpendingTables data={s.byMonth} /> : <SpendingColumns data={s.byMonth} view={view === "annees" ? "annees" : "mois"} />}
        </Card>
        <Card title={t("stats.byPlatform")}>
          {table ? (
            <DataTable
              head={[t("charts.platformHeader"), t("charts.copiesHeader"), t("charts.spentHeader")]}
              rows={platforms.map((p) => ({ key: p.platform, cells: [p.platform, p.copies, euros(p.spentCents)] }))}
            />
          ) : (
            <BarList rows={platforms.map((p) => ({ ...p, label: p.platform }))} value={spent} format={(r) => euros(r.spentCents)} detail={(r) => gamesAndCopies(r.games, r.copies)} />
          )}
        </Card>
        <Card title={t("stats.conditionGame")} note={t("stats.physicalTotal", { count: physicalTotal })}>
          {breakdown(s.conditions.game, t("charts.conditionHeader"), "condition", toneOf)}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:gap-5">
        <Card title={t("stats.byPlace")}>
          {table ? <BreakdownTable rows={s.byPlace} head={t("charts.placeHeader")} /> : <BarList rows={s.byPlace} value={spent} format={(r) => euros(r.spentCents)} detail={copies} />}
        </Card>
        <Card title={t("stats.byContent")}>{breakdown(s.byContent, t("charts.contentHeader"), "content", toneIn(CONTENT_TONE))}</Card>
        <Card title={t("stats.byStatus")}>{breakdown(s.byStatus, t("charts.statusHeader"), "playStatus", toneIn(STATUS_TONE))}</Card>
        <Card title={t("stats.conditionBox")} note={t("stats.physicalOnly")}>
          {breakdown(s.conditions.box, t("charts.conditionHeader"), "condition", toneOf)}
        </Card>
        <Card title={t("stats.conditionManual")} note={t("stats.physicalOnly")}>
          {breakdown(s.conditions.manual, t("charts.conditionHeader"), "condition", toneOf)}
        </Card>
      </div>

      <DataTransfer empty={s.copies === 0} onImported={load} />
    </main>
  )
}

function Card({ title, note, className = "", children }: { title: string; note?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-card bg-card p-5 lg:p-6 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[20px]">{title}</h2>
        {note && <p className="text-[12px] text-muted-foreground sm:text-right">{note}</p>}
      </div>
      <div className="mt-5 lg:flex-1">{children}</div>
    </section>
  )
}

function DataTransfer({ empty, onImported }: { empty: boolean; onImported: () => void }) {
  const { t } = useTranslation()
  const { reload } = useLibrary()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  return (
    <Card title={t("stats.data.title")}>
      <p className="-mt-3 mb-4 text-[13px] text-muted-foreground">{t("stats.data.note")}</p>
      <div className="flex flex-wrap gap-2">
        <a href="/api/export.csv" download className={ghostPill}>
          {t("stats.data.exportCsv")}
        </a>
        <a href="/api/export.json" download className={ghostPill}>
          {t("stats.data.exportJson")}
        </a>
        <a href="/api/export-materiel.csv" download className={ghostPill}>
          {t("stats.data.exportHardware")}
        </a>
      </div>
      <p className="mt-3 text-xs text-subtle-foreground">{t("stats.data.photosNote")}</p>

      <div className="mt-5 grid gap-5 border-t border-border pt-5 md:grid-cols-2">
        <div>
          <p className="text-[14px] font-semibold">{t("stats.data.legacyTitle")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("stats.data.legacyNote")}</p>
          <Link to="/importer/ancienne-appli" className={`${ghostPill} mt-3 text-primary-text`}>
            {t("stats.data.legacyLink")}
          </Link>
        </div>

        <div>
          <p className="text-[14px] font-semibold">{t("stats.data.restoreTitle")}</p>
          {empty ? (
            <>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("stats.data.restoreNote")}</p>
              <label className={`${ghostPill} mt-3 cursor-pointer ${busy ? "opacity-45" : ""}`}>
                {busy ? t("stats.data.importing") : t("stats.data.chooseFile")}
                <input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  className="hidden"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ""
                    if (!file) return
                    setBusy(true)
                    setError(null)
                    try {
                      const r = await upload<{ games: number; copies: number; totalCents: number }>("/api/import", file, file.name)
                      setDone(t("stats.data.imported", { games: t("stats.games", { count: r.games }), copies: t("stats.copies", { count: r.copies }), amount: euros(r.totalCents) }))
                      await reload()
                      onImported()
                    } catch (err) {
                      setError(errorMessage(err))
                    } finally {
                      setBusy(false)
                    }
                  }}
                />
              </label>
            </>
          ) : (
            <p className="mt-1 text-[13px] text-muted-foreground">{t("stats.data.onlyEmpty")}</p>
          )}
          <div className="mt-3 space-y-2">
            <ErrorNote message={error} />
            {done && <p className="rounded-[16px] bg-primary-tint px-4 py-2.5 text-sm text-primary-tint-foreground">{done}</p>}
          </div>
        </div>
      </div>
    </Card>
  )
}
