import { gameCoverOptions, type CoverOption } from "./cover-sources.js"
import type { Db } from "./db.js"
import { msg } from "./i18n.js"
import { setCover, setCoverFromUrl } from "./media.js"
import type { ScreenscraperClient } from "./screenscraper.js"

/**
 * Le scan des jaquettes : les jeux de la collection qui n'ont pas d'image la reçoivent, prise
 * chez la première source branchée qui en propose une (IGDB, ScreenScraper, SteamGridDB). Il se
 * lance au bouton (Réglages → Jaquettes) et tout seul à l'ajout d'un jeu, jamais la nuit : c'est
 * le choix de Tom, l'appli ne part rien chercher sans qu'on le lui demande.
 *
 * Les sources limitent leur débit (IGDB : quatre appels par seconde) : on souffle entre deux
 * jeux, et on travaille par paquets pour ne pas faire attendre l'écran.
 */

export type CoverRefreshReport = {
  /** Jeux examinés dans ce paquet. */
  looked: number
  downloaded: number
  /** Jeux encore sans jaquette après ce paquet. */
  remaining: number
  failed: string[]
}

type Sources = Parameters<typeof gameCoverOptions>[0] & { screenscraper(): ScreenscraperClient | null }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Pose l'image choisie : une adresse se télécharge, un repère passe par sa source. */
async function applyOption(db: Db, dataDir: string, gameId: number, option: CoverOption, sources: Sources, fetchImpl: typeof fetch) {
  if (option.url) return setCoverFromUrl(db, dataDir, gameId, option.url, option.source, fetchImpl)
  const client = sources.screenscraper()
  if (!client || !option.key) throw new Error(msg("screenscraper.notConfigured"))
  const { bytes, mime } = await client.media(option.key, 800)
  return setCover(db, dataDir, gameId, bytes, mime, option.source)
}

/** Cherche et pose la jaquette d'un jeu, s'il en manque une. Rend l'adresse posée, ou null. */
export async function coverOneGame(
  db: Db,
  dataDir: string,
  sources: Sources,
  game: { id: number; igdb_id: number | null; platform: string; title: string },
  fetchImpl: typeof fetch = fetch,
) {
  const [choix] = await gameCoverOptions(sources, game)
  if (!choix) return null
  return applyOption(db, dataDir, game.id, choix, sources, fetchImpl)
}

export async function refreshMissingCovers(db: Db, dataDir: string, sources: Sources, fetchImpl: typeof fetch = fetch, limit = 40): Promise<CoverRefreshReport> {
  // Les jeux qui ont déjà leur fiche passent d'abord : leur jaquette est la plus sûre.
  const todo = db
    .prepare("SELECT id, igdb_id, platform, title FROM games WHERE cover_file IS NULL ORDER BY igdb_id IS NULL, id LIMIT ?")
    .all(limit) as Array<{ id: number; igdb_id: number | null; platform: string; title: string }>
  const report: CoverRefreshReport = { looked: todo.length, downloaded: 0, remaining: 0, failed: [] }

  for (const [i, game] of todo.entries()) {
    if (i) await wait(300)
    try {
      const posee = await coverOneGame(db, dataDir, sources, game, fetchImpl)
      if (posee) report.downloaded += 1
      else report.failed.push(`${game.title} : ${msg("covers.noneFound")}`)
    } catch (err) {
      report.failed.push(`${game.title} : ${(err as Error).message}`)
    }
  }

  report.remaining = (db.prepare("SELECT count(*) AS n FROM games WHERE cover_file IS NULL").get() as { n: number }).n
  return report
}
