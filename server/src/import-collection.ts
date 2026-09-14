import { canonicalPlatform } from "./catalog.js"
import type { Db } from "./db.js"
import {
  CONDITIONS,
  CONTENTS,
  DIGITAL,
  GOALS,
  MANUAL_CONDITIONS,
  PLAY_STATUSES,
  REGIONS,
  SUPPORTS,
  UNDEFINED,
  isoDate,
  listValue,
  text,
  toCents,
} from "./domain.js"

/** Une entrée de collection.json (dépôt Proxmox, data/jeux-physiques/). */
export type CollectionEntry = Record<string, unknown>

export type ImportReport = {
  games: number
  copies: number
  totalCents: number
  toMatch: string[]
  warnings: string[]
}

export class CollectionNotEmptyError extends Error {}

/**
 * Premier import de la collection. Refusé si des exemplaires existent déjà :
 * rejouer l'import doublerait tout, et il n'y a aucune clé fiable pour rapprocher.
 * Deux entrées de même (igdb_id, plateforme) deviennent deux exemplaires du même jeu.
 */
export function importCollection(db: Db, entries: CollectionEntry[]): ImportReport {
  const existing = (db.prepare("SELECT count(*) AS n FROM copies").get() as { n: number }).n
  if (existing > 0) throw new CollectionNotEmptyError(`La collection contient déjà ${existing} exemplaires : import refusé.`)

  const report: ImportReport = { games: 0, copies: 0, totalCents: 0, toMatch: [], warnings: [] }
  const findGame = db.prepare("SELECT id FROM games WHERE igdb_id = ? AND platform = ?")
  const insertGame = db.prepare(`
    INSERT INTO games (igdb_id, platform, title, summary, developer, publisher, release_date, genres,
                       game_modes, perspective, series, pegi, igdb_rating, igdb_url, cover_url, cover_source)
    VALUES (@igdb_id, @platform, @title, @summary, @developer, @publisher, @release_date, @genres,
            @game_modes, @perspective, @series, @pegi, @igdb_rating, @igdb_url, @cover_url, @cover_source)`)
  const insertCopy = db.prepare(`
    INSERT INTO copies (game_id, title_as_entered, support, region, edition, content, condition_game,
                        condition_box, condition_manual, play_status, goal, quantity, price_cents,
                        purchase_date, purchase_place, comment)
    VALUES (@game_id, @title_as_entered, @support, @region, @edition, @content, @condition_game,
            @condition_box, @condition_manual, @play_status, @goal, @quantity, @price_cents,
            @purchase_date, @purchase_place, @comment)`)

  const check = (label: string, value: string | null, allowed: readonly string[], name: string) => {
    if (value !== null && !allowed.includes(value)) report.warnings.push(`${name} : ${label} « ${value} » hors liste, conservé tel quel`)
    return value
  }

  db.transaction(() => {
    for (const e of entries) {
      const name = text(e.nom) ?? "(sans nom)"
      const platform = canonicalPlatform(text(e.plateforme) ?? "Inconnue")
      const igdbId = typeof e.igdb_id === "number" ? e.igdb_id : null

      let gameId = igdbId === null ? undefined : (findGame.get(igdbId, platform) as { id: number } | undefined)?.id
      if (gameId === undefined) {
        const coverUrl = text(e.jaquette_url)
        gameId = Number(
          insertGame.run({
            igdb_id: igdbId,
            platform,
            title: text(e.igdb_nom) ?? name,
            summary: text(e.resume),
            developer: text(e["Développeur"]),
            publisher: text(e["Éditeur"]),
            release_date: isoDate(e["Date de sortie"]),
            genres: text(e.Genres),
            game_modes: text(e["Modes de jeu"]),
            perspective: text(e.Vue),
            series: text(e["Série"]),
            pegi: text(e.PEGI),
            igdb_rating: Number(text(e["Note IGDB"])?.match(/^(\d+)\/100$/)?.[1]) || null,
            igdb_url: text(e["Fiche IGDB"]),
            cover_url: coverUrl,
            cover_source: coverUrl ? "igdb" : null,
          }).lastInsertRowid,
        )
        report.games++
        if (igdbId === null) report.toMatch.push(`${name} (${platform})`)
      }

      const support = check("support", listValue(e.support), SUPPORTS, name)
      const digital = support === DIGITAL
      // Les états n'ont pas de sens pour une clé Steam : on ne les invente pas.
      const cond = (key: string, allowed: readonly string[]) =>
        digital ? null : check(key, listValue(e[key]), allowed, name)
      const priceCents = toCents(e.prix_achat)

      insertCopy.run({
        game_id: gameId,
        title_as_entered: name,
        support: support ?? "Physique",
        region: check("région", listValue(e["Région"]), REGIONS, name),
        edition: text(e["Édition"]),
        content: check("contenu", listValue(e.Contenu) ?? UNDEFINED, CONTENTS, name),
        condition_game: cond("État du jeu", CONDITIONS),
        condition_box: cond("État de la boîte", CONDITIONS),
        condition_manual: cond("État de la notice", MANUAL_CONDITIONS),
        play_status: check("statut", listValue(e.Statut), PLAY_STATUSES, name),
        goal: check("objectif", listValue(e.Objectif), GOALS, name),
        quantity: typeof e.quantite === "number" && e.quantite > 0 ? e.quantite : 1,
        price_cents: priceCents,
        purchase_date: isoDate(e.date_achat),
        purchase_place: text(e.lieu_achat),
        comment: text(e.note_perso),
      })
      report.copies++
      report.totalCents += priceCents ?? 0
    }
  })()

  return report
}
