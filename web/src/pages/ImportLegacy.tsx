import { ArrowLeft, ChevronDown } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { Cover } from "@/components/cover"
import { ErrorNote, KeyedChips } from "@/components/fields"
import { IgdbSearch } from "@/components/igdb-search"
import { errorMessage, send, upload, type LegacyReport, type LegacyRow } from "@/lib/api"
import { euros, formatDate } from "@/lib/format"
import { useLibrary } from "@/lib/library-data"

const SKIP = "skip"
const MANUAL = "manual"

const ICON = { strokeWidth: 2.75 } as const
const ghostButton = "inline-flex min-h-11 items-center rounded-full border border-border-strong bg-card px-5 text-sm font-semibold transition-colors duration-150 hover:bg-foreground/[.07]"

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
    <div className={`mx-auto max-w-2xl space-y-5 ${rows ? "pb-28" : "pb-4"}`}>
      <div>
        <Link to="/stats" className="inline-flex items-center gap-2.5 text-[13px] text-muted-foreground hover:text-foreground">
          <span className="grid size-10 place-items-center rounded-full bg-card text-foreground">
            <ArrowLeft size={20} {...ICON} aria-hidden="true" />
          </span>
          {t("layout.stats")}
        </Link>
        <h1 className="mt-4 text-[29px]">{t("importLegacy.title")}</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">{t("importLegacy.intro")}</p>
      </div>

      <ErrorNote message={error} />

      {report && (
        <div className="rounded-card bg-primary-tint p-4 text-primary-tint-foreground">
          <p className="font-semibold">
            {t("importLegacy.reportCopies", { count: report.copies })}, {t("importLegacy.reportGames", { count: report.gamesCreated })}
            {report.valuations > 0 && `, ${t("importLegacy.reportValuations", { count: report.valuations })}`}.
          </p>
          <Link to="/" className="mt-2 inline-block text-sm font-semibold underline underline-offset-2">
            {t("importLegacy.seeLibrary")}
          </Link>
        </div>
      )}

      {!rows && (
        <label className={`${ghostButton} cursor-pointer ${busy ? "opacity-45" : ""}`}>
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
          <p className="text-[13px] text-muted-foreground">
            {t("importLegacy.linesRead", { count: rows.length })}{" "}
            {SECTIONS.map((s) => t(`importLegacy.sections.${s.status}.summary`, { n: rows.filter((r) => r.status === s.status).length })).join(" · ")}
          </p>
          {SECTIONS.map((s) => {
            const list = rows.filter((r) => r.status === s.status)
            if (!list.length) return null
            return (
              <details key={s.status} open={s.open} className="group">
                <summary className="flex cursor-pointer list-none items-start gap-2 px-0.5 pb-2 [&::-webkit-details-marker]:hidden">
                  <ChevronDown size={14} {...ICON} aria-hidden="true" className="mt-1.5 shrink-0 -rotate-90 transition-transform duration-150 group-open:rotate-0" />
                  <span className="min-w-0">
                    <span className="font-heading text-[18px]">
                      {t(`importLegacy.sections.${s.status}.title`)} <span className="num font-sans text-[13px] text-muted-foreground">· {list.length}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground">{t(`importLegacy.sections.${s.status}.note`)}</span>
                  </span>
                </summary>
                <ul className="mt-2 space-y-3">
                  {list.map((r) => (
                    <RowCard key={r.index} row={r} choice={choices[r.index]} onChoice={(c) => setChoices((ch) => ({ ...ch, [r.index]: c }))} onPickOther={(c) => pickOther(r, c)} />
                  ))}
                </ul>
              </details>
            )
          })}

          {/* Au-dessus de la barre d'onglets (≤ 1023 px) ; à droite du tiroir au-delà. */}
          <div className="fixed inset-x-0 bottom-[calc(78px+env(safe-area-inset-bottom))] z-20 bg-gradient-to-t from-background from-70% to-transparent px-4 pt-8 pb-3 lg:bottom-0 lg:left-[280px] lg:px-8 lg:pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex max-w-2xl gap-2.5">
              <button onClick={() => setRows(null)} className={`${ghostButton} min-h-[48px]`}>
                {t("common.cancel")}
              </button>
              <button
                onClick={commit}
                disabled={busy !== null || retained.length === 0}
                className="min-h-[48px] flex-1 rounded-full bg-primary px-5 font-heading text-[16px] text-primary-foreground shadow-md transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[.98] disabled:opacity-45"
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
    <li className={`rounded-card bg-card p-4 transition-opacity duration-150 ${choice === SKIP ? "opacity-60" : ""}`}>
      <div className="flex gap-3.5">
        <Cover src={chosen?.cover ?? null} title={chosen?.name ?? r.title} platform={r.platform} size="thumb" className="w-12 shrink-0 self-start" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] leading-tight font-semibold">{r.title}</div>
          <div className="num mt-0.5 text-xs text-muted-foreground">{facts}</div>
          <div className="mt-3 text-sm">
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
            <button onClick={() => setSearching(true)} className="mt-2 min-h-9 text-[13px] font-semibold text-primary-text underline underline-offset-2">
              {t("importLegacy.searchOther")}
            </button>
          )}
          {searching && (
            <div className="mt-3">
              <IgdbSearch
                initialQuery={r.title}
                onPick={(c) => {
                  onPickOther(c)
                  setSearching(false)
                }}
              />
            </div>
          )}
          {r.warnings.length > 0 && <p className="mt-2 text-xs text-primary-text">{t("importLegacy.warningsKept", { warnings: r.warnings.join(" · ") })}</p>}
        </div>
      </div>
    </li>
  )
}
