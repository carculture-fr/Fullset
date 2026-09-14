import { useState } from "react"
import { Link } from "react-router-dom"

import { Cover } from "@/components/cover"
import { ErrorNote, KeyedChips, inputClass } from "@/components/fields"
import { IgdbSearch } from "@/components/igdb-search"
import { errorMessage, send, upload, type LegacyReport, type LegacyRow } from "@/lib/api"
import { euros, frDate, plural } from "@/lib/format"
import { useLibrary } from "@/lib/library-data"

const SKIP = "skip"
const MANUAL = "manual"

const SECTIONS: Array<{ status: LegacyRow["status"]; title: string; note: string; open: boolean }> = [
  { status: "check", title: "À vérifier", note: "IGDB propose un jeu, mais le titre ne correspond pas exactement : choisis le bon.", open: true },
  { status: "none", title: "Introuvables sur IGDB", note: "Importés sans fiche IGDB, sauf si tu en choisis une.", open: true },
  { status: "sure", title: "Rapprochés automatiquement", note: "Titre exact sur la bonne plateforme.", open: true },
  { status: "duplicate", title: "Déjà dans la collection", note: "Même titre saisi, plateforme, date et prix : ignorés par défaut.", open: false },
]

const defaultChoice = (r: LegacyRow) => (r.status === "duplicate" ? SKIP : r.proposed !== null ? `igdb:${r.proposed}` : MANUAL)

/**
 * Import de l'export de l'ancienne application : l'analyse propose, l'utilisateur tranche ligne par ligne,
 * puis seules les lignes retenues sont écrites.
 */
export default function ImportLegacy() {
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
          ← Statistiques
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Importer depuis l'ancienne application</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Son export CSV, en colonnes anglaises ou françaises. Rien n'est écrit avant ta validation ; les exemplaires déjà présents sont reconnus et ignorés.
        </p>
      </div>

      <ErrorNote message={error} />

      {report && (
        <div className="rounded-lg bg-card p-4">
          <p className="font-medium">
            {plural(report.copies, "exemplaire importé", "exemplaires importés")}, {plural(report.gamesCreated, "jeu créé", "jeux créés")}
            {report.valuations > 0 && `, ${plural(report.valuations, "estimation reprise", "estimations reprises")}`}.
          </p>
          <Link to="/" className="mt-2 inline-block text-sm text-primary underline">
            Voir la bibliothèque
          </Link>
        </div>
      )}

      {!rows && (
        <label className={`inline-block cursor-pointer rounded-lg border border-border bg-card px-4 py-2.5 text-sm ${busy ? "opacity-50" : ""}`}>
          {busy === "analyse" ? "Analyse en cours (recherche IGDB, environ une seconde par jeu nouveau)…" : "Choisir le fichier CSV"}
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
          {!igdbReady && <ErrorNote message="IGDB n'est pas configuré : les jeux nouveaux seront importés sans fiche IGDB." />}
          <p className="text-sm text-muted-foreground">
            {plural(rows.length, "ligne")} lue{rows.length > 1 ? "s" : ""} :{" "}
            {SECTIONS.map((s) => `${rows.filter((r) => r.status === s.status).length} ${s.title.toLowerCase()}`).join(" · ")}
          </p>
          {SECTIONS.map((s) => {
            const list = rows.filter((r) => r.status === s.status)
            if (!list.length) return null
            return (
              <details key={s.status} open={s.open} className="group">
                <summary className="cursor-pointer list-none">
                  <span className="font-semibold">
                    {s.title} ({list.length})
                  </span>
                  <span className="block text-xs text-muted-foreground">{s.note}</span>
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
                Annuler
              </button>
              <button
                onClick={commit}
                disabled={busy !== null || retained.length === 0}
                className="flex-1 rounded-lg bg-primary py-3 font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy === "import" ? "Import en cours…" : retained.length === 0 ? "Rien à importer" : `Importer ${plural(retained.length, "exemplaire")}`}
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
  const [searching, setSearching] = useState(false)
  const chosen = choice.startsWith("igdb:") ? r.candidates.find((c) => `igdb:${c.igdb_id}` === choice) : undefined
  const price = r.copy.price === null ? null : euros(Math.round(Number(r.copy.price.replace(",", ".")) * 100))
  const facts = [r.platform, price, frDate(r.copy.purchase_date), r.copy.purchase_place].filter(Boolean).join(" · ")

  return (
    <li className={`rounded-lg bg-card p-3 ${choice === SKIP ? "opacity-60" : ""}`}>
      <div className="flex gap-3">
        <Cover src={chosen?.cover ?? null} title={chosen?.name ?? r.title} className="aspect-[3/4] w-12 shrink-0 rounded" />
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-tight">{r.title}</div>
          <div className="text-xs text-muted-foreground">{facts}</div>
          <div className="mt-2 text-sm">
            <KeyedChips
              label={`Décision pour ${r.title}`}
              value={choice}
              onChange={onChoice}
              choices={[
                ...r.candidates.map((c) => ({ key: `igdb:${c.igdb_id}`, label: `${c.name}${c.year ? ` (${c.year})` : ""} — ${c.platforms.slice(0, 3).join(", ")}` })),
                { key: MANUAL, label: `Sans IGDB : « ${r.title} »` },
                { key: SKIP, label: r.status === "duplicate" ? "Déjà présent : ne pas importer" : "Ne pas importer" },
              ]}
            />
          </div>
          {r.status !== "duplicate" && !searching && (
            <button onClick={() => setSearching(true)} className="mt-1 text-xs text-muted-foreground underline">
              Chercher un autre jeu sur IGDB
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
          {r.warnings.length > 0 && <p className="mt-1 text-xs text-primary">{r.warnings.join(" · ")} — repris dans le commentaire.</p>}
        </div>
      </div>
    </li>
  )
}
