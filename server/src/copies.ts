import { unlinkSync } from "node:fs"
import path from "node:path"

import { COVERS_DIR } from "./covers.js"
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
  isoDate,
  text,
  toCents,
} from "./domain.js"

export const PHOTOS_DIR = "photos"

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

type Input = Record<string, unknown>

const COPY_FIELDS = [
  "title_as_entered",
  "support",
  "region",
  "edition",
  "content",
  "condition_game",
  "condition_box",
  "condition_manual",
  "play_status",
  "goal",
  "quantity",
  "price_cents",
  "purchase_date",
  "purchase_place",
  "completion_date",
  "play_time_hours",
  "completion_pct",
  "rating",
  "tags",
  "barcode",
  "comment",
] as const

type CopyData = Record<(typeof COPY_FIELDS)[number], string | number | null>

/**
 * Valide un exemplaire envoyé par le formulaire. Les listes fermées refusent une valeur
 * inconnue ; le prix arrive en euros (« 12,50 ») et repart en centimes.
 */
export function validateCopy(input: Input, defaultTitle: string): CopyData {
  const errors: string[] = []
  const pick = (key: string, allowed: readonly string[], label: string) => {
    const v = text(input[key])
    if (v !== null && !allowed.includes(v)) errors.push(`${label} : « ${v} » n'est pas une valeur proposée.`)
    return v
  }
  const number = (key: string, label: string, { min, max, integer }: { min?: number; max?: number; integer?: boolean }) => {
    const raw = text(input[key])
    if (raw === null) return null
    const n = Number(raw.replace(",", "."))
    if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
      errors.push(`${label} : « ${raw} » n'est pas valide.`)
      return null
    }
    return n
  }
  const date = (key: string, label: string) => {
    const raw = text(input[key])
    const iso = isoDate(raw)
    // Aller-retour par Date : « 2026-02-31 » deviendrait le 3 mars, on le refuse.
    const real = iso !== null && new Date(`${iso}T00:00:00Z`).toISOString?.().slice(0, 10) === iso
    if (raw !== null && !real) {
      errors.push(`${label} : « ${raw} » n'est pas une date.`)
      return null
    }
    return iso
  }

  const support = pick("support", SUPPORTS, "Support")
  if (support === null) errors.push("Le support est obligatoire.")
  const digital = support === DIGITAL
  const price = text(input.price)
  const priceCents = toCents(price)
  if (price !== null && (priceCents === null || priceCents < 0)) errors.push(`Prix : « ${price} » n'est pas un montant.`)

  const data: CopyData = {
    title_as_entered: text(input.title_as_entered) ?? defaultTitle,
    support,
    region: pick("region", REGIONS, "Région"),
    edition: text(input.edition),
    // Une clé Steam n'a ni boîte ni notice : on n'enregistre pas d'état inventé.
    content: digital ? DIGITAL : pick("content", CONTENTS, "Contenu"),
    condition_game: digital ? null : pick("condition_game", CONDITIONS, "État du jeu"),
    condition_box: digital ? null : pick("condition_box", CONDITIONS, "État de la boîte"),
    condition_manual: digital ? null : pick("condition_manual", MANUAL_CONDITIONS, "État de la notice"),
    play_status: pick("play_status", PLAY_STATUSES, "Statut"),
    goal: pick("goal", GOALS, "Objectif"),
    quantity: number("quantity", "Quantité", { min: 1, integer: true }) ?? 1,
    price_cents: priceCents,
    purchase_date: date("purchase_date", "Date d'achat"),
    purchase_place: text(input.purchase_place),
    completion_date: date("completion_date", "Date d'achèvement"),
    play_time_hours: number("play_time_hours", "Durée", { min: 0 }),
    completion_pct: number("completion_pct", "Pourcentage", { min: 0, max: 100, integer: true }),
    rating: number("rating", "Note", { min: 0, max: 100, integer: true }),
    tags: text(input.tags),
    barcode: text(input.barcode),
    comment: text(input.comment),
  }
  if (errors.length) throw new ValidationError(errors.join(" "))
  return data
}

const gameTitle = (db: Db, gameId: number) => {
  const g = db.prepare("SELECT title FROM games WHERE id = ?").get(gameId) as { title: string } | undefined
  if (!g) throw new NotFoundError("Jeu introuvable.")
  return g.title
}

export function createCopy(db: Db, gameId: number, input: Input): number {
  const data = validateCopy(input, gameTitle(db, gameId))
  const cols = ["game_id", ...COPY_FIELDS]
  const res = db
    .prepare(`INSERT INTO copies (${cols.join(", ")}) VALUES (${cols.map((c) => `@${c}`).join(", ")})`)
    .run({ game_id: gameId, ...data })
  return Number(res.lastInsertRowid)
}

/** Remplace tous les champs de l'exemplaire : le formulaire renvoie toujours la fiche complète. */
export function updateCopy(db: Db, id: number, input: Input) {
  const row = db.prepare("SELECT game_id FROM copies WHERE id = ?").get(id) as { game_id: number } | undefined
  if (!row) throw new NotFoundError("Exemplaire introuvable.")
  const data = validateCopy(input, gameTitle(db, row.game_id))
  db.prepare(`UPDATE copies SET ${COPY_FIELDS.map((c) => `${c} = @${c}`).join(", ")}, updated_at = datetime('now') WHERE id = @id`).run({
    id,
    ...data,
  })
  return row.game_id
}

const removeFile = (file: string) => {
  try {
    unlinkSync(file)
  } catch {
    // Déjà absent : rien à faire.
  }
}

/**
 * Supprime l'exemplaire et ses photos. Un jeu sans exemplaire n'a plus de raison d'être
 * dans la bibliothèque : il part avec sa jaquette (la liste de souhaits est une table à part).
 */
export function deleteCopy(db: Db, dataDir: string, id: number) {
  const row = db.prepare("SELECT game_id FROM copies WHERE id = ?").get(id) as { game_id: number } | undefined
  if (!row) throw new NotFoundError("Exemplaire introuvable.")
  const photos = db.prepare("SELECT file FROM copy_photos WHERE copy_id = ?").all(id) as Array<{ file: string }>
  let gameDeleted = false
  let coverFile: string | null = null
  db.transaction(() => {
    db.prepare("DELETE FROM copies WHERE id = ?").run(id)
    const left = (db.prepare("SELECT count(*) AS n FROM copies WHERE game_id = ?").get(row.game_id) as { n: number }).n
    if (left === 0) {
      coverFile = (db.prepare("SELECT cover_file FROM games WHERE id = ?").get(row.game_id) as { cover_file: string | null }).cover_file
      db.prepare("DELETE FROM games WHERE id = ?").run(row.game_id)
      gameDeleted = true
    }
  })()
  for (const p of photos) removeFile(path.join(dataDir, PHOTOS_DIR, p.file))
  if (coverFile) removeFile(path.join(dataDir, COVERS_DIR, coverFile))
  return { gameId: row.game_id, gameDeleted }
}

export { removeFile }
