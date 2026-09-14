import { CONDITIONS, CONTENTS, MANUAL_CONDITIONS, PLAY_STATUSES, REGIONS, SUPPORTS } from "@domain"

export type LibraryCopy = {
  id: number
  title_as_entered: string
  support: string
  region: string | null
  edition: string | null
  content: string | null
  condition_game: string | null
  condition_box: string | null
  condition_manual: string | null
  play_status: string | null
  goal: string | null
  quantity: number
  price_cents: number | null
  purchase_date: string | null
  purchase_place: string | null
  tags: string | null
  value_cents: number | null
  valued_on: string | null
}

export type LibraryGame = {
  id: number
  igdb_id: number | null
  platform: string
  title: string
  series: string | null
  developer: string | null
  publisher: string | null
  release_date: string | null
  cover: string | null
  copies: LibraryCopy[]
}

export const NONE = "Non renseigné"

// Libellé affiché : clé `facets.<key>` des fichiers de langue.
type Facet = {
  key: string
  /** « game » : propriété du jeu ; « copy » : un exemplaire au moins doit la porter. */
  level: "game" | "copy"
  order?: readonly string[]
  values: (g: LibraryGame, c: LibraryCopy) => Array<string | null>
}

export const FACETS: Facet[] = [
  { key: "plateforme", level: "game", values: (g) => [g.platform] },
  { key: "support", level: "copy", order: SUPPORTS, values: (_g, c) => [c.support] },
  { key: "statut", level: "copy", order: PLAY_STATUSES, values: (_g, c) => [c.play_status] },
  { key: "contenu", level: "copy", order: CONTENTS, values: (_g, c) => [c.content] },
  { key: "etat-jeu", level: "copy", order: CONDITIONS, values: (_g, c) => [c.condition_game] },
  { key: "etat-boite", level: "copy", order: CONDITIONS, values: (_g, c) => [c.condition_box] },
  { key: "etat-notice", level: "copy", order: MANUAL_CONDITIONS, values: (_g, c) => [c.condition_manual] },
  { key: "region", level: "copy", order: REGIONS, values: (_g, c) => [c.region] },
  { key: "lieu", level: "copy", values: (_g, c) => [c.purchase_place] },
  { key: "tag", level: "copy", values: (_g, c) => (c.tags ?? "").split(",").map((t) => t.trim()) },
]

export type Filters = Record<string, string[]>

// Libellé affiché : clé `sorts.games.<key>` des fichiers de langue.
export const SORTS = [{ key: "nom" }, { key: "achat" }, { key: "prix" }, { key: "valeur" }, { key: "plateforme" }] as const
export type SortKey = (typeof SORTS)[number]["key"]

export type Result = { game: LibraryGame; copies: LibraryCopy[] }

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true })

/** Minuscules, sans accents ni ponctuation : « Pokémon: Colosseum » → « pokemon colosseum ». */
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

const valuesOf = (f: Facet, g: LibraryGame, c: LibraryCopy) => {
  const v = f.values(g, c).filter((x): x is string => Boolean(x))
  return v.length ? v : [NONE]
}

const selected = (filters: Filters, f: Facet, except?: string) => (f.key === except ? undefined : filters[f.key]?.length ? filters[f.key] : undefined)

function searchMatches(g: LibraryGame, tokens: string[]) {
  if (!tokens.length) return true
  const hay = normalize(
    [g.title, g.platform, g.series, g.developer, g.publisher, ...g.copies.map((c) => c.title_as_entered)].filter(Boolean).join(" "),
  )
  return tokens.every((t) => hay.includes(t))
}

/**
 * Exemplaires du jeu qui satisfont les filtres, ou null si le jeu est exclu.
 * Les filtres d'exemplaire s'appliquent ensemble au même exemplaire : « Physique » et
 * « boîte en bon état » ne retient pas un jeu dont seule la version démat. est en bon état.
 */
function matchingCopies(g: LibraryGame, filters: Filters, except?: string): LibraryCopy[] | null {
  for (const f of FACETS) {
    const sel = f.level === "game" ? selected(filters, f, except) : undefined
    if (sel && !valuesOf(f, g, g.copies[0] ?? ({} as LibraryCopy)).some((v) => sel.includes(v))) return null
  }
  const copyFacets = FACETS.filter((f) => f.level === "copy" && selected(filters, f, except))
  if (!copyFacets.length) return g.copies
  const copies = g.copies.filter((c) => copyFacets.every((f) => valuesOf(f, g, c).some((v) => selected(filters, f, except)!.includes(v))))
  return copies.length ? copies : null
}

