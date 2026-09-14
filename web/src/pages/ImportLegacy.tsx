import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { Cover } from "@/components/cover"
import { ErrorNote, KeyedChips, inputClass } from "@/components/fields"
import { IgdbSearch } from "@/components/igdb-search"
import { errorMessage, send, upload, type LegacyReport, type LegacyRow } from "@/lib/api"
import { euros, formatDate } from "@/lib/format"
import { useLibrary } from "@/lib/library-data"

const SKIP = "skip"
const MANUAL = "manual"

// Titre et note : `importLegacy.sections.<status>` des fichiers de langue.
const SECTIONS: Array<{ status: LegacyRow["status"]; open: boolean }> = [
  { status: "check", open: true },
  { status: "none", open: true },
  { status: "sure", open: true },
  { status: "duplicate", open: false },
]

const defaultChoice = (r: LegacyRow) => (r.status === "duplicate" ? SKIP : r.proposed !== null ? `igdb:${r.proposed}` : MANUAL)

/**
 * Import de l'export de l'ancienne application : l'analyse propose, l'utilisateur tranche ligne par ligne,
 * puis seules les lignes retenues sont écrites.
 */
export default function ImportLegacy() {
  const { t } = useTranslation()
  const { reload } = useLibrary()
  const [rows, setRows] = useState<LegacyRow[] | null>(null)
  const [igdbReady, setIgdbReady] = useState(true)
  const [choices, setChoices] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<"analyse" | "import" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<LegacyReport | null>(null)

  const analyze = async (file: File) => {
    setBusy("analyse")
    setError(null)
    setReport(null)
    try {
      const res = await upload<{ igdb: boolean; rows: LegacyRow[] }>("/api/import/legacy/analyze", file, file.name)
      setRows(res.rows)
      setIgdbReady(res.igdb)
      setChoices(Object.fromEntries(res.rows.map((r) => [r.index, defaultChoice(r)])))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const retained = (rows ?? []).filter((r) => choices[r.index] !== SKIP)

  const commit = async () => {
    setBusy("import")
    setError(null)
    try {
      const payload = retained.map((r) => {
        const c = choices[r.index]
        return { title: r.title, platform: r.platform, copy: r.copy, estimatedCents: r.estimatedCents, igdb_id: c.startsWith("igdb:") ? Number(c.slice(5)) : null }
      })
      setReport(await send<LegacyReport>("POST", "/api/import/legacy/commit", { rows: payload }))
      setRows(null)
      await reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const pickOther = (row: LegacyRow, c: LegacyRow["candidates"][number]) => {
    setRows((list) => list!.map((r) => (r.index === row.index && !r.candidates.some((x) => x.igdb_id === c.igdb_id) ? { ...r, candidates: [c, ...r.candidates] } : r)))
    setChoices((ch) => ({ ...ch, [row.index]: `igdb:${c.igdb_id}` }))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-28">
      <div>
        <Link to="/stats" className="text-sm text-muted-foreground hover:text-foreground">
          {t("importLegacy.back")}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{t("importLegacy.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("importLegacy.intro")}
        </p>
      </div>

      <ErrorNote message={error} />

      {report && (
        <div className="rounded-lg bg-card p-4">
          <p className="font-medium">
            {t("importLegacy.reportCopies", { count: report.copies })}, {t("importLegacy.reportGames", { count: report.gamesCreated })}
            {report.valuations > 0 && `, ${t("importLegacy.reportValuations", { count: report.valuations })}`}.
          </p>
          <Link to="/" className="mt-2 inline-block text-sm text-primary underline">
            {t("importLegacy.seeLibrary")}
          </Link>
        </div>
      )}

      {!rows && (
        <label className={`inline-block cursor-pointer rounded-lg border border-border bg-card px-4 py-2.5 text-sm ${busy ? "opacity-50" : ""}`}>
          {busy === "analyse" ? t("importLegacy.analysing") : t("importLegacy.chooseCsv")}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={busy !== null}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) analyze(file)
            }}
          />
        </label>
      )}

      {rows && (
        <>
          {!igdbReady && <ErrorNote message={t("importLegacy.noIgdb")} />}
          <p className="text-sm text-muted-foreground">
            {t("importLegacy.linesRead", { count: rows.length })}{" "}
            {SECTIONS.map((s) => t(`importLegacy.sections.${s.status}.summary`, { n: rows.filter((r) => r.status === s.status).length })).join(" · ")}
          </p>
          {SECTIONS.map((s) => {
            const list = rows.filter((r) => r.status === s.status)
            if (!list.length) return null
            return (
              <details key={s.status} open={s.open} className="group">
                <summary className="cursor-pointer list-none">
                  <span className="font-semibold">
                    {t(`importLegacy.sections.${s.status}.title`)} ({list.length})
                  </span>
                  <span className="block text-xs text-muted-foreground">{t(`importLegacy.sections.${s.status}.note`)}</span>
                </summary>
                <ul className="mt-3 space-y-2">
                  {list.map((r) => (
                    <RowCard key={r.index} row={r} choice={choices[r.index]} onChoice={(c) => setChoices((ch) => ({ ...ch, [r.index]: c }))} onPickOther={(c) => pickOther(r, c)} />
                  ))}
                </ul>
              </details>
            )
          })}

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
            <div className="mx-auto flex max-w-2xl gap-3">
              <button onClick={() => setRows(null)} className="rounded-lg border border-border px-4 text-sm">
                {t("common.cancel")}
              </button>
              <button
                onClick={commit}
                disabled={busy !== null || retained.length === 0}
                className="flex-1 rounded-lg bg-primary py-3 font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy === "import" ? t("importLegacy.importing") : retained.length === 0 ? t("importLegacy.nothing") : t("importLegacy.importCopies", { count: retained.length })}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function RowCard({
  row: r,
  choice,
  onChoice,
  onPickOther,
}: {
  row: LegacyRow
  choice: string
  onChoice: (c: string) => void
  onPickOther: (c: LegacyRow["candidates"][number]) => void
}) {
  const { t } = useTranslation()
  const [searching, setSearching] = useState(false)
  const chosen = choice.startsWith("igdb:") ? r.candidates.find((c) => `igdb:${c.igdb_id}` === choice) : undefined
  const price = r.copy.price === null ? null : euros(Math.round(Number(r.copy.price.replace(",", ".")) * 100))
  const facts = [r.platform, price, formatDate(r.copy.purchase_date), r.copy.purchase_place].filter(Boolean).join(" · ")

  return (
    <li className={`rounded-lg bg-card p-3 ${choice === SKIP ? "opacity-60" : ""}`}>
      <div className="flex gap-3">
        <Cover src={chosen?.cover ?? null} title={chosen?.name ?? r.title} className="aspect-[3/4] w-12 shrink-0 rounded" />
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-tight">{r.title}</div>
          <div className="text-xs text-muted-foreground">{facts}</div>
          <div className="mt-2 text-sm">
            <KeyedChips
              label={t("importLegacy.decisionFor", { title: r.title })}
              value={choice}
              onChange={onChoice}
              choices={[
                ...r.candidates.map((c) => ({ key: `igdb:${c.igdb_id}`, label: `${c.name}${c.year ? ` (${c.year})` : ""} — ${c.platforms.slice(0, 3).join(", ")}` })),
                { key: MANUAL, label: t("importLegacy.withoutIgdb", { title: r.title }) },
                { key: SKIP, label: r.status === "duplicate" ? t("importLegacy.duplicateSkip") : t("importLegacy.skip") },
              ]}
            />
          </div>
          {r.status !== "duplicate" && !searching && (
            <button onClick={() => setSearching(true)} className="mt-1 text-xs text-muted-foreground underline">
              {t("importLegacy.searchOther")}
            </button>
          )}
          {searching && (
            <div className="mt-2">
              <IgdbSearch
                initialQuery={r.title}
                onPick={(c) => {
                  onPickOther(c)
                  setSearching(false)
                }}
              />
            </div>
          )}
          {r.warnings.length > 0 && <p className="mt-1 text-xs text-primary">{t("importLegacy.warningsKept", { warnings: r.warnings.join(" · ") })}</p>}
        </div>
      </div>
    </li>
  )
}
