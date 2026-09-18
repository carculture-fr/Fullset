import { NotFoundError, ValidationError } from "./copies.js"
import type { Db } from "./db.js"
import { EVENT_KINDS, EXIT_KINDS, RETURN_KIND, isExitKind, isoDate, text, toCents } from "./domain.js"
import { msg } from "./i18n.js"

/**
 * Le journal d'un exemplaire de jeu ou d'un élément de matériel : ce qui lui arrive après
 * l'achat (vendu, donné, prêté, en panne…). Une sortie le retire de la bibliothèque sans rien
 * effacer — la colonne `status` porte la dernière sortie en date, et un « Retour » le fait
 * revenir. Les deux familles partagent le même code : seules la table et la colonne changent.
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

/** Même forme pour un élément de matériel. */
export type HardwareEvent = Omit<CopyEvent, "copy_id"> & { hardware_id: number }

export type JournalEntry = {
  id: number
  kind: string
  happened_on: string
  amount_cents: number | null
  person: string | null
  comment: string | null
  /** L'un des deux est renseigné : le journal mêle les jeux et le matériel. */
  game_id: number | null
  hardware_id: number | null
  title: string
  platform: string
  cover: string | null
  price_cents: number | null
}

type Target = {
  table: "copy_events" | "hardware_events"
  column: "copy_id" | "hardware_id"
  owner: "copies" | "hardware"
  notFound: string
}

const COPY: Target = { table: "copy_events", column: "copy_id", owner: "copies", notFound: "common.copyNotFound" }
const HARDWARE: Target = { table: "hardware_events", column: "hardware_id", owner: "hardware", notFound: "hardware.notFound" }

const COLUMNS = (t: Target) => `id, ${t.column}, kind, happened_on, amount_cents, person, comment, created_at`

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

/** Statut = dernière sortie ou dernier retour en date ; sans rien, l'objet est là. */
function refreshStatus(db: Db, target: Target, itemId: number) {
  const marks = [...EXIT_KINDS, RETURN_KIND]
  const last = db
    .prepare(
      `SELECT kind, happened_on FROM ${target.table}
       WHERE ${target.column} = ? AND kind IN (${marks.map(() => "?").join(", ")})
       ORDER BY happened_on DESC, id DESC LIMIT 1`,
    )
    .get(itemId, ...marks) as { kind: string; happened_on: string } | undefined
  const out = last && isExitKind(last.kind)
  db.prepare(`UPDATE ${target.owner} SET status = ?, left_on = ?, updated_at = datetime('now') WHERE id = ?`).run(out ? last.kind : null, out ? last.happened_on : null, itemId)
}

function add(db: Db, target: Target, itemId: number, input: Record<string, unknown>) {
  if (!db.prepare(`SELECT 1 FROM ${target.owner} WHERE id = ?`).get(itemId)) throw new NotFoundError(msg(target.notFound))
  const data = validate(input)
  const id = db.transaction(() => {
    const inserted = Number(
      db
        .prepare(
          `INSERT INTO ${target.table} (${target.column}, kind, happened_on, amount_cents, person, comment)
           VALUES (@item, @kind, @happened_on, @amount_cents, @person, @comment)`,
        )
        .run({ item: itemId, ...data }).lastInsertRowid,
    )
    refreshStatus(db, target, itemId)
    return inserted
  })()
  return db.prepare(`SELECT ${COLUMNS(target)} FROM ${target.table} WHERE id = ?`).get(id)
}

function remove(db: Db, target: Target, id: number) {
  const row = db.prepare(`SELECT ${target.column} AS item FROM ${target.table} WHERE id = ?`).get(id) as { item: number } | undefined
  if (!row) throw new NotFoundError(msg("common.eventNotFound"))
  db.transaction(() => {
    db.prepare(`DELETE FROM ${target.table} WHERE id = ?`).run(id)
    refreshStatus(db, target, row.item)
  })()
  return { id: row.item }
}

