import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { BarcodeIcon } from "@/components/copy-form"
import { Cover } from "@/components/cover"
import { ErrorNote, inputClass } from "@/components/fields"
import { Scanner } from "@/components/scanner"
import { api, errorMessage, send, type BarcodeIdentify, type KnownBarcode } from "@/lib/api"
import { plural } from "@/lib/format"
import { applyFilters, type LibraryGame } from "@/lib/library"
import { useLibrary } from "@/lib/library-data"

type Scan = { ean: string; gameId: number | null }

/**
 * « Je l'ai déjà ? » en brocante : on scanne la boîte, la réponse vient de la bibliothèque et
 * des codes connus, tous deux en cache, donc aussi sans réseau. Un code inconnu se rattache
 * à un jeu possédé (il sera reconnu la fois suivante) ou mène à l'ajout.
 */
export default function Brocante() {
  const { games } = useLibrary()
  const [codes, setCodes] = useState<KnownBarcode[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)
  const [current, setCurrent] = useState<string | null>(null)
  const [history, setHistory] = useState<Scan[]>([])
  const [q, setQ] = useState("")
  // Session de scan à la maison (?enchainer=1) : après chaque boîte, le lecteur se rouvre.
  const chain = useSearchParams()[0].get("enchainer") === "1"
  const [lastMessage, setLastMessage] = useState<string | null>(null)
  const [identified, setIdentified] = useState<BarcodeIdentify | null>(null)
  const [identifying, setIdentifying] = useState(false)

  const loadCodes = () =>
    api<{ codes: KnownBarcode[] }>("/api/barcodes").then(
      (r) => setCodes(r.codes),
      (err) => setError(errorMessage(err)),
    )
  useEffect(() => {
    loadCodes()
  }, [])

  const gameById = (id: number | null) => (id === null ? null : (games?.find((g) => g.id === id) ?? null))
  const hit = current ? codes?.find((c) => c.ean === current) : undefined
  const owned = hit ? gameById(hit.game_id) : null

  const onScan = (ean: string) => {
    setScanning(false)
    setCurrent(ean)
    setQ("")
    setError(null)
    setIdentified(null)
    const known = codes?.find((c) => c.ean === ean)
    setHistory((h) => [{ ean, gameId: known?.game_id ?? null }, ...h.filter((x) => x.ean !== ean)].slice(0, 30))
    const knownGame = known ? gameById(known.game_id) : null
    if (knownGame && chain) {
      // Déjà connu : on le dit dans le lecteur, qui se rouvre aussitôt pour la boîte suivante.
      setLastMessage(`Déjà connu : ${knownGame.title} (${knownGame.platform})`)
      setScanning(true)
      return
    }
    // Code inconnu : ScanDex propose un jeu (réseau nécessaire ; hors ligne, on s'en passe).
    if (!known && navigator.onLine) {
      setIdentifying(true)
      api<BarcodeIdentify>(`/api/barcodes/${ean}/identify`)
        .then(setIdentified, () => {})
        .finally(() => setIdentifying(false))
    }
  }

  const link = async (game: LibraryGame) => {
    if (!current) return
    setError(null)
    try {
      await send("POST", "/api/barcodes", { ean: current, game_id: game.id, edition: null })
      await loadCodes()
      setHistory((h) => h.map((x) => (x.ean === current ? { ...x, gameId: game.id } : x)))
      setQ("")
      if (chain) {
        setLastMessage(`Rattaché : ${game.title} (${game.platform})`)
        setScanning(true)
      }
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  // Même recherche que la bibliothèque (« mw3 » y trouve Modern Warfare 3).
  const matches = useMemo(() => (q.trim().length < 2 || !games ? [] : applyFilters(games, {}, q).slice(0, 8).map((r) => r.game)), [q, games])

  const loading = !codes || !games

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      {scanning && <Scanner title={chain ? (lastMessage ?? "Scanne tes boîtes à la suite") : "Je l'ai déjà ?"} onDetected={onScan} onClose={() => setScanning(false)} />}

      <div>
        <h1 className="text-xl font-semibold">Brocante</h1>
        <p className="text-sm text-muted-foreground">
          Scanne une boîte : Fullset te dit si elle est déjà dans ta collection.{" "}
          <Link to="/codes-barres" className="text-primary underline">
            Tous mes codes
          </Link>
        </p>
      </div>

      <button
        onClick={() => setScanning(true)}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3.5 font-medium text-primary-foreground disabled:opacity-50"
      >
        <BarcodeIcon />
        {current ? "Scanner une autre boîte" : "Scanner une boîte"}
      </button>
      <ErrorNote message={error} />

      {current && !loading && (owned ? (
          <Owned game={owned} ean={current} edition={hit?.edition ?? null} />
        ) : (
          <Unknown ean={current} identifying={identifying} identified={identified} ownedGame={identified?.owned[0] ? gameById(identified.owned[0].id) : null} onLink={link} />
        ))}

      <section className="space-y-2">
        <label className="block text-sm text-muted-foreground" htmlFor="brocante-q">
          {current && !owned ? "Tu l'as déjà ? Cherche-le pour rattacher ce code" : "Ou cherche par titre dans ta collection"}
        </label>
        <input id="brocante-q" className={inputClass} placeholder="Titre" value={q} onChange={(e) => setQ(e.target.value)} />
        {q.trim().length >= 2 && matches.length === 0 && <p className="px-1 text-sm text-muted-foreground">Rien de tel dans ta collection.</p>}
        <ul className="divide-y divide-border rounded-lg bg-card">
          {matches.map((g) => (
            <li key={g.id} className="flex items-center gap-3 p-2.5">
              <Cover src={g.cover} title={g.title} className="w-10 shrink-0 rounded" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{g.title}</div>
                <div className="text-xs text-muted-foreground">
                  {g.platform} · {plural(g.copies.length, "exemplaire")}
                </div>
              </div>
              {current && !owned ? (
                <button onClick={() => link(g)} className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm">
                  C'est lui
                </button>
              ) : (
                <Link to={`/jeux/${g.id}`} className="shrink-0 text-sm text-primary">
                  Fiche
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      {history.length > 1 && (
        <section>
          <h2 className="mb-1.5 text-sm font-medium text-muted-foreground">Scans de la séance</h2>
          <ul className="divide-y divide-border rounded-lg bg-card text-sm">
            {history.map((s) => {
              const g = gameById(s.gameId)
              return (
                <li key={s.ean}>
                  <button onClick={() => setCurrent(s.ean)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
                    <span className="min-w-0 truncate">{g ? `${g.title} (${g.platform})` : "Code inconnu"}</span>
                    <span className={`shrink-0 text-xs ${g ? "text-primary" : "text-muted-foreground"}`}>{g ? "déjà" : s.ean}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function Owned({ game, ean, edition }: { game: LibraryGame; ean: string; edition: string | null }) {
  return (
    <section className="rounded-lg border-2 border-primary bg-primary/10 p-4" aria-live="polite">
      <p className="text-lg font-semibold">Déjà dans ta collection</p>
      <div className="mt-3 flex gap-3">
        <Cover src={game.cover} title={game.title} className="w-20 shrink-0 rounded" />
        <div className="min-w-0 space-y-1">
          <div className="leading-tight font-medium">{game.title}</div>
          <div className="text-sm text-muted-foreground">{game.platform}</div>
          {edition && <div className="text-xs text-muted-foreground">Code connu pour l'édition {edition}</div>}
          <ul className="space-y-0.5 pt-1 text-sm">
            {game.copies.map((c) => (
              <li key={c.id}>
                {[c.edition ?? "Standard", c.content, c.condition_game].filter(Boolean).join(" · ")}
                {c.quantity > 1 && ` (×${c.quantity})`}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/jeux/${game.id}`} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
          Voir la fiche
        </Link>
        <Link to={`/jeux/${game.id}/ajouter?ean=${ean}`} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
          J'en prends un autre
        </Link>
      </div>
    </section>
  )
}

function Unknown({
  ean,
  identifying,
  identified,
  ownedGame,
  onLink,
}: {
  ean: string
  identifying: boolean
  identified: BarcodeIdentify | null
  ownedGame: LibraryGame | null
  onLink: (game: LibraryGame) => void
}) {
  const s = identified?.suggestion
  if (identifying) {
    return (
      <section className="rounded-lg bg-card p-4" aria-live="polite" aria-busy="true">
        <p className="text-lg font-semibold">Code {ean}</p>
        <p className="mt-1 text-sm text-muted-foreground">Je cherche de quel jeu il s'agit…</p>
      </section>
    )
  }
  // ScanDex se trompe parfois (mesuré : 3 erreurs sur 18 codes trouvés) : c'est une question, pas une réponse.
  if (s && ownedGame) {
    return (
      <section className="rounded-lg border-2 border-primary bg-primary/10 p-4" aria-live="polite">
        <p className="text-lg font-semibold">Sans doute déjà dans ta collection</p>
        <p className="mt-1 text-sm">
          Ce code serait <strong>{s.name}</strong> ({s.platform}) d'après ScanDex, et tu as ce jeu sur {ownedGame.platform}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => onLink(ownedGame)} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Oui, c'est mon jeu : retenir le code
          </button>
          <Link to={`/jeux/${ownedGame.id}`} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            Voir la fiche
          </Link>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Code {ean}. Si ce n'est pas le bon jeu, cherche-le ci-dessous.</p>
      </section>
    )
  }
  const add = s
    ? `/ajouter?ean=${ean}&igdb=${s.igdb_id}&titre=${encodeURIComponent(s.name)}&plateforme=${encodeURIComponent(s.platform)}`
    : `/ajouter?ean=${ean}`
  return (
    <section className="rounded-lg bg-card p-4" aria-live="polite">
      <p className="text-lg font-semibold">Pas dans ta collection</p>
      {s ? (
        <p className="mt-1 text-sm">
          D'après ScanDex, c'est <strong>{s.name}</strong> ({s.platform}). À vérifier sur la boîte.
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Code {ean}, jamais vu{identified?.configured ? ", ni par ScanDex" : ""}. Si tu possèdes ce jeu sans que son code soit connu, rattache-le ci-dessous.
        </p>
      )}
      <Link to={add} className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        {s ? `Je l'achète : ajouter ${s.name}` : "Je l'achète : l'ajouter"}
      </Link>
    </section>
  )
}
