import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"

import { BarList, SpendingColumns } from "@/components/charts"
import { ErrorNote } from "@/components/fields"
import { api, errorMessage, upload, type Breakdown, type Stats as StatsData } from "@/lib/api"
import { euros, plural } from "@/lib/format"
import { useLibrary } from "@/lib/library-data"

export default function Stats() {
  const [s, setS] = useState<StatsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = () => api<StatsData>("/api/stats").then(setS, (err) => setError(errorMessage(err)))
  useEffect(() => {
    load()
  }, [])

  if (error) return <p className="py-16 text-center text-destructive">{error}</p>
  if (!s) return <p className="py-16 text-center text-muted-foreground">Chargement…</p>

  const spent = (r: { spentCents: number }) => r.spentCents
  const copies = (r: { count: number }) => plural(r.count, "exemplaire")
  const countRow = (b: Breakdown[number]) => String(b.count)

  return (
    <main className="space-y-5 pb-10">
      <section className="rounded-lg bg-card p-5">
        <div className="text-sm text-muted-foreground">Total dépensé</div>
        <div className="mt-1 text-5xl font-semibold">{euros(s.spentCents)}</div>
        <div className="mt-3 text-sm text-muted-foreground">
          {plural(s.games, "jeu", "jeux")} · {plural(s.copies, "exemplaire")}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          Physique {euros(s.spentPhysicalCents)} ({s.physical}) · Dématérialisé {euros(s.spentDigitalCents)} ({s.digital})
        </div>
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        <section className="rounded-lg bg-card p-5">
          <div className="text-sm text-muted-foreground">Valeur estimée</div>
          {s.value.estimatedCopies === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">Aucun exemplaire estimé : « Estimer » sur la fiche d'un jeu.</p>
          ) : (
            <>
              <div className="mt-1 text-3xl font-semibold">{euros(s.value.estimatedCents)}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {s.value.estimatedCopies} exemplaire{s.value.estimatedCopies > 1 ? "s" : ""} estimé{s.value.estimatedCopies > 1 ? "s" : ""} sur {s.copies}, payé
                {s.value.estimatedCopies > 1 ? "s" : ""} {euros(s.value.costOfEstimatedCents)}
              </div>
            </>
          )}
        </section>
        <Link to="/souhaits" className="rounded-lg bg-card p-5 hover:bg-muted">
          <div className="text-sm text-muted-foreground">Liste de souhaits</div>
          <div className="mt-1 text-3xl font-semibold">{plural(s.wishlist.count, "jeu", "jeux")}</div>
          {s.wishlist.targetCents > 0 && <div className="mt-2 text-sm text-muted-foreground">Budget cible {euros(s.wishlist.targetCents)}</div>}
        </Link>
        <Link to="/consoles" className="rounded-lg bg-card p-5 hover:bg-muted sm:col-span-2">
          <div className="text-sm text-muted-foreground">Consoles et matériel</div>
          {s.hardware.count === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">Rien pour l'instant : ajoute tes consoles depuis la bibliothèque.</p>
          ) : (
            <>
              <div className="mt-1 text-3xl font-semibold">{euros(s.hardware.spentCents)}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {s.hardware.byKind.map((k) => `${k.count} ${k.label.toLowerCase()}${k.count > 1 ? "s" : ""}`).join(" · ")}
                {s.hardware.value.estimatedItems > 0 && ` · valeur estimée ${euros(s.hardware.value.estimatedCents)}`}
              </div>
            </>
          )}
        </Link>
      </div>

      <Card
        title="Dépenses dans le temps"
        note={
          s.undated.count > 0
            ? `Selon la date d'achat. ${plural(s.undated.count, "exemplaire")} sans date (${euros(s.undated.spentCents)}) n'y figure${s.undated.count > 1 ? "nt" : ""} pas.`
            : "Selon la date d'achat."
        }
      >
        <SpendingColumns data={s.byMonth} />
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Dépensé par plateforme">
          <BarList
            rows={s.byPlatform.map((p) => ({ ...p, label: p.platform }))}
            value={spent}
            format={(r) => euros(r.spentCents)}
            detail={(r) => `${plural(r.games, "jeu", "jeux")} · ${plural(r.copies, "exemplaire")}`}
          />
        </Card>
        <Card title="Dépensé par lieu d'achat">
          <BarList rows={s.byPlace} value={spent} format={(r) => euros(r.spentCents)} detail={copies} />
        </Card>
        <Card title="Exemplaires par contenu">
          <BarList rows={s.byContent} value={(r) => r.count} format={countRow} detail={(r) => euros(r.spentCents)} />
        </Card>
        <Card title="Exemplaires par statut">
          <BarList rows={s.byStatus} value={(r) => r.count} format={countRow} detail={(r) => euros(r.spentCents)} />
        </Card>
        <Card title="État du jeu" note="Exemplaires physiques.">
          <BarList rows={s.conditions.game} value={(r) => r.count} format={countRow} />
        </Card>
        <Card title="État de la boîte" note="Exemplaires physiques.">
          <BarList rows={s.conditions.box} value={(r) => r.count} format={countRow} />
        </Card>
        <Card title="État de la notice" note="Exemplaires physiques.">
          <BarList rows={s.conditions.manual} value={(r) => r.count} format={countRow} />
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
  const { reload } = useLibrary()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const link = "rounded-lg border border-border bg-background px-3 py-2 text-sm hover:border-muted-foreground"

  return (
    <Card title="Vos données" note="Toute la collection, pour qu'elle ne soit jamais prisonnière de l'application.">
      <div className="flex flex-wrap gap-2">
        <a href="/api/export.csv" download className={link}>
          Exporter en CSV (Excel)
        </a>
        <a href="/api/export.json" download className={link}>
          Exporter en JSON
        </a>
        <a href="/api/export-materiel.csv" download className={link}>
          Exporter le matériel (CSV)
        </a>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Les photos et les jaquettes photographiées ne sont pas dans l'export : elles restent dans le répertoire de données, couvert par la sauvegarde de la nuit.
      </p>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-medium">Depuis l'ancienne application</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Son export CSV : rapprochement IGDB, validation ligne par ligne, et les exemplaires déjà présents sont reconnus.
        </p>
        <Link to="/importer/ancienne-appli" className={`${link} mt-3 inline-block`}>
          Importer l'export de l'ancienne application
        </Link>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-medium">Restaurer un export Fullset</h3>
        {empty ? (
          <>
            <p className="mt-1 text-xs text-muted-foreground">Un export Fullset ou GameCenter (CSV ou JSON), ou le collection.json de départ.</p>
            <label className={`${link} mt-3 inline-block cursor-pointer ${busy ? "opacity-50" : ""}`}>
              {busy ? "Import en cours…" : "Choisir un fichier"}
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
                    setDone(`${plural(r.games, "jeu", "jeux")}, ${plural(r.copies, "exemplaire")}, ${euros(r.totalCents)} importés. Les jaquettes se téléchargent en arrière-plan.`)
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
            Possible seulement dans une collection vide : réimporter par-dessus doublerait tout, et rien ne permet de rapprocher les exemplaires de façon sûre.
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
