import { canonicalPlatform } from "./catalog.js"
import { NotFoundError, ValidationError } from "./copies.js"
import type { Db } from "./db.js"
import { text, toCents } from "./domain.js"
import { msg } from "./i18n.js"

export type WishItem = {
  id: number
  igdb_id: number | null
  platform: string | null
  title: string
  cover_url: string | null
  target_price_cents: number | null
  note: string | null
  created_at: string
  /** Le jeu est déjà dans la collection sur cette plateforme : le souhait est peut-être exaucé. */
  owned_game_id: number | null
}

const IGDB_IMAGES = "https://images.igdb.com/"

export function listWishlist(db: Db): WishItem[] {
  return db
    .prepare(
      `SELECT w.id, w.igdb_id, w.platform, w.title, w.cover_url, w.target_price_cents, w.note, w.created_at,
              (SELECT g.id FROM games g WHERE g.igdb_id = w.igdb_id AND g.platform = w.platform) AS owned_game_id
       FROM wishlist w ORDER BY w.created_at DESC, w.id DESC`,
    )
    .all() as WishItem[]
}

function validate(input: Record<string, unknown>) {
  const title = text(input.title)
  if (!title) throw new ValidationError(msg("common.titleRequired"))
  const rawPrice = text(input.target_price)
  const price = toCents(rawPrice)
  if (rawPrice !== null && (price === null || price < 0)) throw new ValidationError(msg("common.notAnAmount", { field: msg("fields.targetPrice"), value: rawPrice }))
  const cover = text(input.cover_url)
  // La jaquette est affichée telle quelle par le navigateur : seulement des images IGDB.
  if (cover !== null && !cover.startsWith(IGDB_IMAGES)) throw new ValidationError(msg("common.igdbCoversOnly"))
  const igdb = input.igdb_id === null || input.igdb_id === undefined || input.igdb_id === "" ? null : Number(input.igdb_id)
  if (igdb !== null && !Number.isInteger(igdb)) throw new ValidationError(msg("common.invalidIgdbId"))
  const platform = text(input.platform)
  return { igdb_id: igdb, platform: platform && canonicalPlatform(platform), title, cover_url: cover, target_price_cents: price, note: text(input.note) }
}

export function addWish(db: Db, input: Record<string, unknown>) {
  const w = validate(input)
  return Number(
    db
      .prepare(
        "INSERT INTO wishlist (igdb_id, platform, title, cover_url, target_price_cents, note) VALUES (@igdb_id, @platform, @title, @cover_url, @target_price_cents, @note)",
      )
      .run(w).lastInsertRowid,
  )
}

export function updateWish(db: Db, id: number, input: Record<string, unknown>) {
  const w = validate(input)
  const res = db
    .prepare(
      "UPDATE wishlist SET igdb_id = @igdb_id, platform = @platform, title = @title, cover_url = @cover_url, target_price_cents = @target_price_cents, note = @note WHERE id = @id",
    )
    .run({ ...w, id })
  if (res.changes === 0) throw new NotFoundError(msg("wishlist.notFound"))
}

export function deleteWish(db: Db, id: number) {
  if (db.prepare("DELETE FROM wishlist WHERE id = ?").run(id).changes === 0) throw new NotFoundError(msg("wishlist.notFound"))
}
