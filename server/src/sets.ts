import { canonicalPlatform } from "./catalog.js"
import type { Db } from "./db.js"
import { FULLSETNET, SOURCE_LISTS, sourceUrl, type SourceItem, type SourceList } from "./fullsetnet.js"
import type { IgdbClient } from "./igdb.js"

/**
 * Le « mode Fullset » : pour une console, la liste complète des jeux à avoir (une liste de
 * référence), et ce qu'il reste à trouver. Le rapprochement avec la collection se fait par fiche
 * IGDB quand elle est connue, sinon sur le titre normalisé (sans accents ni ponctuation) et la
 * console. Les listes sont gardées en base : l'appli marche même si la source est hors service.
 */

/** Titre comparable : sans accents, sans ponctuation, sans article de tête, « & » écrit « and ». */
export const normTitle = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^(the|le|la|les|l) /, "")
    .trim()

export type SetSummary = {
  slug: string
  source: string
  name: string
  platform: string
  region: string | null
  fetched_at: string
  /** Page d'origine de la liste, quand la source en a une. */
  source_url: string | null
  count: number
  owned: number
  /** Somme des cotes des jeux qui manquent : ce qu'il reste à dépenser. */
  missing_cents: number
  total_cents: number
}

export type SetItem = SourceItem & {
  igdb_id: number | null
  cover_url: string | null
  /** Le jeu de la collection qui correspond, s'il y en a un. */
  owned_game_id: number | null
  /** Sa jaquette : celle de la collection passe devant celle trouvée pour la liste. */
  owned_cover: string | null
}

type SetRow = { slug: string; source: string; name: string; platform: string; region: string | null; fetched_at: string }

const setRow = (db: Db, slug: string) => db.prepare("SELECT slug, source, name, platform, region, fetched_at FROM sets WHERE slug = ?").get(slug) as SetRow | undefined

/** Les jeux de la collection sur cette console : par fiche IGDB et par titre (saisi ou officiel). */
function ownedIndex(db: Db, platform: string) {
  const rows = db
    .prepare(
      `SELECT g.id, g.igdb_id, g.title, g.cover_file, g.cover_url, (SELECT group_concat(c.title_as_entered, char(10)) FROM copies c WHERE c.game_id = g.id) AS entered
       FROM games g WHERE g.platform = ?`,
    )
    .all(platform) as Array<{ id: number; igdb_id: number | null; title: string; cover_file: string | null; cover_url: string | null; entered: string | null }>
  const byIgdb = new Map<number, number>()
  const byTitle = new Map<string, number>()
  const covers = new Map<number, string | null>()
  for (const g of rows) {
    if (g.igdb_id !== null) byIgdb.set(g.igdb_id, g.id)
    covers.set(g.id, g.cover_file ? `/covers/${g.cover_file}` : g.cover_url)
    for (const title of [g.title, ...(g.entered?.split("\n") ?? [])]) {
      const key = normTitle(title)
      if (key && !byTitle.has(key)) byTitle.set(key, g.id)
    }
  }
  return { byIgdb, byTitle, covers }
}

const ownedFor = (index: ReturnType<typeof ownedIndex>, item: { igdb_id: number | null; title: string }) =>
  (item.igdb_id !== null ? (index.byIgdb.get(item.igdb_id) ?? null) : null) ?? index.byTitle.get(normTitle(item.title)) ?? null

function summarize(db: Db, row: SetRow): SetSummary {
  const items = db.prepare("SELECT title, price_cents, igdb_id FROM set_items WHERE set_slug = ?").all(row.slug) as Array<{ title: string; price_cents: number | null; igdb_id: number | null }>
  const index = ownedIndex(db, row.platform)
  let owned = 0
  let missingCents = 0
  let totalCents = 0
  for (const item of items) {
    totalCents += item.price_cents ?? 0
    if (ownedFor(index, item) !== null) owned += 1
    else missingCents += item.price_cents ?? 0
  }
  return { ...row, source_url: row.source === FULLSETNET ? sourceUrl(row.slug) : null, count: items.length, owned, missing_cents: missingCents, total_cents: totalCents }
}

/** Les listes enregistrées, avec leur avancement ; l'appel reste local (aucun accès réseau). */
export function listSets(db: Db): SetSummary[] {
  const rows = db.prepare("SELECT slug, source, name, platform, region, fetched_at FROM sets").all() as SetRow[]
  return rows.map((row) => summarize(db, row)).sort((a, b) => a.name.localeCompare(b.name, "fr"))
}

/** Les listes proposées par la source, enregistrées ou non (écran d'accueil du mode Fullset). */
export function availableSets(db: Db) {
  const saved = new Map(listSets(db).map((s) => [s.slug, s]))
  return SOURCE_LISTS.map((list) => ({ ...list, source: FULLSETNET, saved: saved.get(list.slug) ?? null }))
}

