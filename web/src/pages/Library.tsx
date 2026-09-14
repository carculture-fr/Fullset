import { useMemo, useState, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { BarcodeIcon } from "@/components/copy-form"
import { Cover } from "@/components/cover"
import { KeyedChips } from "@/components/fields"
import { FilterPanel } from "@/components/filter-panel"
import { LibraryTabs } from "@/components/library-tabs"
import { euros, frDate, plural } from "@/lib/format"
import {
  FACETS,
  SORTS,
  applyFilters,
  facetCounts,
  groupByPlatform,
  readParams,
  sortResults,
  totals,
  writeParams,
  type Filters,
  type Result,
  type SortKey,
} from "@/lib/library"
import { useLibrary } from "@/lib/library-data"
import { usePreferences } from "@/lib/preferences"
import { DIGITAL } from "@domain"

type View = "grille" | "liste"
const VIEW_KEY = "fullset-view"
const OPEN_KEY = "fullset-open-platforms"

// L'affichage par défaut vient des réglages ; ce qu'on change ici ne vaut que pour la visite
// (sessionStorage), sans conséquence si le stockage est indisponible.
const readSession = (key: string) => {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}
const writeSession = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // navigation privée : le choix vaut pour la page
  }
}
const readView = (): View | null => {
  const v = readSession(VIEW_KEY)
  return v === "grille" || v === "liste" ? v : null
}
const readOpen = (): string[] | null => {
  try {
    const raw = readSession(OPEN_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function Library() {
  const { games, error, reload } = useLibrary()
  const { prefs } = usePreferences()
  const [params, setParams] = useSearchParams()
  const { filters, q, sort } = useMemo(() => readParams(params, prefs.games_sort), [params, prefs.games_sort])
  const [panelOpen, setPanelOpen] = useState(false)
  const [viewChoice, setViewChoice] = useState<View | null>(readView)
  const view = viewChoice ?? prefs.games_view
  const [open, setOpen] = useState<string[] | null>(readOpen)

  // Les filtres vivent dans l'adresse : le retour depuis une fiche les retrouve intacts.
  const update = (next: { filters?: Filters; q?: string; sort?: SortKey }) =>
    setParams(writeParams(next.filters ?? filters, next.q ?? q, next.sort ?? sort, prefs.games_sort), { replace: true })

  const results = useMemo(() => (games ? sortResults(applyFilters(games, filters, q), sort) : []), [games, filters, q, sort])
  const counts = useMemo(() => (games && panelOpen ? facetCounts(games, filters, q) : {}), [games, filters, q, panelOpen])
  const groups = useMemo(() => (sort === "plateforme" ? groupByPlatform(results) : null), [results, sort])
  const sum = totals(results)
  const active = FACETS.flatMap((f) => (filters[f.key] ?? []).map((value) => ({ key: f.key, label: f.label, value })))
  // Une recherche ou un filtre ouvre toutes les consoles : un résultat caché dans un groupe replié serait perdu.
  const forceOpen = q.trim() !== "" || active.length > 0
  // Sans choix pendant la visite, les consoles s'ouvrent comme dans les réglages.
  const openList = open ?? (prefs.games_groups === "depliees" && groups ? groups.map((g) => g.platform) : [])

  const changeView = (v: View) => {
    setViewChoice(v)
    writeSession(VIEW_KEY, v)
  }
  const setOpenList = (list: string[]) => {
    setOpen(list)
    writeSession(OPEN_KEY, JSON.stringify(list))
  }

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-destructive">{error}</p>
        <button onClick={reload} className="mt-3 text-sm underline">
          Réessayer
        </button>
      </div>
    )
  }
  if (!games) return <p className="py-16 text-center text-muted-foreground">Chargement…</p>
  if (!games.length) return <p className="py-16 text-center text-muted-foreground">La collection est vide.</p>

  const renderResults = (list: Result[], showPlatform: boolean) =>
    view === "grille" ? (
      <ul className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {list.map((r) => (
          <li key={r.game.id}>
            <GameCard result={r} showPlatform={showPlatform} />
          </li>
        ))}
      </ul>
    ) : (
      <ul className="divide-y divide-border">
        {list.map((r) => (
          <li key={r.game.id}>
            <GameRow result={r} showPlatform={showPlatform} />
          </li>
        ))}
      </ul>
    )

  return (
    <div className="pb-24">
      <LibraryTabs />
      <div className="sticky top-0 z-30 -mx-4 bg-background/95 px-4 pt-1 pb-3 backdrop-blur">
        <div className="flex gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Rechercher un jeu…"
            aria-label="Rechercher un jeu"
            className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2.5 outline-none focus:border-primary"
          />
          <button onClick={() => setPanelOpen(true)} className="rounded-lg border border-border bg-card px-3 text-sm">
            Filtres
            {active.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">{active.length}</span>
            )}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <div className="w-52">
            <KeyedChips label="Trier par" choices={SORTS} value={sort} onChange={(s) => update({ sort: s })} />
          </div>
          <div className="flex rounded-md border border-border bg-card p-0.5" role="group" aria-label="Affichage">
            <ViewButton on={view === "grille"} label="Grille" onClick={() => changeView("grille")}>
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
            </ViewButton>
            <ViewButton on={view === "liste"} label="Liste" onClick={() => changeView("liste")}>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </ViewButton>
          </div>
          <span className="text-muted-foreground">
            {plural(sum.games, "jeu", "jeux")} · {plural(sum.copies, "exemplaire")} · {euros(sum.spentCents)}
          </span>
        </div>

        {/* Filtres actifs en une ligne (plus de pastilles) : un toucher rouvre les menus. */}
        {active.length > 0 && (
          <div className="mt-2 flex items-center gap-3 text-xs">
            <button onClick={() => setPanelOpen(true)} className="min-w-0 flex-1 truncate text-left text-muted-foreground">
              Filtré : <span className="text-foreground">{active.map((a) => a.value).join(", ")}</span>
            </button>
            <button onClick={() => update({ filters: {} })} className="shrink-0 text-muted-foreground underline">
              Tout effacer
            </button>
          </div>
        )}
      </div>

      {results.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">Aucun jeu ne correspond.</p>
      ) : groups ? (
        <div className="space-y-2">
          {!forceOpen && (
            <div className="flex justify-end gap-3 text-xs text-muted-foreground">
              <button onClick={() => setOpenList(groups.map((g) => g.platform))} className="underline">
                Tout déplier
              </button>
              <button onClick={() => setOpenList([])} className="underline">
                Tout replier
              </button>
            </div>
          )}
          {groups.map((g) => (
            <details
              key={g.platform}
              open={forceOpen || openList.includes(g.platform)}
              onToggle={(e) => {
                if (forceOpen) return
                const isOpen = e.currentTarget.open
                if (isOpen !== openList.includes(g.platform)) setOpenList(isOpen ? [...openList, g.platform] : openList.filter((p) => p !== g.platform))
              }}
              className="group rounded-lg bg-card"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
                <span className="min-w-0 flex-1 truncate font-medium">{g.platform}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {plural(g.results.length, "jeu", "jeux")} · {euros(g.spentCents)}
                </span>
              </summary>
              <div className={view === "grille" ? "px-4 pt-1 pb-4" : "px-2 pb-2"}>{renderResults(g.results, false)}</div>
            </details>
          ))}
        </div>
      ) : (
        renderResults(results, true)
      )}

      <Link
        to="/brocante"
        aria-label="Je l'ai déjà ? Scanner une boîte"
        title="Je l'ai déjà ? Scanner une boîte"
        className="fixed right-5 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.25rem)] z-30 flex size-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg shadow-black/30"
      >
        <BarcodeIcon className="size-6" />
      </Link>
      <Link
        to="/ajouter"
        aria-label="Ajouter un jeu"
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-primary text-3xl text-primary-foreground shadow-lg shadow-black/40"
      >
        +
      </Link>

      <FilterPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        counts={counts}
        filters={filters}
        onChange={(f) => update({ filters: f })}
        resultCount={results.length}
      />
    </div>
  )
}

