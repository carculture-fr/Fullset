import { mkdirSync, writeFileSync } from "node:fs"
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
 * Télécharge dans <data>/covers/ les jaquettes connues par URL mais pas encore sur disque.
 * Le fichier porte l'id du jeu : une jaquette remplacée plus tard écrase la précédente.
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
      const file = `${game.id}${ext}`
      writeFileSync(path.join(dir, file), body)
      setFile.run(file, game.id)
      report.downloaded++
    } catch (err) {
      report.failed.push(`${game.title} : ${(err as Error).message}`)
    }
  }
  return report
}
