import type { Db } from "./db.js"
import { eventsByCopy, type CopyEvent } from "./events.js"
import { LATEST_VALUE_SQL } from "./valuations.js"

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
  /** Sortie de la collection : « Vendu », « Prêté »… ; null tant que l'exemplaire est là. */
  status: string | null
  left_on: string | null
  /** Dernière estimation (la plus récente fait foi), ou null si jamais estimé. */
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

export type Valuation = { id: number; amount_cents: number; valued_on: string; source: string; note: string | null }

export type RommRom = { id: number; name: string; platform: string; url: string }

export type CopyDetail = LibraryCopy & {
  completion_date: string | null
  play_time_hours: number | null
  completion_pct: number | null
  rating: number | null
  barcode: string | null
  comment: string | null
  photos: Array<{ id: number; url: string }>
  valuations: Valuation[]
  /** Sa vie : vente, don, prêt, panne… du plus récent au plus ancien. */
  events: CopyEvent[]
}

export type GameDetail = Omit<LibraryGame, "copies"> & {
  summary: string | null
  genres: string | null
  game_modes: string | null
  perspective: string | null
  pegi: string | null
  igdb_rating: number | null
  igdb_url: string | null
  cover_source: string | null
  steam_appid: number | null
  copies: CopyDetail[]
  /** ROM correspondante dans RomM ; null si aucune ou si RomM ne répond pas, absent si RomM n'est pas configuré. */
  romm?: RommRom | null
}

const coverPath = (file: string | null) => (file ? `/covers/${file}` : null)

const COPY_COLUMNS = `id, title_as_entered, support, region, edition, content, condition_game, condition_box,
  condition_manual, play_status, goal, quantity, price_cents, purchase_date, purchase_place, tags, status, left_on, ${LATEST_VALUE_SQL}`

/**
 * Toute la bibliothèque en une réponse : quelques centaines de jeux au plus, filtrés et
 * triés côté téléphone, ce qui rend la recherche instantanée sans aller-retour réseau.
 */
export function listLibrary(db: Db): LibraryGame[] {
  const games = db
    .prepare(
      `SELECT id, igdb_id, platform, title, series, developer, publisher, release_date, cover_file
       FROM games ORDER BY id`,
    )
    .all() as Array<Omit<LibraryGame, "cover" | "copies"> & { cover_file: string | null }>
  // Un exemplaire sorti de la collection (vendu, donné, prêté…) ne compte plus dans la
  // bibliothèque : il reste sur la fiche du jeu, avec son journal.
  const copies = db.prepare(`SELECT game_id, ${COPY_COLUMNS} FROM copies WHERE status IS NULL ORDER BY id`).all() as Array<LibraryCopy & { game_id: number }>

  const byGame = new Map<number, LibraryCopy[]>()
  for (const { game_id, ...copy } of copies) {
    const list = byGame.get(game_id)
    if (list) list.push(copy)
    else byGame.set(game_id, [copy])
  }
  // Un jeu dont tous les exemplaires sont sortis quitte la bibliothèque ; sa fiche et son
  // journal restent accessibles (depuis le journal, ou par son adresse).
  return games.filter((g) => byGame.has(g.id)).map(({ cover_file, ...g }) => ({ ...g, cover: coverPath(cover_file), copies: byGame.get(g.id)! }))
}

export function getGame(db: Db, id: number): GameDetail | null {
  const game = db
    .prepare(
      `SELECT id, igdb_id, platform, title, series, developer, publisher, release_date, summary, genres, game_modes,
              perspective, pegi, igdb_rating, igdb_url, cover_source, cover_file, steam_appid
       FROM games WHERE id = ?`,
    )
    .get(id) as (Omit<GameDetail, "cover" | "copies"> & { cover_file: string | null }) | undefined
  if (!game) return null

  const copies = db
    .prepare(
      `SELECT ${COPY_COLUMNS}, completion_date, play_time_hours, completion_pct, rating, barcode, comment
       FROM copies WHERE game_id = ? ORDER BY purchase_date IS NULL, purchase_date, id`,
    )
    .all(id) as Array<Omit<CopyDetail, "photos" | "valuations">>
  const photos = db.prepare("SELECT id, file FROM copy_photos WHERE copy_id = ? ORDER BY id")
  const valuations = db.prepare(
    "SELECT id, amount_cents, valued_on, source, note FROM valuations WHERE copy_id = ? ORDER BY valued_on DESC, id DESC",
  )
  const events = eventsByCopy(db, id)

  const { cover_file, ...rest } = game
  return {
    ...rest,
    cover: coverPath(cover_file),
    copies: copies.map((c) => ({
      ...c,
      photos: (photos.all(c.id) as Array<{ id: number; file: string }>).map((p) => ({ id: p.id, url: `/photos/${p.file}` })),
      valuations: valuations.all(c.id) as Valuation[],
      events: events.get(c.id) ?? [],
    })),
  }
}
