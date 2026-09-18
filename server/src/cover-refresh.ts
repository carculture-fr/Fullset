import type { Db } from "./db.js"
import type { IgdbClient } from "./igdb.js"
import { setCoverFromUrl } from "./media.js"

/**
 * Rattrapage des jaquettes : un jeu peut avoir une fiche IGDB sans jaquette (import d'une liste
 * sans adresse d'image, téléchargement échoué à l'époque, jeu créé hors ligne). Ici on redemande
 * la fiche à IGDB et on pose l'image. IGDB n'accepte que quatre appels par seconde : on souffle
 * entre deux, et on travaille par paquets pour ne pas faire attendre l'écran.
 */

export type CoverRefreshReport = {
  /** Jeux examinés dans ce paquet. */
  looked: number
  downloaded: number
  /** Jeux encore sans jaquette après ce paquet (fiche IGDB connue). */
  remaining: number
  failed: string[]
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function refreshMissingCovers(db: Db, dataDir: string, igdb: IgdbClient, fetchImpl: typeof fetch = fetch, limit = 40): Promise<CoverRefreshReport> {
  const todo = db
    .prepare("SELECT id, igdb_id, platform, title FROM games WHERE cover_file IS NULL AND igdb_id IS NOT NULL ORDER BY id LIMIT ?")
    .all(limit) as Array<{ id: number; igdb_id: number; platform: string; title: string }>
  const report: CoverRefreshReport = { looked: todo.length, downloaded: 0, remaining: 0, failed: [] }

  for (const [i, game] of todo.entries()) {
    if (i) await wait(300)
    try {
      const meta = await igdb.game(game.igdb_id, game.platform)
      const url = meta.cover_url ?? meta.covers[0]?.url ?? null
      if (!url) {
        report.failed.push(`${game.title} : IGDB n'a pas de jaquette pour cette fiche`)
        continue
      }
      await setCoverFromUrl(db, dataDir, game.id, url, "igdb", fetchImpl)
      report.downloaded += 1
    } catch (err) {
      report.failed.push(`${game.title} : ${(err as Error).message}`)
    }
  }

  report.remaining = (db.prepare("SELECT count(*) AS n FROM games WHERE cover_file IS NULL AND igdb_id IS NOT NULL").get() as { n: number }).n
  return report
}
