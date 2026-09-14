import { NotFoundError, ValidationError } from "./copies.js"
import type { Db } from "./db.js"
import { isoDate, text, toCents } from "./domain.js"

/** Date du jour à Paris, au format ISO (le conteneur tourne en TZ=Europe/Paris). */
export const todayIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: process.env.TZ || "Europe/Paris" })

/**
 * Ajoute une estimation datée : l'historique est gardé, la plus récente fait foi.
 * Une cote sans date ne veut plus rien dire trois mois plus tard.
 */
/** Montant, date (aujourd'hui par défaut) et remarque d'une estimation, validés. */
export function parseValuation(input: Record<string, unknown>) {
  const raw = text(input.amount)
  const amount = toCents(raw)
  if (amount === null || amount < 0) throw new ValidationError(`Montant : « ${raw ?? ""} » n'est pas un montant.`)
  const rawDate = text(input.valued_on)
  const date = rawDate === null ? todayIso() : isoDate(rawDate)
  if (!date || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new ValidationError(`Date : « ${rawDate} » n'est pas une date.`)
  return { amount, date, note: text(input.note) }
}

export function addValuation(db: Db, copyId: number, input: Record<string, unknown>) {
  if (!db.prepare("SELECT 1 FROM copies WHERE id = ?").get(copyId)) throw new NotFoundError("Exemplaire introuvable.")
  const v = parseValuation(input)
  const res = db
    .prepare("INSERT INTO valuations (copy_id, amount_cents, valued_on, source, note) VALUES (?, ?, ?, 'manuel', ?)")
    .run(copyId, v.amount, v.date, v.note)
  return Number(res.lastInsertRowid)
}

export function deleteValuation(db: Db, id: number) {
  if (db.prepare("DELETE FROM valuations WHERE id = ?").run(id).changes === 0) throw new NotFoundError("Estimation introuvable.")
}

/** Sous-requêtes SQL de la dernière estimation d'un exemplaire (alias de table : copies). */
export const LATEST_VALUE_SQL = `
  (SELECT amount_cents FROM valuations v WHERE v.copy_id = copies.id ORDER BY v.valued_on DESC, v.id DESC LIMIT 1) AS value_cents,
  (SELECT valued_on FROM valuations v WHERE v.copy_id = copies.id ORDER BY v.valued_on DESC, v.id DESC LIMIT 1) AS valued_on`