export function applyFilters(games: LibraryGame[], filters: Filters, q: string, except?: string): Result[] {
  const tokens = normalize(q).split(" ").filter(Boolean)
  const out: Result[] = []
  for (const game of games) {
    if (!searchMatches(game, tokens)) continue
    const copies = matchingCopies(game, filters, except)
    if (copies) out.push({ game, copies })
  }
  return out
}

export type FacetOption = { value: string; count: number }

/**
 * Pour chaque critère, combien de jeux resteraient en cochant chaque valeur,
 * compte tenu de la recherche et des autres critères (mais pas de celui-ci).
 */
export function facetCounts(games: LibraryGame[], filters: Filters, q: string): Record<string, FacetOption[]> {
  const out: Record<string, FacetOption[]> = {}
  for (const f of FACETS) {
    const counts = new Map<string, number>()
    for (const { game, copies } of applyFilters(games, filters, q, f.key)) {
      const vals = new Set(f.level === "game" ? valuesOf(f, game, copies[0] ?? ({} as LibraryCopy)) : copies.flatMap((c) => valuesOf(f, game, c)))
      for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    for (const v of filters[f.key] ?? []) if (!counts.has(v)) counts.set(v, 0)
    const rank = (v: string) => (v === NONE ? Number.MAX_SAFE_INTEGER : (f.order?.indexOf(v) ?? -1) < 0 ? 1000 : f.order!.indexOf(v))
    out[f.key] = [...counts]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) =>
        f.order ? rank(a.value) - rank(b.value) || collator.compare(a.value, b.value)
        : (a.value === NONE ? 1 : 0) - (b.value === NONE ? 1 : 0) || b.count - a.count || collator.compare(a.value, b.value),
      )
  }
  return out
}

const lastPurchase = (g: LibraryGame) => g.copies.reduce<string>((max, c) => (c.purchase_date && c.purchase_date > max ? c.purchase_date : max), "")
const totalPrice = (g: LibraryGame) => g.copies.reduce((n, c) => n + (c.price_cents ?? 0), 0)
// -1 pour un jeu jamais estimé : il passe après ceux estimés à 0 €.
const totalValue = (g: LibraryGame) =>
  g.copies.some((c) => c.value_cents !== null) ? g.copies.reduce((n, c) => n + (c.value_cents ?? 0), 0) : -1

export function sortResults(results: Result[], sort: SortKey): Result[] {
  const byName = (a: Result, b: Result) => collator.compare(a.game.title, b.game.title)
  const cmp: Record<SortKey, (a: Result, b: Result) => number> = {
    nom: byName,
    achat: (a, b) => lastPurchase(b.game).localeCompare(lastPurchase(a.game)) || byName(a, b),
    prix: (a, b) => totalPrice(b.game) - totalPrice(a.game) || byName(a, b),
    valeur: (a, b) => totalValue(b.game) - totalValue(a.game) || byName(a, b),
    plateforme: (a, b) => collator.compare(a.game.platform, b.game.platform) || byName(a, b),
  }
  return [...results].sort(cmp[sort])
}

export type PlatformGroup = { platform: string; results: Result[]; copies: number; spentCents: number }

/** Regroupe par plateforme, dans l'ordre des résultats (déjà triés par plateforme puis par nom). */
export function groupByPlatform(results: Result[]): PlatformGroup[] {
  const groups = new Map<string, PlatformGroup>()
  for (const r of results) {
    const g = groups.get(r.game.platform) ?? { platform: r.game.platform, results: [], copies: 0, spentCents: 0 }
    g.results.push(r)
    for (const c of r.copies) {
      g.copies++
      g.spentCents += c.price_cents ?? 0
    }
    groups.set(r.game.platform, g)
  }
  return [...groups.values()]
}

export function totals(results: Result[]) {
  let copies = 0
  let spentCents = 0
  for (const r of results)
    for (const c of r.copies) {
      copies++
      spentCents += c.price_cents ?? 0
    }
  return { games: results.length, copies, spentCents }
}

// Sans `tri` dans l'adresse, c'est le tri par défaut choisi dans les réglages.
export function readParams(sp: URLSearchParams, defaultSort: SortKey = "nom") {
  const filters: Filters = {}
  for (const f of FACETS) {
    const v = sp.getAll(f.key)
    if (v.length) filters[f.key] = v
  }
  const sort = SORTS.some((s) => s.key === sp.get("tri")) ? (sp.get("tri") as SortKey) : defaultSort
  return { filters, q: sp.get("q") ?? "", sort }
}

export function writeParams(filters: Filters, q: string, sort: SortKey, defaultSort: SortKey = "nom") {
  const sp = new URLSearchParams()
  if (q) sp.set("q", q)
  if (sort !== defaultSort) sp.set("tri", sort)
  for (const f of FACETS) for (const v of filters[f.key] ?? []) sp.append(f.key, v)
  return sp
}
