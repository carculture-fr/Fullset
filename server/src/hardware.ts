// Matériel : consoles, manettes et accessoires. Même logique que les exemplaires de jeux —
// trois états, contenu, achat, photos, estimations datées — sans fiche IGDB.
import { randomUUID } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import { canonicalPlatform, rememberPlatform } from "./catalog.js"
import { NotFoundError, PHOTOS_DIR, ValidationError, removeFile } from "./copies.js"
import { COVERS_DIR } from "./covers.js"
import type { Db } from "./db.js"
import { CONDITIONS, HW_CONTENTS, HW_KINDS, HW_WORKING, MANUAL_CONDITIONS, REGIONS, isoDate, text, toCents } from "./domain.js"
import { extensionOf } from "./media.js"
import { parseValuation } from "./valuations.js"

export const HW_FIELDS = [
  "kind",
  "platform",
  "model",
  "edition",
  "color",
  "region",
  "content",
  "condition_item",
  "condition_box",
  "condition_manual",
  "working",
  "price_cents",
  "purchase_date",
  "purchase_place",
  "serial_number",
  "comment",
] as const

type HwData = Record<(typeof HW_FIELDS)[number], string | number | null>

export type HardwareItem = HwData & {
  id: number
  value_cents: number | null
  valued_on: string | null
  photo: string | null
  photo_count: number
  /** Image par défaut (Commons), affichée quand il n'y a pas de photo. */
  image: string | null
  image_credit: string | null
  image_page: string | null
}

