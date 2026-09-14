import { NotFoundError, ValidationError } from "./copies.js"
import type { Db } from "./db.js"
import { isoDate, text } from "./domain.js"
import type { GameMeta } from "./igdb.js"
import { setCoverFromUrl } from "./media.js"

const META_COLUMNS = [
  "igdb_id",
  "title",
  "summary",
  "developer",
  "publisher",
  "release_date",
  "genres",
  "game_modes",
  "perspective",
  "series",
  "pegi",
  "igdb_rating",
  "igdb_url",
] as const

export type ManualGame = { title: string; igdb_id?: null }

export function findGame(db: Db, igdbId: number, platform: string): number | null {
  const row = db.prepare("SELECT id FROM games WHERE igdb_id = ? AND platform = ?").get(igdbId, platform) as { id: number } | undefined
  return row?.id ?? null
}

/** Crée le jeu ; la jaquette est téléchargée tout de suite, un échec n'empêche pas l'ajout. */
export async function createGame(db: Db, dataDir: string, platform: string, meta: GameMeta | ManualGame, fetchImpl?: typeof fetch) {
  const p = text(platform)
  if (!p) throw new ValidationError("La plateforme est obligatoire.")
  const title = text(meta.title)
  if (!title) throw new ValidationError("Le titre est obligatoire.")
  const row: Record<string, unknown> = Object.fromEntries(META_COLUMNS.map((c) => [c, (meta as Record<string, unknown>)[c] ?? null]))
  const coverUrl = "cover_url" in meta ? meta.cover_url : null
  const id = Number(
    db
      .prepare(
        `INSERT INTO games (platform, cover_url, cover_source, ${META_COLUMNS.join(", ")})
         VALUES (@platform, @cover_url, @cover_source, ${META_COLUMNS.map((c) => `@${c}`).join(", ")})`,
      )
      .run({ ...row, title, platform: p, cover_url: coverUrl, cover_source: coverUrl ? "igdb" : null }).lastInsertRowid,
  )
  if (coverUrl) {
    try {
      await setCoverFromUrl(db, dataDir, id, coverUrl, "igdb", fetchImpl)
    } catch {
      // cover_url reste posée : « import-collection --covers-only » pourra la retenter.
    }
  }
  return id
}

const EDITABLE = ["title", "summary", "developer", "publisher", "release_date", "genres", "game_modes", "perspective", "series", "pegi"] as const

export function updateGame(db: Db, id: number, input: Record<string, unknown>) {
  if (!db.prepare("SELECT 1 FROM games WHERE id = ?").get(id)) throw new NotFoundError("Jeu introuvable.")
  const title = text(input.title)
  if (!title) throw new ValidationError("Le titre est obligatoire.")
  const rawDate = text(input.release_date)
  const releaseDate = isoDate(rawDate)
  if (rawDate && !releaseDate) throw new ValidationError(`Date de sortie : « ${rawDate} » n'est pas une date.`)
  const data = { ...Object.fromEntries(EDITABLE.map((c) => [c, text(input[c])])), title, release_date: releaseDate, id }
  db.prepare(`UPDATE games SET ${EDITABLE.map((c) => `${c} = @${c}`).join(", ")}, updated_at = datetime('now') WHERE id = @id`).run(data)
}

/**
 * Rattache un jeu à une autre fiche IGDB (ou à une première, pour les jeux « à rapprocher ») :
 * les métadonnées sont remplacées, la jaquette aussi sauf si elle a été posée à la main.
 */
export async function relinkGame(db: Db, dataDir: string, id: number, meta: GameMeta, fetchImpl?: typeof fetch) {
  const game = db.prepare("SELECT platform, cover_source FROM games WHERE id = ?").get(id) as
    | { platform: string; cover_source: string | null }
    | undefined
  if (!game) throw new NotFoundError("Jeu introuvable.")
  const other = findGame(db, meta.igdb_id, game.platform)
  if (other !== null && other !== id) throw new ValidationError("Ce jeu est déjà dans la collection sur cette plateforme.")
  db.prepare(`UPDATE games SET ${META_COLUMNS.map((c) => `${c} = @${c}`).join(", ")}, updated_at = datetime('now') WHERE id = @id`).run({
    ...Object.fromEntries(META_COLUMNS.map((c) => [c, meta[c]])),
    id,
  })
  if (meta.cover_url && game.cover_source !== "photo") {
    try {
      await setCoverFromUrl(db, dataDir, id, meta.cover_url, "igdb", fetchImpl)
    } catch {
      db.prepare("UPDATE games SET cover_url = ? WHERE id = ?").run(meta.cover_url, id)
    }
  }
}
