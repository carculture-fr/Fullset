// Export et réimport de toute la collection, pour que les données ne soient jamais prisonnières
// de l'application. Le CSV est pensé pour Excel en français : séparateur « ; », BOM UTF-8, prix « 12,50 ».
// Les fichiers (photos, jaquettes photographiées) ne sont pas dans l'export : ils sont dans le
// répertoire de données, couvert par la sauvegarde de la nuit.

import { CollectionNotEmptyError } from "./import-collection.js"
import { csvCell, uncsvCell } from "./csv.js"
import type { Db } from "./db.js"
import { isoDate, text, toCents } from "./domain.js"
import { todayIso } from "./valuations.js"
import { HW_FIELDS } from "./hardware.js"
import { msg } from "./i18n.js"

export const EXPORT_FORMAT = "fullset"
// Exports de GameCenter, le nom du projet avant sa publication : même format.
const LEGACY_EXPORT_FORMAT = "gamecenter"
export const EXPORT_VERSION = 1

const GAME_COLUMNS = [
  "igdb_id",
  "platform",
  "title",
  "summary",
  "developer",
  "publisher",
  "release_date",
  "genres",
  "game_modes",
  "perspective",
  "series",
  "pegi",
  "igdb_rating",
  "igdb_url",
  "cover_url",
  "cover_source",
] as const

const COPY_COLUMNS = [
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

const WISH_COLUMNS = ["igdb_id", "platform", "title", "cover_url", "target_price_cents", "note", "created_at"] as const

type GameRow = Record<(typeof GAME_COLUMNS)[number], string | number | null>
type CopyRow = Record<(typeof COPY_COLUMNS)[number], string | number | null>
type ValuationRow = { amount_cents: number; valued_on: string; source: string; note: string | null }
type WishRow = Record<(typeof WISH_COLUMNS)[number], string | number | null>
type Item = { game: GameRow; copies: Array<{ row: CopyRow; valuations: ValuationRow[] }> }

// En-têtes du CSV, dans l'ordre. id_jeu regroupe les exemplaires d'un même jeu au réimport.
const CSV_HEADERS: Array<[string, string]> = [
  ["id_jeu", "game_id"],
  ["igdb_id", "igdb_id"],
  ["plateforme", "platform"],
  ["titre", "title"],
  ["résumé", "summary"],
  ["développeur", "developer"],
  ["éditeur", "publisher"],
  ["date_sortie", "release_date"],
  ["genres", "genres"],
  ["modes", "game_modes"],
  ["vue", "perspective"],
  ["série", "series"],
  ["pegi", "pegi"],
  ["note_igdb", "igdb_rating"],
  ["fiche_igdb", "igdb_url"],
  ["jaquette_url", "cover_url"],
  ["jaquette_source", "cover_source"],
  ["id_exemplaire", "copy_id"],
  ["titre_saisi", "title_as_entered"],
  ["support", "support"],
  ["région", "region"],
  ["édition", "edition"],
  ["contenu", "content"],
  ["état_jeu", "condition_game"],
  ["état_boîte", "condition_box"],
  ["état_notice", "condition_manual"],
  ["statut", "play_status"],
  ["objectif", "goal"],
  ["quantité", "quantity"],
  ["prix", "price"],
  ["date_achat", "purchase_date"],
  ["lieu_achat", "purchase_place"],
  ["date_achèvement", "completion_date"],
  ["durée_h", "play_time_hours"],
  ["achevé_pct", "completion_pct"],
  ["note", "rating"],
  ["tags", "tags"],
  ["code_barres", "barcode"],
  ["commentaire", "comment"],
  // Seule la dernière estimation voyage dans le CSV ; l'historique complet est dans le JSON.
  ["valeur_estimée", "value"],
  ["date_estimation", "valued_on"],
]

type ExportCopy = CopyRow & { id: number; valuations: ValuationRow[] }
type ExportGame = GameRow & { id: number; copies: ExportCopy[] }

function readAll(db: Db): ExportGame[] {
  const games = db.prepare(`SELECT id, ${GAME_COLUMNS.join(", ")} FROM games ORDER BY id`).all() as Array<GameRow & { id: number }>
  const copies = db.prepare(`SELECT id, game_id, ${COPY_COLUMNS.join(", ")} FROM copies ORDER BY id`).all() as Array<
    CopyRow & { id: number; game_id: number }
  >
  const valuations = db.prepare("SELECT amount_cents, valued_on, source, note FROM valuations WHERE copy_id = ? ORDER BY valued_on, id")
  const byGame = new Map<number, ExportCopy[]>()
  for (const { game_id, ...c } of copies) {
    byGame.set(game_id, [...(byGame.get(game_id) ?? []), { ...c, valuations: valuations.all(c.id) as ValuationRow[] }])
  }
  // Une jaquette photographiée n'a pas d'adresse : elle ne voyage pas dans l'export.
  return games.map((g) => ({ ...g, cover_source: g.cover_url ? g.cover_source : null, copies: byGame.get(g.id) ?? [] }))
}

export function exportJson(db: Db) {
  const wishlist = db.prepare(`SELECT ${WISH_COLUMNS.join(", ")} FROM wishlist ORDER BY id`).all()
  const hwValuations = db.prepare("SELECT amount_cents, valued_on, source, note FROM hardware_valuations WHERE hardware_id = ? ORDER BY valued_on, id")
  const hardware = (db.prepare(`SELECT id, ${HW_FIELDS.join(", ")} FROM hardware ORDER BY id`).all() as Array<Record<string, unknown> & { id: number }>).map(
    ({ id, ...h }) => ({ ...h, valuations: hwValuations.all(id) }),
  )
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exported_at: new Date().toISOString(), games: readAll(db), wishlist, hardware }
}

