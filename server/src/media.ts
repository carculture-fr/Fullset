import { randomUUID } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import { NotFoundError, PHOTOS_DIR, ValidationError, removeFile } from "./copies.js"
import { COVERS_DIR } from "./covers.js"
import type { Db } from "./db.js"

const EXTENSIONS: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export function extensionOf(mime: string) {
  const ext = EXTENSIONS[mime]
  if (!ext) throw new ValidationError("Format d'image non pris en charge (JPEG, PNG ou WebP).")
  return ext
}

export function addPhoto(db: Db, dataDir: string, copyId: number, bytes: Buffer, mime: string) {
  if (!db.prepare("SELECT 1 FROM copies WHERE id = ?").get(copyId)) throw new NotFoundError("Exemplaire introuvable.")
  const file = `${copyId}-${randomUUID().slice(0, 8)}${extensionOf(mime)}`
  const dir = path.join(dataDir, PHOTOS_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, file), bytes)
  const id = Number(db.prepare("INSERT INTO copy_photos (copy_id, file) VALUES (?, ?)").run(copyId, file).lastInsertRowid)
  return { id, url: `/photos/${file}` }
}

export function deletePhoto(db: Db, dataDir: string, id: number) {
  const row = db.prepare("SELECT file FROM copy_photos WHERE id = ?").get(id) as { file: string } | undefined
  if (!row) throw new NotFoundError("Photo introuvable.")
  db.prepare("DELETE FROM copy_photos WHERE id = ?").run(id)
  removeFile(path.join(dataDir, PHOTOS_DIR, row.file))
}

/**
 * Remplace la jaquette d'un jeu. Le nom de fichier change à chaque fois : les jaquettes
 * sont servies avec un cache de 7 jours, un même nom garderait l'ancienne à l'écran.
 */
export function setCover(db: Db, dataDir: string, gameId: number, bytes: Buffer, mime: string, source: string, url: string | null = null) {
  const game = db.prepare("SELECT cover_file FROM games WHERE id = ?").get(gameId) as { cover_file: string | null } | undefined
  if (!game) throw new NotFoundError("Jeu introuvable.")
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

/** Télécharge une image distante (jaquette IGDB) puis la pose comme jaquette. */
export async function setCoverFromUrl(db: Db, dataDir: string, gameId: number, url: string, source: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`Téléchargement de la jaquette : HTTP ${res.status}`)
  const mime = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg"
  return setCover(db, dataDir, gameId, Buffer.from(await res.arrayBuffer()), mime, source, url)
}