export function getSet(db: Db, slug: string): { set: SetSummary; items: SetItem[] } | null {
  const row = setRow(db, slug)
  if (!row) return null
  const items = db
    .prepare("SELECT position, title, url, price_cents, igdb_id, cover_url FROM set_items WHERE set_slug = ? ORDER BY position")
    .all(slug) as Array<Omit<SetItem, "owned_game_id">>
  const index = ownedIndex(db, row.platform)
  return {
    set: summarize(db, row),
    items: items.map((item) => {
      const owned = ownedFor(index, item)
      return { ...item, owned_game_id: owned, owned_cover: owned === null ? null : (index.covers.get(owned) ?? null) }
    }),
  }
}

/**
 * Enregistre une liste récupérée. Les jeux déjà rapprochés d'une fiche IGDB gardent leur fiche
 * et leur jaquette : une mise à jour de la liste ne refait pas tout le travail de rapprochement.
 */
export function saveSet(db: Db, list: SourceList, items: SourceItem[], source = FULLSETNET): SetSummary {
  const platform = canonicalPlatform(list.platform)
  db.transaction(() => {
    const known = new Map(
      (db.prepare("SELECT title, igdb_id, cover_url FROM set_items WHERE set_slug = ?").all(list.slug) as Array<{ title: string; igdb_id: number | null; cover_url: string | null }>).map((r) => [
        normTitle(r.title),
        r,
      ]),
    )
    db.prepare("DELETE FROM set_items WHERE set_slug = ?").run(list.slug)
    db.prepare(
      `INSERT INTO sets (slug, source, name, platform, region, fetched_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(slug) DO UPDATE SET source = excluded.source, name = excluded.name, platform = excluded.platform, region = excluded.region, fetched_at = excluded.fetched_at`,
    ).run(list.slug, source, list.name, platform, list.region)
    const insert = db.prepare(
      "INSERT INTO set_items (set_slug, position, title, norm_title, url, price_cents, igdb_id, cover_url) VALUES (@slug, @position, @title, @norm, @url, @price_cents, @igdb_id, @cover_url)",
    )
    for (const item of items) {
      const before = known.get(normTitle(item.title))
      insert.run({ slug: list.slug, ...item, norm: normTitle(item.title), igdb_id: before?.igdb_id ?? null, cover_url: before?.cover_url ?? null })
    }
  })()
  return summarize(db, setRow(db, list.slug)!)
}

export function deleteSet(db: Db, slug: string) {
  return db.prepare("DELETE FROM sets WHERE slug = ?").run(slug).changes > 0
}

/** Les jeux d'une liste qui n'ont pas encore de fiche IGDB (donc pas de jaquette). */
export function itemsWithoutIgdb(db: Db, slug: string, limit: number) {
  return db.prepare("SELECT position, title FROM set_items WHERE set_slug = ? AND igdb_id IS NULL ORDER BY position LIMIT ?").all(slug, limit) as Array<{ position: number; title: string }>
}

export function linkItem(db: Db, slug: string, position: number, igdbId: number | null, coverUrl: string | null) {
  db.prepare("UPDATE set_items SET igdb_id = ?, cover_url = ? WHERE set_slug = ? AND position = ?").run(igdbId, coverUrl, slug, position)
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Cherche la fiche IGDB des jeux d'une liste, par paquets (bouton « Chercher les jaquettes ») :
 * IGDB limite le débit, et une liste de 231 jeux ne se rapproche pas pendant l'affichage d'une
 * page. Un titre sans correspondance sur la bonne console est laissé tel quel, il sera retenté.
 */
export async function linkSetCovers(db: Db, slug: string, igdb: IgdbClient, limit = 40) {
  const row = setRow(db, slug)
  if (!row) return null
  const todo = itemsWithoutIgdb(db, slug, limit)
  let linked = 0
  for (const [i, item] of todo.entries()) {
    if (i) await wait(250)
    const candidates = await igdb.search(item.title)
    const onPlatform = candidates.filter((c) => c.platforms.includes(row.platform))
    const match = onPlatform.find((c) => normTitle(c.name) === normTitle(item.title)) ?? onPlatform[0]
    if (!match) continue
    linkItem(db, slug, item.position, match.igdb_id, match.cover)
    linked += 1
  }
  const remaining = (db.prepare("SELECT count(*) AS n FROM set_items WHERE set_slug = ? AND igdb_id IS NULL").get(slug) as { n: number }).n
  return { looked: todo.length, linked, remaining, set: summarize(db, row) }
}
