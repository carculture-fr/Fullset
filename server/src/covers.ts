import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"

import type { Db } from "./db.js"

export const COVERS_DIR = "covers"

export type CoversReport = { downloaded: number; failed: string[] }

// Une adresse de jaquette peut venir d'un fichier importé : seul le serveur d'images d'IGDB est
// admis, sans suivre de redirection, et seul un vrai fichier image est gardé. Sinon un import
// piégé ferait lire au serveur une adresse interne, ou déposerait une page HTML sous /covers/.
const IGDB_IMAGES = "https://images.igdb.com/"
const MAX_COVER_BYTES = 10 * 1024 * 1024
const EXTENSIONS: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }

export const isIgdbImage = (url: string) => url.startsWith(IGDB_IMAGES)

/**
 * Nom de fichier d'une jaquette : l'id du jeu, puis un suffixe qui change à chaque image. Une
 * adresse ne doit jamais servir deux images différentes : les jaquettes sont gardées sept jours
 * par le navigateur et trois mois par l'application installée, et deux collections successives
 * sur la même adresse ne donnent pas le même id au même jeu.
 */
export const coverFileName = (gameId: number, ext: string) => `${gameId}-${Date.now().toString(36)}${ext}`

/** Jaquettes des versions d'avant : le nom ne portait que l'id du jeu. */
const LEGACY_NAME = /^(\d+)\.(jpg|png|webp)$/

/**
 * Donne un nom unique aux jaquettes nommées d'après le seul id du jeu. Sans cela, une collection
 * remplacée (import dans une installation neuve) réutilise « /covers/1.jpg » pour un autre jeu :
 * un navigateur qui a gardé l'image d'avant affiche alors la jaquette d'un jeu qui n'est plus là.
 * Passage unique, au démarrage.
 */
export function renameLegacyCovers(db: Db, dataDir: string) {
  const dir = path.join(dataDir, COVERS_DIR)
  const rows = db.prepare("SELECT id, cover_file FROM games WHERE cover_file IS NOT NULL").all() as Array<{ id: number; cover_file: string }>
  const update = db.prepare("UPDATE games SET cover_file = ? WHERE id = ?")
  let renamed = 0
  for (const row of rows) {
    const match = LEGACY_NAME.exec(row.cover_file)
    if (!match) continue
    const file = coverFileName(row.id, `.${match[2]}`)
    try {
      renameSync(path.join(dir, row.cover_file), path.join(dir, file))
    } catch {
      // Fichier absent : on laisse la base tranquille, le rattrapage des jaquettes s'en chargera.
      continue
    }
    update.run(file, row.id)
    renamed += 1
  }
  return renamed
}

/**
 * Télécharge dans <data>/covers/ les jaquettes connues par URL mais pas encore sur disque.
 */
export async function downloadMissingCovers(db: Db, dataDir: string, fetchImpl: typeof fetch = fetch): Promise<CoversReport> {
  const dir = path.join(dataDir, COVERS_DIR)
  mkdirSync(dir, { recursive: true })
  const todo = db
    .prepare("SELECT id, title, cover_url FROM games WHERE cover_url IS NOT NULL AND cover_file IS NULL ORDER BY id")
    .all() as Array<{ id: number; title: string; cover_url: string }>
  const setFile = db.prepare("UPDATE games SET cover_file = ?, updated_at = datetime('now') WHERE id = ?")
  const report: CoversReport = { downloaded: 0, failed: [] }

  for (const game of todo) {
    try {
      if (!isIgdbImage(game.cover_url)) throw new Error("adresse refusée (seules les images IGDB sont téléchargées)")
      const res = await fetchImpl(game.cover_url, { signal: AbortSignal.timeout(20_000), redirect: "error" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const ext = EXTENSIONS[(res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()]
      if (!ext) throw new Error("ce n'est pas une image JPEG, PNG ou WebP")
      if (Number(res.headers.get("content-length") ?? 0) > MAX_COVER_BYTES) throw new Error("image trop lourde")
      const body = Buffer.from(await res.arrayBuffer())
      if (body.length > MAX_COVER_BYTES) throw new Error("image trop lourde")
      const file = coverFileName(game.id, ext)
      writeFileSync(path.join(dir, file), body)
      setFile.run(file, game.id)
      report.downloaded++
    } catch (err) {
      report.failed.push(`${game.title} : ${(err as Error).message}`)
    }
  }
  return report
}