export const addEvent = (db: Db, copyId: number, input: Record<string, unknown>) => add(db, COPY, copyId, input) as CopyEvent
export const deleteEvent = (db: Db, id: number) => ({ copyId: remove(db, COPY, id).id })
export const addHardwareEvent = (db: Db, hardwareId: number, input: Record<string, unknown>) => add(db, HARDWARE, hardwareId, input) as HardwareEvent
export const deleteHardwareEvent = (db: Db, id: number) => ({ hardwareId: remove(db, HARDWARE, id).id })

/** Les événements des exemplaires d'un jeu, du plus récent au plus ancien. */
export function eventsByCopy(db: Db, gameId: number) {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS(COPY)} FROM copy_events
       WHERE copy_id IN (SELECT id FROM copies WHERE game_id = ?)
       ORDER BY happened_on DESC, id DESC`,
    )
    .all(gameId) as CopyEvent[]
  const byCopy = new Map<number, CopyEvent[]>()
  for (const e of rows) byCopy.set(e.copy_id, [...(byCopy.get(e.copy_id) ?? []), e])
  return byCopy
}

/** Les événements d'un élément de matériel. */
export const hardwareEvents = (db: Db, hardwareId: number) =>
  db.prepare(`SELECT ${COLUMNS(HARDWARE)} FROM hardware_events WHERE hardware_id = ? ORDER BY happened_on DESC, id DESC`).all(hardwareId) as HardwareEvent[]

// Après un UNION ALL, SQLite n'accepte au tri que les positions de colonnes : 3 = happened_on, 1 = id.
const JOURNAL_SQL = `
  SELECT e.id AS id, e.kind AS kind, e.happened_on AS happened_on, e.amount_cents AS amount_cents, e.person AS person, e.comment AS comment,
         g.id AS game_id, NULL AS hardware_id, g.title AS title, g.platform AS platform, g.cover_file AS cover_file, c.price_cents AS price_cents
  FROM copy_events e JOIN copies c ON c.id = e.copy_id JOIN games g ON g.id = c.game_id
  UNION ALL
  SELECT e.id AS id, e.kind AS kind, e.happened_on AS happened_on, e.amount_cents AS amount_cents, e.person AS person, e.comment AS comment,
         NULL AS game_id, h.id AS hardware_id, h.platform || coalesce(' ' || h.model, '') AS title, h.platform AS platform, h.image_file AS cover_file, h.price_cents AS price_cents
  FROM hardware_events e JOIN hardware h ON h.id = e.hardware_id
  ORDER BY 3 DESC, 1 DESC LIMIT ?`

/** Le journal de toute la collection, jeux et matériel mêlés, du plus récent au plus ancien. */
export function journal(db: Db, limit = 200): JournalEntry[] {
  return db
    .prepare(JOURNAL_SQL)
    .all(Math.min(Math.max(limit, 1), 1000))
    .map((r) => {
      const { cover_file, ...rest } = r as JournalEntry & { cover_file: string | null }
      return { ...rest, cover: cover_file ? `/covers/${cover_file}` : null }
    })
}

/** Ce qui est sorti et n'est pas revenu : prêts en cours, ventes, pannes. */
export function currentExits(db: Db): JournalEntry[] {
  return journal(db, 1000).filter((e) => isExitKind(e.kind) && isCurrent(db, e))
}

/** L'événement est-il toujours la dernière sortie de son objet ? (sinon il y a eu un retour) */
function isCurrent(db: Db, entry: JournalEntry) {
  const row =
    entry.game_id !== null
      ? (db.prepare("SELECT c.status FROM copy_events e JOIN copies c ON c.id = e.copy_id WHERE e.id = ?").get(entry.id) as { status: string | null } | undefined)
      : (db.prepare("SELECT h.status FROM hardware_events e JOIN hardware h ON h.id = e.hardware_id WHERE e.id = ?").get(entry.id) as { status: string | null } | undefined)
  return row?.status === entry.kind
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
