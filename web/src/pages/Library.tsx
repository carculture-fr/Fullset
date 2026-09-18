import { Search } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { Trans, useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router-dom"

import { ConditionDot } from "@/components/condition"
import { Cover } from "@/components/cover"
import { FilterPanel, PageFilters, facetValueLabel, useDesktop } from "@/components/filter-panel"
import {
  CARD_FRAME,
  COMPACT_FIELD,
  GRID_CLASS,
  GroupSummary,
  LibraryTabs,
  ROW_CLASS,
  SortMenu,
  ViewToggle,
  readSession,
  readView,
  writeSession,
  type View,
} from "@/components/library-tabs"
import { errorMessage, send } from "@/lib/api"
import { euros, formatDate } from "@/lib/format"
import { valueLabel } from "@/lib/i18n"
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

const VIEW_KEY = "fullset-view"
const OPEN_KEY = "fullset-open-platforms"

// L'affichage par défaut vient des réglages ; ce qu'on change ici ne vaut que pour la visite.
const readOpen = (): string[] | null => {
  try {
    const raw = readSession(OPEN_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function Library() {
  const { t } = useTranslation()
  const { games, error, reload } = useLibrary()
  const { prefs } = usePreferences()
  const desktop = useDesktop()
  const [params, setParams] = useSearchParams()
  const { filters, q, sort } = useMemo(() => readParams(params, prefs.games_sort), [params, prefs.games_sort])
  const [panelOpen, setPanelOpen] = useState(false)
  const [viewChoice, setViewChoice] = useState<View | null>(() => readView(VIEW_KEY))
  // Sélection multiple : cocher plusieurs jeux pour les supprimer d'un coup.
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const view = viewChoice ?? prefs.games_view
  const [open, setOpen] = useState<string[] | null>(readOpen)

  // Les filtres vivent dans l'adresse : le retour depuis une fiche les retrouve intacts.
  const update = (next: { filters?: Filters; q?: string; sort?: SortKey }) =>
    setParams(writeParams(next.filters ?? filters, next.q ?? q, next.sort ?? sort, prefs.games_sort), { replace: true })

  const results = useMemo(() => (games ? sortResults(applyFilters(games, filters, q), sort) : []), [games, filters, q, sort])
  // Sur grand écran les filtres sont toujours affichés sur la page : leurs compteurs aussi.
  const showCounts = panelOpen || desktop
  const counts = useMemo(() => (games && showCounts ? facetCounts(games, filters, q) : {}), [games, filters, q, showCounts])
  const groups = useMemo(() => (sort === "plateforme" ? groupByPlatform(results) : null), [results, sort])
  const sum = totals(results)
  const active = FACETS.flatMap((f) => (filters[f.key] ?? []).map((value) => ({ key: f.key, value, shown: facetValueLabel(f, value) })))
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

  const title = <h1 className="text-[29px] leading-[1.1]">{t("layout.library")}</h1>

  if (error) {
    return (
      <div>
        {title}
        <div className="py-16 text-center">
          <p className="text-destructive">{error}</p>
          <button onClick={reload} className="mt-4 min-h-11 rounded-full bg-card px-5 font-heading text-[14px]">
            {t("common.retry")}
          </button>
        </div>
      </div>
    )
  }
  if (!games) return <LibrarySkeleton title={title} />
  if (!games.length) {
    return (
      <div>
        {title}
        <div className="flex flex-col items-center py-14 text-center">
          <EmptyBox />
          <p className="mt-4 text-muted-foreground">{t("library.empty")}</p>
          <Link to="/ajouter" className="mt-5 flex h-11 items-center rounded-full bg-primary px-6 font-heading text-[15px] text-primary-foreground">
            {t("library.addGame")}
          </Link>
          <Link to="/stats" className="mt-3 text-[13px] text-muted-foreground underline">
            {t("library.emptyImport")}
          </Link>
        </div>
      </div>
    )
  }

  /** Supprime les jeux cochés : chaque exemplaire part, et le jeu avec son dernier exemplaire. */
  const deletePicked = async () => {
    if (!window.confirm(t("library.deleteSelectedConfirm", { count: picked.size }))) return
    setBusy(true)
    try {
      const copies = (games ?? []).filter((g) => picked.has(g.id)).flatMap((g) => g.copies.map((c) => c.id))
      for (const id of copies) await send("DELETE", `/api/copies/${id}`)
      setNote(t("library.deleted", { count: picked.size }))
      setPicked(new Set())
      setSelecting(false)
      await reload()
    } catch (err) {
      setNote(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleGame = (id: number) =>
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /** En mode sélection, toute la vignette devient une case à cocher : on ne part pas sur la fiche. */
  const selectable = (r: Result, content: ReactNode) =>
    selecting ? (
      <button type="button" onClick={() => toggleGame(r.game.id)} aria-pressed={picked.has(r.game.id)} className="relative block w-full text-left">
        <span className={picked.has(r.game.id) ? "" : "opacity-60"}>{content}</span>
        <span
          aria-hidden="true"
          className={`absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full border-[1.5px] text-[11px] shadow-sm ${
            picked.has(r.game.id) ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-background"
          }`}
        >
          {picked.has(r.game.id) ? "✓" : ""}
        </span>
      </button>
    ) : (
      content
    )

  const renderResults = (list: Result[], showPlatform: boolean) =>
    view === "grille" ? (
      <ul className={GRID_CLASS}>
        {list.map((r) => (
          <li key={r.game.id}>{selectable(r, <GameCard result={r} showPlatform={showPlatform} />)}</li>
        ))}
      </ul>
    ) : (
      <ul>
        {list.map((r) => (
          <li key={r.game.id}>{selectable(r, <GameRow result={r} showPlatform={showPlatform} />)}</li>
        ))}
      </ul>
    )

  const filtered = active.map((a) => a.shown).join(", ")
  const sortField = (
    <SortMenu
      label={t("library.sortBy")}
      choices={SORTS.map((s) => ({ key: s.key, label: t(`sorts.games.${s.key}`) }))}
      value={sort}
      onChange={(s) => update({ sort: s })}
    />
  )

  return (
    <div>
      {title}
      <p className="num mt-1 text-[13px] text-muted-foreground">
        {t("library.games", { count: sum.games })} · {t("library.copies", { count: sum.copies })} ·{" "}
        <strong className="font-semibold text-foreground">{euros(sum.spentCents)}</strong>
      </p>

      {/* Commandes gardées en haut au défilement sur téléphone. */}
      <div className="sticky top-0 z-20 -mx-4 bg-background/95 px-4 pt-3.5 pb-3 backdrop-blur lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3 lg:flex-nowrap lg:gap-3">
          <LibraryTabs />
          <div className="order-last flex basis-full gap-2 lg:order-none lg:max-w-md lg:flex-1 lg:basis-auto">
            <label className="relative min-w-0 flex-1">
              <Search size={18} strokeWidth={2.75} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={q}
                onChange={(e) => update({ q: e.target.value })}
                placeholder={t("library.searchPlaceholder")}
                aria-label={t("library.searchLabel")}
                className="h-11 w-full rounded-full border border-border-strong bg-card pr-4 pl-11 text-base outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-tint)]"
              />
            </label>
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-card px-4 font-heading text-[14px] transition-colors duration-150 hover:bg-foreground/7 lg:hidden"
            >
              {t("library.filters")}
              {active.length > 0 && (
                <span className="num rounded-full bg-primary px-[7px] py-px font-sans text-[11px] font-semibold text-primary-foreground">{active.length}</span>
              )}
            </button>
          </div>
          <div className="ml-auto lg:ml-0">
            <ViewToggle value={view} onChange={changeView} />
          </div>
        </div>

        {/* Filtres actifs en une ligne : un toucher rouvre le panneau. */}
        {!desktop && active.length > 0 && (
          <div className="mt-2.5 flex min-w-0 items-center gap-3 text-[12px] text-muted-foreground">
            <button type="button" onClick={() => setPanelOpen(true)} className="-my-3 min-w-0 flex-1 truncate py-3 text-left">
              <Trans i18nKey="library.filtered" values={{ values: filtered }} components={{ value: <span className="text-foreground" /> }} />
            </button>
            <button type="button" onClick={() => update({ filters: {} })} className="-my-3 shrink-0 py-3 underline">
              {t("library.clearAll")}
            </button>
          </div>
        )}
      </div>

      {/* Sélection multiple : choisir plusieurs jeux, puis les supprimer d'un coup. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSelecting((s) => !s)
            setPicked(new Set())
            setNote(null)
          }}
          className="min-h-10 rounded-full bg-card px-4 text-[13px] font-semibold transition-colors duration-150 hover:bg-foreground/7"
        >
          {selecting ? t("library.selectDone") : t("library.select")}
        </button>
        {selecting && (
          <>
            <span className="num text-[13px] text-muted-foreground">{t("library.selected", { count: picked.size })}</span>
            <button
              type="button"
              onClick={deletePicked}
              disabled={busy || picked.size === 0}
              className="min-h-10 rounded-full bg-destructive px-4 text-[13px] font-semibold text-background transition-opacity duration-150 disabled:opacity-40"
            >
              {t("library.deleteSelected")}
            </button>
          </>
        )}
        {note && <span className="text-[13px] text-muted-foreground">{note}</span>}
      </div>

      {/* Le tri reste hors de la zone collante : sur téléphone, elle mangerait l'écran. */}
      {desktop ? (
        <PageFilters sortField={sortField} counts={counts} filters={filters} onChange={(f) => update({ filters: f })} />
      ) : (
        <div className={`mb-3 max-w-xs ${COMPACT_FIELD}`}>{sortField}</div>
      )}

      {results.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t("library.noMatch")}</p>
      ) : groups ? (
        <div className="mt-1 space-y-3 lg:mt-5 lg:space-y-5">
          {!forceOpen && (
            <div className="flex justify-end gap-3 text-[12px] text-muted-foreground">
              <button type="button" onClick={() => setOpenList(groups.map((g) => g.platform))} className="underline">
                {t("library.expandAll")}
              </button>
              <button type="button" onClick={() => setOpenList([])} className="underline">
                {t("library.collapseAll")}
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
              className="group"
            >
              <GroupSummary name={g.platform} meta={`${t("library.games", { count: g.results.length })} · ${euros(g.spentCents)}`} />
              <div className="pb-2">{renderResults(g.results, false)}</div>
            </details>
          ))}
        </div>
      ) : (
        <div className="mt-1 lg:mt-5">{renderResults(results, true)}</div>
      )}

      <FilterPanel
        open={panelOpen && !desktop}
        onClose={() => setPanelOpen(false)}
        counts={counts}
        filters={filters}
        onChange={(f) => update({ filters: f })}
        resultCount={results.length}
      />
    </div>
  )
}

/** Chargement : les formes finales sur la surface, le texte pour les lecteurs d'écran. */
function LibrarySkeleton({ title }: { title: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div>
      {title}
      <p role="status" className="sr-only">
        {t("library.loading")}
      </p>
      <div aria-hidden="true">
        <div className="mt-2 h-4 w-48 rounded-full bg-card" />
        <div className="mt-4 flex gap-2">
          <div className="h-10 w-40 rounded-full bg-card" />
          <div className="ml-auto size-10 rounded-full bg-card" />
        </div>
        <div className="mt-3 h-11 rounded-full bg-card lg:max-w-md" />
        <ul className={`mt-6 ${GRID_CLASS}`}>
          {Array.from({ length: 12 }, (_, i) => (
            <li key={i}>
              <div className="aspect-[3/4] rounded-[12px] bg-card" />
              <div className="mt-1.5 h-3 w-4/5 rounded-full bg-card" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Silhouette de boîtier vide, 96 px : collection vide. */
function EmptyBox() {
  return (
    <div aria-hidden="true" className="flex h-24 w-[72px] overflow-hidden rounded-[12px] border-[1.5px] border-border-strong bg-muted">
      <div className="w-[9px] shrink-0 bg-border-strong" />
      <div className="flex flex-1 flex-col justify-between p-2">
        <div className="h-1 w-8 rounded-full bg-border-strong" />
        <div className="space-y-1">
          <div className="h-1.5 w-10 rounded-full bg-border-strong" />
          <div className="h-1.5 w-7 rounded-full bg-border-strong" />
        </div>
      </div>
    </div>
  )
}

// Dans un groupe par console, la plateforme est dans l'en-tête : inutile de la répéter sous chaque jaquette.
function GameCard({ result: { game }, showPlatform }: { result: Result; showPlatform: boolean }) {
  return (
    <Link to={`/jeux/${game.id}`} className="group block rounded-[12px]">
      <div className={CARD_FRAME}>
        <Cover src={game.cover} title={game.title} platform={game.platform} className="w-full" />
        {game.copies.length > 1 && (
          <span className="num absolute top-2 right-2 rounded-full bg-ink px-[7px] py-0.5 text-[10px] leading-tight font-semibold text-ink-foreground">
            ×{game.copies.length}
          </span>
        )}
      </div>
      <div className="mt-1.5 line-clamp-2 text-[12px] leading-[1.25]">{game.title}</div>
      {showPlatform && <div className="truncate text-[11px] text-muted-foreground">{game.platform}</div>}
    </Link>
  )
}

const COMPLETE = "Complet (jeu + boîte + notice)"

/** Ligne de la vue liste : vignette, titre, ce qu'on possède et dans quel état, et ce que ça a coûté. */
function GameRow({ result: { game, copies }, showPlatform }: { result: Result; showPlatform: boolean }) {
  const { t } = useTranslation()
  const first = copies[0]
  const physical = first && first.support !== DIGITAL
  const what = first
    ? !physical
      ? valueLabel("support", DIGITAL)
      : first.content === COMPLETE
        ? t("library.shortComplete")
        : valueLabel("content", first.content)
    : null
  const last = copies.reduce<string | null>((max, c) => (c.purchase_date && (!max || c.purchase_date > max) ? c.purchase_date : max), null)
  const spent = copies.reduce((n, c) => n + (c.price_cents ?? 0), 0)
  const details = [showPlatform ? game.platform : null, copies.length > 1 ? t("library.copies", { count: copies.length }) : null, what].filter(Boolean).join(" · ")
  const condition = physical ? first.condition_game : null

  return (
    <Link to={`/jeux/${game.id}`} className={ROW_CLASS}>
      <Cover src={game.cover} title={game.title} platform={game.platform} size="thumb" className="w-[38px]" />
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold">{game.title}</div>
        <div className="flex min-w-0 items-center gap-1 text-[12px] text-muted-foreground">
          <span className="truncate">{details}</span>
          {condition && (
            <>
              {details && <span aria-hidden="true">·</span>}
              <ConditionDot value={condition} size={7} />
            </>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="num text-[14px] font-semibold">{euros(spent)}</div>
        {last ? (
          <div className="num text-[11px] text-muted-foreground">{formatDate(last)}</div>
        ) : (
          first?.purchase_place && <div className="max-w-24 truncate text-[11px] text-muted-foreground">{first.purchase_place}</div>
        )}
      </div>
    </Link>
  )
}