function ViewButton({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`flex size-7 items-center justify-center rounded ${on ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}

// Dans un groupe par console, la plateforme est dans l'en-tête : inutile de la répéter sous chaque jaquette.
function GameCard({ result: { game }, showPlatform }: { result: Result; showPlatform: boolean }) {
  return (
    <Link to={`/jeux/${game.id}`} className="group block">
      <div className="relative overflow-hidden rounded-md">
        <Cover src={game.cover} title={game.title} className="aspect-[3/4] w-full transition-transform group-hover:scale-[1.03]" />
        {game.copies.length > 1 && (
          <span className="absolute top-1 right-1 rounded bg-background/85 px-1.5 text-xs font-medium">×{game.copies.length}</span>
        )}
      </div>
      <div className="mt-1.5 line-clamp-2 text-sm leading-tight">{game.title}</div>
      {showPlatform && <div className="truncate text-xs text-muted-foreground">{game.platform}</div>}
    </Link>
  )
}

const SHORT_CONTENT: Record<string, string> = { "Complet (jeu + boîte + notice)": "Complet" }

/** Ligne de la vue liste : vignette, titre, ce qu'on possède, et ce que ça a coûté. */
function GameRow({ result: { game, copies }, showPlatform }: { result: Result; showPlatform: boolean }) {
  const first = copies[0]
  const what = first ? (first.support === DIGITAL ? "Dématérialisé" : (SHORT_CONTENT[first.content ?? ""] ?? first.content)) : null
  const last = copies.reduce<string | null>((max, c) => (c.purchase_date && (!max || c.purchase_date > max) ? c.purchase_date : max), null)
  const spent = copies.reduce((n, c) => n + (c.price_cents ?? 0), 0)
  const details = [showPlatform ? game.platform : null, copies.length > 1 ? plural(copies.length, "exemplaire") : null, what].filter(Boolean).join(" · ")

  return (
    <Link to={`/jeux/${game.id}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
      <Cover src={game.cover} title={game.title} placeholder="" className="aspect-[3/4] w-10 shrink-0 rounded" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{game.title}</div>
        <div className="truncate text-xs text-muted-foreground">{details}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm tabular-nums">{euros(spent)}</div>
        {last && <div className="text-xs text-muted-foreground tabular-nums">{frDate(last)}</div>}
      </div>
    </Link>
  )
}
