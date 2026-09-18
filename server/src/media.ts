import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { NotFoundError, PHOTOS_DIR, ValidationError, removeFile } from "./copies.js"
import { COVERS_DIR } from "./covers.js"
import type { Db } from "./db.js"
import { msg } from "./i18n.js"

const EXTENSIONS: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export function extensionOf(mime: string) {
  const ext = EXTENSIONS[mime]
  if (!ext) throw new ValidationError(msg("media.badFormat"))
  return ext
}

export function addPhoto(db: Db, dataDir: string, copyId: number, bytes: Buffer, mime: string) {
  if (!db.prepare("SELECT 1 FROM copies WHERE id = ?").get(copyId)) throw new NotFoundError(msg("common.copyNotFound"))
  const file = `${copyId}-${randomUUID().slice(0, 8)}${extensionOf(mime)}`
  const dir = path.join(dataDir, PHOTOS_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, file), bytes)
  const id = Number(db.prepare("INSERT INTO copy_photos (copy_id, file) VALUES (?, ?)").run(copyId, file).lastInsertRowid)
  return { id, url: `/photos/${file}` }
}

export function deletePhoto(db: Db, dataDir: string, id: number) {
  const row = db.prepare("SELECT file FROM copy_photos WHERE id = ?").get(id) as { file: string } | undefined
  if (!row) throw new NotFoundError(msg("common.photoNotFound"))
  db.prepare("DELETE FROM copy_photos WHERE id = ?").run(id)
  removeFile(path.join(dataDir, PHOTOS_DIR, row.file))
}

/**
 * Remplace la jaquette d'un jeu. Le nom de fichier change à chaque fois : les jaquettes
 * sont servies avec un cache de 7 jours, un même nom garderait l'ancienne à l'écran.
 */
export function setCover(db: Db, dataDir: string, gameId: number, bytes: Buffer, mime: string, source: string, url: string | null = null) {
  const game = db.prepare("SELECT cover_file FROM games WHERE id = ?").get(gameId) as { cover_file: string | null } | undefined
  if (!game) throw new NotFoundError(msg("common.gameNotFound"))
  const file = `${gameId}-${Date.now().toString(36)}${extensionOf(mime)}`
  const dir = path.join(dataDir, COVERS_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, file), bytes)
  db.prepare("UPDATE games SET cover_file = ?, cover_source = ?, cover_url = ?, updated_at = datetime('now') WHERE id = ?").run(
    file,
    source,
    url,
    gameId,
  )
  if (game.cover_file) removeFile(path.join(dir, game.cover_file))
  return `/covers/${file}`
}

/**
 * Prend une photo d'exemplaire comme jaquette du jeu : c'est le geste attendu quand on
 * photographie sa boîte. La photo reste dans les photos de l'exemplaire, la jaquette en est
 * une copie (une jaquette remplacée plus tard n'efface donc pas la photo).
 */
export function setCoverFromPhoto(db: Db, dataDir: string, photoId: number) {
  const row = db.prepare("SELECT p.file, c.game_id FROM copy_photos p JOIN copies c ON c.id = p.copy_id WHERE p.id = ?").get(photoId) as
    | { file: string; game_id: number }
    | undefined
  if (!row) throw new NotFoundError(msg("common.photoNotFound"))
  const mime = Object.entries(EXTENSIONS).find(([, ext]) => row.file.toLowerCase().endsWith(ext))?.[0]
  if (!mime) throw new ValidationError(msg("media.badFormat"))
  const bytes = readFileSync(path.join(dataDir, PHOTOS_DIR, row.file))
  return { gameId: row.game_id, cover: setCover(db, dataDir, row.game_id, bytes, mime, "photo") }
}

/** Télécharge une image distante (jaquette IGDB) puis la pose comme jaquette. */
export async function setCoverFromUrl(db: Db, dataDir: string, gameId: number, url: string, source: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`Téléchargement de la jaquette : HTTP ${res.status}`)
  const mime = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg"
  return setCover(db, dataDir, gameId, Buffer.from(await res.arrayBuffer()), mime, source, url)
}