const euros = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : (cents / 100).toFixed(2).replace(".", ","))


export function exportCsv(db: Db): string {
  const lines = [CSV_HEADERS.map(([h]) => h).join(";")]
  for (const g of readAll(db)) {
    for (const c of g.copies) {
      const latest = c.valuations[c.valuations.length - 1]
      const values: Record<string, unknown> = {
        ...g,
        ...c,
        game_id: g.id,
        copy_id: c.id,
        price: euros(c.price_cents as number | null),
        value: euros(latest?.amount_cents),
        valued_on: latest?.valued_on ?? "",
      }
      lines.push(CSV_HEADERS.map(([, key]) => csvCell(values[key])).join(";"))
    }
  }
  return `﻿${lines.join("\r\n")}\r\n`
}

/** Lecture RFC 4180 : guillemets doublés, retours à la ligne dans une cellule, séparateur « ; » ou « , ». */
export function parseCsv(input: string): string[][] {
  const src = input.replace(/^﻿/, "")
  const firstLine = src.slice(0, src.search(/\r?\n|$/))
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(uncsvCell(cell))
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++
      row.push(uncsvCell(cell))
      rows.push(row)
      row = []
      cell = ""
    } else cell += ch
  }
  if (cell !== "" || row.length) {
    row.push(uncsvCell(cell))
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c !== ""))
}

