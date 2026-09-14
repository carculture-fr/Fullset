import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { BarList, SpendingColumns } from "@/components/charts"
import { ErrorNote } from "@/components/fields"
import { api, errorMessage, upload, type Breakdown, type Stats as StatsData } from "@/lib/api"
import { euros } from "@/lib/format"
import { valueLabel } from "@/lib/i18n"
import { useLibrary } from "@/lib/library-data"

export default function Stats() {
  const { t } = useTranslation()
  const [s, setS] = useState<StatsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => api<StatsData>("/api/stats").then(setS, (err) => setError(errorMessage(err)))
  useEffect(() => {
    load()
  }, [])

  if (error) return <p className="py-16 text-center text-destructive">{error}</p>
  if (!s) return <p className="py-16 text-center text-muted-foreground">{t("stats.loading")}</p>

  const spent = (r: { spentCents: number }) => r.spentCents
  const copies = (r: { count: number }) => t("stats.copies", { count: r.count })
  const gamesAndCopies = (games: number, n: number) => `${t("stats.games", { count: games })} · ${t("stats.copies", { count: n })}`
  const countRow = (b: Breakdown[number]) => String(b.count)

  return (
    <main className="space-y-5 pb-10">
      <section className="rounded-lg bg-card p-5">
        <div className="text-sm text-muted-foreground">{t("stats.totalSpent")}</div>
        <div className="mt-1 text-5xl font-semibold">{euros(s.spentCents)}</div>
        <div className="mt-3 text-sm text-muted-foreground">
          {gamesAndCopies(s.games, s.copies)}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {t("stats.bySupport", { physical: euros(s.spentPhysicalCents), physicalCount: s.physical, digital: euros(s.spentDigitalCents), digitalCount: s.digital })}
        </div>
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        <section className="rounded-lg bg-card p-5">
          <div className="text-sm text-muted-foreground">{t("stats.estimatedValue")}</div>
          {s.value.estimatedCopies === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{t("stats.noEstimate")}</p>
          ) : (
            <>
              <div className="mt-1 text-3xl font-semibold">{euros(s.value.estimatedCents)}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {t("stats.estimatedCopies", { count: s.value.estimatedCopies, total: s.copies, cost: euros(s.value.costOfEstimatedCents) })}
              </div>
            </>
          )}
        </section>
        <Link to="/souhaits" className="rounded-lg bg-card p-5 hover:bg-muted">
          <div className="text-sm text-muted-foreground">{t("stats.wishlist")}</div>
          <div className="mt-1 text-3xl font-semibold">{t("stats.games", { count: s.wishlist.count })}</div>
          {s.wishlist.targetCents > 0 && <div className="mt-2 text-sm text-muted-foreground">{t("stats.wishlistBudget", { amount: euros(s.wishlist.targetCents) })}</div>}
        </Link>
        <Link to="/consoles" className="rounded-lg bg-card p-5 hover:bg-muted sm:col-span-2">
          <div className="text-sm text-muted-foreground">{t("stats.hardware")}</div>
          {s.hardware.count === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{t("stats.noHardware")}</p>
          ) : (
            <>
              <div className="mt-1 text-3xl font-semibold">{euros(s.hardware.spentCents)}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {s.hardware.byKind
                  .map((k) => t("stats.kindCount", { count: k.count, kind: k.count > 1 ? valueLabel("hwKindPlural", k.label) : valueLabel("hwKind", k.label).toLowerCase() }))
                  .join(" · ")}
                {s.hardware.value.estimatedItems > 0 && ` · ${t("stats.hardwareValue", { amount: euros(s.hardware.value.estimatedCents) })}`}
              </div>
            </>
          )}
        </Link>
      </div>

      <Card
        title={t("stats.overTime")}
        note={s.undated.count > 0 ? t("stats.undated", { count: s.undated.count, amount: euros(s.undated.spentCents) }) : t("stats.byPurchaseDate")}
      >
        <SpendingColumns data={s.byMonth} />
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title={t("stats.byPlatform")}>
          <BarList
            rows={s.byPlatform.map((p) => ({ ...p, label: p.platform }))}
            value={spent}
            format={(r) => euros(r.spentCents)}
            detail={(r) => gamesAndCopies(r.games, r.copies)}
          />
        </Card>
        <Card title={t("stats.byPlace")}>
          <BarList rows={s.byPlace} value={spent} format={(r) => euros(r.spentCents)} detail={copies} />
        </Card>
        <Card title={t("stats.byContent")}>
          <BarList group="content" rows={s.byContent} value={(r) => r.count} format={countRow} detail={(r) => euros(r.spentCents)} />
        </Card>
        <Card title={t("stats.byStatus")}>
          <BarList group="playStatus" rows={s.byStatus} value={(r) => r.count} format={countRow} detail={(r) => euros(r.spentCents)} />
        </Card>
        <Card title={t("stats.conditionGame")} note={t("stats.physicalOnly")}>
          <BarList group="condition" rows={s.conditions.game} value={(r) => r.count} format={countRow} />
        </Card>
        <Card title={t("stats.conditionBox")} note={t("stats.physicalOnly")}>
          <BarList group="condition" rows={s.conditions.box} value={(r) => r.count} format={countRow} />
        </Card>
        <Card title={t("stats.conditionManual")} note={t("stats.physicalOnly")}>
          <BarList group="condition" rows={s.conditions.manual} value={(r) => r.count} format={countRow} />
        </Card>
      </div>

      <DataTransfer empty={s.copies === 0} onImported={load} />
    </main>
  )
}

function Card({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function DataTransfer({ empty, onImported }: { empty: boolean; onImported: () => void }) {
  const { t } = useTranslation()
  const { reload } = useLibrary()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const link = "rounded-lg border border-border bg-background px-3 py-2 text-sm hover:border-muted-foreground"

  return (
    <Card title={t("stats.data.title")} note={t("stats.data.note")}>
      <div className="flex flex-wrap gap-2">
        <a href="/api/export.csv" download className={link}>
          {t("stats.data.exportCsv")}
        </a>
        <a href="/api/export.json" download className={link}>
          {t("stats.data.exportJson")}
        </a>
        <a href="/api/export-materiel.csv" download className={link}>
          {t("stats.data.exportHardware")}
        </a>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("stats.data.photosNote")}
      </p>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-medium">{t("stats.data.legacyTitle")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("stats.data.legacyNote")}
        </p>
        <Link to="/importer/ancienne-appli" className={`${link} mt-3 inline-block`}>
          {t("stats.data.legacyLink")}
        </Link>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-medium">{t("stats.data.restoreTitle")}</h3>
        {empty ? (
          <>
            <p className="mt-1 text-xs text-muted-foreground">{t("stats.data.restoreNote")}</p>
            <label className={`${link} mt-3 inline-block cursor-pointer ${busy ? "opacity-50" : ""}`}>
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
          <p className="mt-1 text-xs text-muted-foreground">
            {t("stats.data.onlyEmpty")}
          </p>
        )}
        <div className="mt-3 space-y-2">
          <ErrorNote message={error} />
          {done && <p className="rounded-lg bg-muted px-3 py-2 text-sm">{done}</p>}
        </div>
      </div>
    </Card>
  )
}