export function validateHardware(input: Record<string, unknown>): HwData {
  const errors: string[] = []
  const pick = (key: string, allowed: readonly string[], label: string) => {
    const v = text(input[key])
    if (v !== null && !allowed.includes(v)) errors.push(`${label} : « ${v} » n'est pas une valeur proposée.`)
    return v
  }
  const kind = pick("kind", HW_KINDS, "Type")
  if (!kind) errors.push("Le type est obligatoire.")
  const rawPlatform = text(input.platform)
  const platform = rawPlatform && canonicalPlatform(rawPlatform)
  if (!platform) errors.push("La console (plateforme) est obligatoire.")
  const price = text(input.price)
  const priceCents = toCents(price)
  if (price !== null && (priceCents === null || priceCents < 0)) errors.push(`Prix : « ${price} » n'est pas un montant.`)
  const rawDate = text(input.purchase_date)
  const date = isoDate(rawDate)
  if (rawDate !== null && (!date || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) errors.push(`Date d'achat : « ${rawDate} » n'est pas une date.`)
  const data: HwData = {
    kind,
    platform,
    model: text(input.model),
    edition: text(input.edition),
    color: text(input.color),
    region: pick("region", REGIONS, "Région"),
    content: pick("content", HW_CONTENTS, "Contenu"),
    condition_item: pick("condition_item", CONDITIONS, "État"),
    condition_box: pick("condition_box", CONDITIONS, "État de la boîte"),
    condition_manual: pick("condition_manual", MANUAL_CONDITIONS, "État de la notice"),
    working: pick("working", HW_WORKING, "Fonctionnement"),
    price_cents: priceCents,
    purchase_date: date,
    purchase_place: text(input.purchase_place),
    serial_number: text(input.serial_number),
    comment: text(input.comment),
  }
  if (errors.length) throw new ValidationError(errors.join(" "))
  return data
}

const LATEST = `
  (SELECT amount_cents FROM hardware_valuations v WHERE v.hardware_id = hardware.id ORDER BY v.valued_on DESC, v.id DESC LIMIT 1) AS value_cents,
  (SELECT valued_on FROM hardware_valuations v WHERE v.hardware_id = hardware.id ORDER BY v.valued_on DESC, v.id DESC LIMIT 1) AS valued_on,
  (SELECT file FROM hardware_photos p WHERE p.hardware_id = hardware.id ORDER BY p.id LIMIT 1) AS photo_file,
  (SELECT count(*) FROM hardware_photos p WHERE p.hardware_id = hardware.id) AS photo_count`

export function listHardware(db: Db): HardwareItem[] {
  const rows = db
    .prepare(`SELECT id, ${HW_FIELDS.join(", ")}, image_file, image_credit, image_page, ${LATEST} FROM hardware ORDER BY platform, kind, id`)
    .all() as Array<Omit<HardwareItem, "photo" | "image"> & { photo_file: string | null; image_file: string | null }>
  return rows.map(({ photo_file, image_file, ...r }) => ({
    ...r,
    photo: photo_file ? `/photos/${photo_file}` : null,
    image: image_file ? `/covers/${image_file}` : null,
  }))
}

export function getHardware(db: Db, id: number) {
  const item = listHardware(db).find((h) => h.id === id)
  if (!item) throw new NotFoundError("Élément introuvable.")
  const photos = (db.prepare("SELECT id, file FROM hardware_photos WHERE hardware_id = ? ORDER BY id").all(id) as Array<{ id: number; file: string }>).map((p) => ({
    id: p.id,
    url: `/photos/${p.file}`,
  }))
  const valuations = db
    .prepare("SELECT id, amount_cents, valued_on, source, note FROM hardware_valuations WHERE hardware_id = ? ORDER BY valued_on DESC, id DESC")
    .all(id)
  return { ...item, photos, valuations }
}

export function createHardware(db: Db, input: Record<string, unknown>) {
  const data = validateHardware(input)
  rememberPlatform(db, data.platform, data.model)
  return Number(db.prepare(`INSERT INTO hardware (${HW_FIELDS.join(", ")}) VALUES (${HW_FIELDS.map((f) => `@${f}`).join(", ")})`).run(data).lastInsertRowid)
}

export function updateHardware(db: Db, id: number, input: Record<string, unknown>) {
  const data = validateHardware(input)
  rememberPlatform(db, data.platform, data.model)
  const res = db.prepare(`UPDATE hardware SET ${HW_FIELDS.map((f) => `${f} = @${f}`).join(", ")}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id })
  if (res.changes === 0) throw new NotFoundError("Élément introuvable.")
}

export function deleteHardware(db: Db, dataDir: string, id: number) {
  const files = db.prepare("SELECT file FROM hardware_photos WHERE hardware_id = ?").all(id) as Array<{ file: string }>
  const image = imageFile(db, id)
  if (db.prepare("DELETE FROM hardware WHERE id = ?").run(id).changes === 0) throw new NotFoundError("Élément introuvable.")
  for (const f of files) removeFile(path.join(dataDir, PHOTOS_DIR, f.file))
  if (image) removeFile(path.join(dataDir, COVERS_DIR, image))
}

const imageFile = (db: Db, id: number) => {
  const row = db.prepare("SELECT image_file FROM hardware WHERE id = ?").get(id) as { image_file: string | null } | undefined
  if (!row) throw new NotFoundError("Élément introuvable.")
  return row.image_file
}

/** Pose l'image par défaut ; un nouveau nom à chaque fois, les jaquettes étant en cache 7 jours. */
export function setHardwareImage(db: Db, dataDir: string, id: number, bytes: Buffer, mime: string, credit: string | null, page: string | null) {
  const previous = imageFile(db, id)
  const file = `hw-${id}-${randomUUID().slice(0, 8)}${extensionOf(mime)}`
  const dir = path.join(dataDir, COVERS_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, file), bytes)
  db.prepare("UPDATE hardware SET image_file = ?, image_credit = ?, image_page = ? WHERE id = ?").run(file, credit, page, id)
  if (previous) removeFile(path.join(dir, previous))
  return `/covers/${file}`
}

export function clearHardwareImage(db: Db, dataDir: string, id: number) {
  const previous = imageFile(db, id)
  db.prepare("UPDATE hardware SET image_file = NULL, image_credit = NULL, image_page = NULL WHERE id = ?").run(id)
  if (previous) removeFile(path.join(dataDir, COVERS_DIR, previous))
}

export function addHardwarePhoto(db: Db, dataDir: string, id: number, bytes: Buffer, mime: string) {
  if (!db.prepare("SELECT 1 FROM hardware WHERE id = ?").get(id)) throw new NotFoundError("Élément introuvable.")
  const file = `hw-${id}-${randomUUID().slice(0, 8)}${extensionOf(mime)}`
  const dir = path.join(dataDir, PHOTOS_DIR)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, file), bytes)
  const photoId = Number(db.prepare("INSERT INTO hardware_photos (hardware_id, file) VALUES (?, ?)").run(id, file).lastInsertRowid)
  return { id: photoId, url: `/photos/${file}` }
}

export function deleteHardwarePhoto(db: Db, dataDir: string, photoId: number) {
  const row = db.prepare("SELECT file FROM hardware_photos WHERE id = ?").get(photoId) as { file: string } | undefined
  if (!row) throw new NotFoundError("Photo introuvable.")
  db.prepare("DELETE FROM hardware_photos WHERE id = ?").run(photoId)
  removeFile(path.join(dataDir, PHOTOS_DIR, row.file))
}

export function addHardwareValuation(db: Db, id: number, input: Record<string, unknown>) {
  if (!db.prepare("SELECT 1 FROM hardware WHERE id = ?").get(id)) throw new NotFoundError("Élément introuvable.")
  const v = parseValuation(input)
  return Number(
    db.prepare("INSERT INTO hardware_valuations (hardware_id, amount_cents, valued_on, source, note) VALUES (?, ?, ?, 'manuel', ?)").run(id, v.amount, v.date, v.note)
      .lastInsertRowid,
  )
}

export function deleteHardwareValuation(db: Db, valuationId: number) {
  if (db.prepare("DELETE FROM hardware_valuations WHERE id = ?").run(valuationId).changes === 0) throw new NotFoundError("Estimation introuvable.")
}

export type HardwareStats = {
  count: number
  spentCents: number
  byKind: Array<{ label: string; count: number; spentCents: number }>
  byPlatform: Array<{ label: string; count: number; spentCents: number }>
  value: { estimatedCents: number; estimatedItems: number }
}

export function hardwareStats(db: Db): HardwareStats {
  const totals = db.prepare("SELECT count(*) AS count, coalesce(sum(price_cents), 0) AS spentCents FROM hardware").get() as { count: number; spentCents: number }
  const group = (col: string) =>
    db.prepare(`SELECT ${col} AS label, count(*) AS count, coalesce(sum(price_cents), 0) AS spentCents FROM hardware GROUP BY ${col} ORDER BY count DESC, label`).all() as HardwareStats["byKind"]
  const value = db
    .prepare(
      `SELECT count(*) AS estimatedItems, coalesce(sum(v.amount_cents), 0) AS estimatedCents FROM hardware h
       JOIN hardware_valuations v ON v.id = (SELECT id FROM hardware_valuations WHERE hardware_id = h.id ORDER BY valued_on DESC, id DESC LIMIT 1)`,
    )
    .get() as HardwareStats["value"]
  return { ...totals, byKind: group("kind"), byPlatform: group("platform"), value }
}

const CSV_HEADERS: Array<[string, string]> = [
  ["type", "kind"],
  ["plateforme", "platform"],
  ["modèle", "model"],
  ["édition", "edition"],
  ["couleur", "color"],
  ["région", "region"],
  ["contenu", "content"],
  ["état", "condition_item"],
  ["état_boîte", "condition_box"],
  ["état_notice", "condition_manual"],
  ["fonctionnement", "working"],
  ["prix", "price"],
  ["date_achat", "purchase_date"],
  ["lieu_achat", "purchase_place"],
  ["numéro_série", "serial_number"],
  ["commentaire", "comment"],
  ["valeur_estimée", "value"],
  ["date_estimation", "valued_on"],
]

const euros = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","))
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v)
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Export CSV du matériel, au même format que celui des jeux (Excel français). */
export function exportHardwareCsv(db: Db) {
  const lines = [CSV_HEADERS.map(([h]) => h).join(";")]
  for (const h of listHardware(db)) {
    const values: Record<string, unknown> = { ...h, price: euros(h.price_cents as number | null), value: euros(h.value_cents) }
    lines.push(CSV_HEADERS.map(([, k]) => cell(values[k])).join(";"))
  }
  return `﻿${lines.join("\r\n")}\r\n`
}
