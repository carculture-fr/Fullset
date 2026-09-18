import type { Db } from "./db.js"
import type { IgdbClient } from "./igdb.js"
import { setCoverFromUrl } from "./media.js"
import { normTitle } from "./sets.js"

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

/**
 * Jeu sans fiche IGDB (ajouté à la main, importé d'un vieil export) : on cherche par son titre
 * et on n'accepte qu'un résultat au **titre identique sur la bonne console**. Seule la jaquette
 * est posée : le résumé, l'éditeur et les dates ne changent pas sans un rattachement voulu.
 */
async function coverByTitle(igdb: IgdbClient, game: { title: string; platform: string }) {
  const candidates = await igdb.search(game.title)
  const match = candidates.find((c) => c.platforms.includes(game.platform) && normTitle(c.name) === normTitle(game.title))
  // La recherche rend une vignette ; la fiche mérite la grande taille.
  return match?.cover?.replace("t_cover_small_2x", "t_cover_big_2x") ?? null
}

export async function refreshMissingCovers(db: Db, dataDir: string, igdb: IgdbClient, fetchImpl: typeof fetch = fetch, limit = 40): Promise<CoverRefreshReport> {
  // Les jeux qui ont déjà leur fiche passent d'abord : leur jaquette est sûre.
  const todo = db
    .prepare("SELECT id, igdb_id, platform, title FROM games WHERE cover_file IS NULL ORDER BY igdb_id IS NULL, id LIMIT ?")
    .all(limit) as Array<{ id: number; igdb_id: number | null; platform: string; title: string }>
  const report: CoverRefreshReport = { looked: todo.length, downloaded: 0, remaining: 0, failed: [] }

  for (const [i, game] of todo.entries()) {
    if (i) await wait(300)
    try {
      const url =
        game.igdb_id !== null
          ? ((await igdb.game(game.igdb_id, game.platform)).cover_url ?? null)
          : await coverByTitle(igdb, game)
      if (!url) {
        report.failed.push(`${game.title} : ${game.igdb_id === null ? "aucune fiche IGDB au même titre sur cette console" : "IGDB n'a pas de jaquette pour cette fiche"}`)
        continue
      }
      await setCoverFromUrl(db, dataDir, game.id, url, "igdb", fetchImpl)
      report.downloaded += 1
    } catch (err) {
      report.failed.push(`${game.title} : ${(err as Error).message}`)
    }
  }

  report.remaining = (db.prepare("SELECT count(*) AS n FROM games WHERE cover_file IS NULL").get() as { n: number }).n
  return report
}
