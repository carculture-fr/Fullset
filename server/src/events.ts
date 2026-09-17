import { NotFoundError, ValidationError } from "./copies.js"
import type { Db } from "./db.js"
import { EVENT_KINDS, EXIT_KINDS, RETURN_KIND, isExitKind, isoDate, text, toCents } from "./domain.js"
import { msg } from "./i18n.js"

/**
 * Le journal d'un exemplaire : ce qui lui arrive après l'achat (vendu, donné, prêté, en panne…).
 * Une sortie le retire de la bibliothèque sans rien effacer — `copies.status` porte la dernière
 * sortie en date, et un « Retour » le fait revenir. Rien n'est supprimé : l'historique reste.
 */

export type CopyEvent = {
  id: number
  copy_id: number
  kind: string
  happened_on: string
  amount_cents: number | null
  person: string | null
  comment: string | null
  created_at: string
}

export type JournalEntry = CopyEvent & {
  game_id: number
  title: string
  platform: string
  cover: string | null
  price_cents: number | null
}

const EVENT_COLUMNS = "id, copy_id, kind, happened_on, amount_cents, person, comment, created_at"

function validate(input: Record<string, unknown>) {
  const kind = text(input.kind)
  if (!kind || !(EVENT_KINDS as readonly string[]).includes(kind)) {
    throw new ValidationError(msg("common.notProposed", { field: msg("fields.eventKind"), value: kind ?? "" }))
  }
  const rawDate = text(input.happened_on)
  const happened_on = rawDate === null ? new Date().toISOString().slice(0, 10) : isoDate(rawDate)
  if (!happened_on) throw new ValidationError(msg("common.notADate", { field: msg("fields.eventDate"), value: rawDate ?? "" }))
  const rawAmount = text(input.amount)
  const amount_cents = toCents(rawAmount)
  if (rawAmount !== null && (amount_cents === null || amount_cents < 0)) {
    throw new ValidationError(msg("common.notAnAmount", { field: msg("fields.amount"), value: rawAmount }))
  }
  return { kind, happened_on, amount_cents, person: text(input.person), comment: text(input.comment) }
}

/** Statut de l'exemplaire = dernière sortie ou dernier retour en date ; sans rien, il est là. */
function refreshStatus(db: Db, copyId: number) {
  const marks = [...EXIT_KINDS, RETURN_KIND]
  const last = db
    .prepare(
      `SELECT kind, happened_on FROM copy_events
       WHERE copy_id = ? AND kind IN (${marks.map(() => "?").join(", ")})
       ORDER BY happened_on DESC, id DESC LIMIT 1`,
    )
    .get(copyId, ...marks) as { kind: string; happened_on: string } | undefined
  const out = last && isExitKind(last.kind)
  db.prepare("UPDATE copies SET status = ?, left_on = ?, updated_at = datetime('now') WHERE id = ?").run(out ? last.kind : null, out ? last.happened_on : null, copyId)
}

export function addEvent(db: Db, copyId: number, input: Record<string, unknown>): CopyEvent {
  const exists = db.prepare("SELECT id FROM copies WHERE id = ?").get(copyId)
  if (!exists) throw new NotFoundError(msg("common.copyNotFound"))
  const data = validate(input)
  const id = db.transaction(() => {
    const inserted = Number(
      db
        .prepare("INSERT INTO copy_events (copy_id, kind, happened_on, amount_cents, person, comment) VALUES (@copy_id, @kind, @happened_on, @amount_cents, @person, @comment)")
        .run({ copy_id: copyId, ...data }).lastInsertRowid,
    )
    refreshStatus(db, copyId)
    return inserted
  })()
  return db.prepare(`SELECT ${EVENT_COLUMNS} FROM copy_events WHERE id = ?`).get(id) as CopyEvent
}

export function deleteEvent(db: Db, id: number) {
  const row = db.prepare("SELECT copy_id FROM copy_events WHERE id = ?").get(id) as { copy_id: number } | undefined
  if (!row) throw new NotFoundError(msg("common.eventNotFound"))
  db.transaction(() => {
    db.prepare("DELETE FROM copy_events WHERE id = ?").run(id)
    refreshStatus(db, row.copy_id)
  })()
  return { copyId: row.copy_id }
}

/** Les événements des exemplaires d'un jeu, du plus récent au plus ancien. */
export function eventsByCopy(db: Db, gameId: number) {
  const rows = db
    .prepare(
      `SELECT ${EVENT_COLUMNS} FROM copy_events
       WHERE copy_id IN (SELECT id FROM copies WHERE game_id = ?)
       ORDER BY happened_on DESC, id DESC`,
    )
    .all(gameId) as CopyEvent[]
  const byCopy = new Map<number, CopyEvent[]>()
  for (const e of rows) byCopy.set(e.copy_id, [...(byCopy.get(e.copy_id) ?? []), e])
  return byCopy
}

/** Le journal de toute la collection : ce qui est arrivé, du plus récent au plus ancien. */
export function journal(db: Db, limit = 200): JournalEntry[] {
  return db
    .prepare(
      `SELECT e.id, e.copy_id, e.kind, e.happened_on, e.amount_cents, e.person, e.comment, e.created_at,
              g.id AS game_id, g.title, g.platform, g.cover_file, c.price_cents
       FROM copy_events e
       JOIN copies c ON c.id = e.copy_id
       JOIN games g ON g.id = c.game_id
       ORDER BY e.happened_on DESC, e.id DESC LIMIT ?`,
    )
    .all(Math.min(Math.max(limit, 1), 1000))
    .map((r) => {
      const { cover_file, ...rest } = r as JournalEntry & { cover_file: string | null }
      return { ...rest, cover: cover_file ? `/covers/${cover_file}` : null }
    })
}

export type ExitStats = {
  /** Exemplaires sortis de la collection, par motif. */
  byKind: Array<{ label: string; count: number; amountCents: number }>
  count: number
  soldCents: number
  /** Ce que les exemplaires vendus avaient coûté : la différence dit si la revente a rapporté. */
  costOfSoldCents: number
}

export function exitStats(db: Db): ExitStats {
  const byKind = db
    .prepare(
      `SELECT c.status AS label, count(*) AS count,
              coalesce(sum((SELECT e.amount_cents FROM copy_events e WHERE e.copy_id = c.id AND e.kind = c.status ORDER BY e.happened_on DESC, e.id DESC LIMIT 1)), 0) AS amountCents
       FROM copies c WHERE c.status IS NOT NULL GROUP BY c.status ORDER BY count DESC, label`,
    )
    .all() as ExitStats["byKind"]
  const sold = db
    .prepare(
      `SELECT coalesce(sum((SELECT e.amount_cents FROM copy_events e WHERE e.copy_id = c.id AND e.kind = 'Vendu' ORDER BY e.happened_on DESC, e.id DESC LIMIT 1)), 0) AS soldCents,
              coalesce(sum(c.price_cents), 0) AS costOfSoldCents
       FROM copies c WHERE c.status = 'Vendu'`,
    )
    .get() as { soldCents: number; costOfSoldCents: number }
  return { byKind, count: byKind.reduce((n, k) => n + k.count, 0), ...sold }
}