const num = (v: unknown) => {
  const s = text(v)
  if (s === null) return null
  const n = Number(s.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

function gameFrom(r: Record<string, unknown>): GameRow {
  return {
    igdb_id: num(r.igdb_id),
    platform: text(r.platform) ?? "Inconnue",
    title: text(r.title) ?? "(sans titre)",
    summary: text(r.summary),
    developer: text(r.developer),
    publisher: text(r.publisher),
    release_date: isoDate(r.release_date),
    genres: text(r.genres),
    game_modes: text(r.game_modes),
    perspective: text(r.perspective),
    series: text(r.series),
    pegi: text(r.pegi),
    igdb_rating: num(r.igdb_rating),
    igdb_url: text(r.igdb_url),
    cover_url: text(r.cover_url),
    cover_source: text(r.cover_url) ? (text(r.cover_source) ?? "igdb") : null,
  }
}

function copyFrom(r: Record<string, unknown>, priceCents: number | null): CopyRow {
  return {
    title_as_entered: text(r.title_as_entered) ?? text(r.title) ?? "(sans titre)",
    support: text(r.support) ?? "Physique",
    region: text(r.region),
    edition: text(r.edition),
    content: text(r.content),
    condition_game: text(r.condition_game),
    condition_box: text(r.condition_box),
    condition_manual: text(r.condition_manual),
    play_status: text(r.play_status),
    goal: text(r.goal),
    quantity: num(r.quantity) ?? 1,
    price_cents: priceCents,
    purchase_date: isoDate(r.purchase_date),
    purchase_place: text(r.purchase_place),
    completion_date: isoDate(r.completion_date),
    play_time_hours: num(r.play_time_hours),
    completion_pct: num(r.completion_pct),
    rating: num(r.rating),
    tags: text(r.tags),
    barcode: text(r.barcode),
    comment: text(r.comment),
  }
}

function itemsFromCsv(content: string): Item[] {
  const [header, ...rows] = parseCsv(content)
  if (!header) throw new ImportFormatError(msg("transfer.emptyCsv"))
  const keyOf = new Map(CSV_HEADERS.map(([h, k]) => [h, k]))
  const keys = header.map((h) => keyOf.get(h.trim()))
  if (!keys.includes("platform") || !keys.includes("title")) {
    throw new ImportFormatError(msg("transfer.notFullsetCsv"))
  }
  const items = new Map<string, Item>()
  rows.forEach((cells, i) => {
    const r: Record<string, unknown> = {}
    keys.forEach((k, j) => k && (r[k] = cells[j]))
    const key = text(r.game_id) ?? `${text(r.igdb_id) ?? `ligne-${i}`}|${text(r.platform)}`
    const item = items.get(key) ?? { game: gameFrom(r), copies: [] }
    const value = toCents(text(r.value))
    item.copies.push({
      row: copyFrom(r, toCents(text(r.price))),
      valuations: value === null ? [] : [{ amount_cents: value, valued_on: isoDate(r.valued_on) ?? todayIso(), source: "manuel", note: null }],
    })
    items.set(key, item)
  })
  return [...items.values()]
}

type JsonExport = {
  format?: string
  games?: Array<Record<string, unknown> & { copies?: Array<Record<string, unknown> & { valuations?: Array<Record<string, unknown>> }> }>
  wishlist?: Array<Record<string, unknown>>
  hardware?: Array<Record<string, unknown> & { valuations?: Array<Record<string, unknown>> }>
}

type HwRow = { row: Record<string, string | number | null>; valuations: ValuationRow[] }

function itemsFromJson(data: JsonExport): { items: Item[]; wishlist: WishRow[]; hardware: HwRow[] } {
  if ((data.format !== EXPORT_FORMAT && data.format !== LEGACY_EXPORT_FORMAT) || !Array.isArray(data.games)) throw new ImportFormatError(msg("transfer.notFullsetJson"))
  const items = data.games.map((g) => ({
    game: gameFrom(g),
    copies: (g.copies ?? []).map((c) => ({
      row: copyFrom(c, typeof c.price_cents === "number" ? c.price_cents : null),
      valuations: (c.valuations ?? [])
        .filter((v) => typeof v.amount_cents === "number" && isoDate(v.valued_on))
        .map((v) => ({ amount_cents: v.amount_cents as number, valued_on: isoDate(v.valued_on)!, source: text(v.source) ?? "manuel", note: text(v.note) })),
    })),
  }))
  const wishlist = (data.wishlist ?? [])
    .filter((w) => text(w.title))
    .map((w) => ({
      igdb_id: num(w.igdb_id),
      platform: text(w.platform),
      title: text(w.title),
      cover_url: text(w.cover_url),
      target_price_cents: num(w.target_price_cents),
      note: text(w.note),
      created_at: text(w.created_at) ?? new Date().toISOString().slice(0, 19).replace("T", " "),
    }))
  const hardware = (data.hardware ?? [])
    .filter((h) => text(h.kind) && text(h.platform))
    .map((h) => ({
      row: Object.fromEntries(HW_FIELDS.map((f) => [f, f === "price_cents" ? num(h[f]) : text(h[f])])),
      valuations: (h.valuations ?? [])
        .filter((v) => typeof v.amount_cents === "number" && isoDate(v.valued_on))
        .map((v) => ({ amount_cents: v.amount_cents as number, valued_on: isoDate(v.valued_on)!, source: text(v.source) ?? "manuel", note: text(v.note) })),
    }))
  return { items, wishlist, hardware }
}

export class ImportFormatError extends Error {}

export type TransferReport = { games: number; copies: number; totalCents: number }

function insertAll(db: Db, items: Item[], wishlist: WishRow[] = [], hardware: HwRow[] = []): TransferReport {
  const existing = (db.prepare("SELECT count(*) AS n FROM copies").get() as { n: number }).n
  if (existing > 0) throw new CollectionNotEmptyError(msg("transfer.collectionNotEmpty", { count: existing }))
  const existingHw = (db.prepare("SELECT count(*) AS n FROM hardware").get() as { n: number }).n
  if (existingHw > 0) throw new CollectionNotEmptyError(msg("transfer.hardwareNotEmpty", { count: existingHw }))
  const insertHw = db.prepare(`INSERT INTO hardware (${HW_FIELDS.join(", ")}) VALUES (${HW_FIELDS.map((f) => `@${f}`).join(", ")})`)
  const insertHwValuation = db.prepare(
    "INSERT INTO hardware_valuations (hardware_id, amount_cents, valued_on, source, note) VALUES (@hardware_id, @amount_cents, @valued_on, @source, @note)",
  )
  const insertGame = db.prepare(`INSERT INTO games (${GAME_COLUMNS.join(", ")}) VALUES (${GAME_COLUMNS.map((c) => `@${c}`).join(", ")})`)
  const insertCopy = db.prepare(
    `INSERT INTO copies (game_id, ${COPY_COLUMNS.join(", ")}) VALUES (@game_id, ${COPY_COLUMNS.map((c) => `@${c}`).join(", ")})`,
  )
  const insertValuation = db.prepare(
    "INSERT INTO valuations (copy_id, amount_cents, valued_on, source, note) VALUES (@copy_id, @amount_cents, @valued_on, @source, @note)",
  )
  const insertWish = db.prepare(`INSERT INTO wishlist (${WISH_COLUMNS.join(", ")}) VALUES (${WISH_COLUMNS.map((c) => `@${c}`).join(", ")})`)
  const report: TransferReport = { games: 0, copies: 0, totalCents: 0 }
  db.transaction(() => {
    for (const item of items) {
      const gameId = Number(insertGame.run(item.game).lastInsertRowid)
      report.games++
      for (const { row, valuations } of item.copies) {
        const copyId = Number(insertCopy.run({ ...row, game_id: gameId }).lastInsertRowid)
        for (const v of valuations) insertValuation.run({ ...v, copy_id: copyId })
        report.copies++
        report.totalCents += (row.price_cents as number | null) ?? 0
      }
    }
    for (const w of wishlist) insertWish.run(w)
    for (const { row, valuations } of hardware) {
      const hwId = Number(insertHw.run(row).lastInsertRowid)
      for (const v of valuations) insertHwValuation.run({ ...v, hardware_id: hwId })
    }
  })()
  return report
}

/** Réimporte un export Fullset (CSV ou JSON), dans une collection vide uniquement. */
export function importExport(db: Db, content: string): TransferReport {
  const trimmed = content.replace(/^﻿/, "").trimStart()
  if (trimmed.startsWith("{")) {
    let data: unknown
    try {
      data = JSON.parse(trimmed)
    } catch {
      throw new ImportFormatError(msg("common.unreadableJson"))
    }
    const { items, wishlist, hardware } = itemsFromJson(data as JsonExport)
    return insertAll(db, items, wishlist, hardware)
  }
  return insertAll(db, itemsFromCsv(content))
}
