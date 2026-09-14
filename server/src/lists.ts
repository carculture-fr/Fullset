import { NotFoundError, ValidationError } from "./copies.js"
import type { Db } from "./db.js"
import { text } from "./domain.js"
import { msg } from "./i18n.js"

// Listes de valeurs libres gérées dans les réglages. Les listes fixes (états, contenu, statut…)
// restent dans domain.ts : les filtres et les statistiques s'appuient dessus.
// Une liste peut vivre dans plusieurs tables : un lieu d'achat sert aux jeux comme au matériel.
type Source = { table: "copies" | "hardware"; column: string; multi?: boolean }

export const LISTS: Record<string, { label: string; sources: Source[] }> = {
  place: { label: "Lieux d'achat", sources: [{ table: "copies", column: "purchase_place" }, { table: "hardware", column: "purchase_place" }] },
  edition: { label: "Éditions (jeux)", sources: [{ table: "copies", column: "edition" }] },
  tag: { label: "Tags", sources: [{ table: "copies", column: "tags", multi: true }] },
  hw_edition: { label: "Éditions (matériel)", sources: [{ table: "hardware", column: "edition" }] },
  hw_color: { label: "Couleurs", sources: [{ table: "hardware", column: "color" }] },
}
export type ListKey = "place" | "edition" | "tag" | "hw_edition" | "hw_color"
export const isListKey = (k: string): k is ListKey => k in LISTS

export class ConflictError extends Error {}

export type ListValue = { id: number; value: string; count: number }

const splitTags = (s: string | null) =>
  (s ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)

/** Nombre d'utilisations par valeur (clé en minuscules : les listes ignorent la casse). */
function usage(db: Db, list: ListKey): Map<string, { value: string; count: number }> {
  const out = new Map<string, { value: string; count: number }>()
  for (const s of LISTS[list].sources) {
    const rows = db.prepare(`SELECT ${s.column} AS v FROM ${s.table} WHERE ${s.column} IS NOT NULL`).all() as Array<{ v: string }>
    for (const { v } of rows) {
      for (const value of s.multi ? [...new Set(splitTags(v))] : [v.trim()]) {
        if (!value) continue
        const key = value.toLowerCase()
        out.set(key, { value: out.get(key)?.value ?? value, count: (out.get(key)?.count ?? 0) + 1 })
      }
    }
  }
  return out
}

function sync(db: Db, list: ListKey) {
  const used = usage(db, list)
  const insert = db.prepare("INSERT OR IGNORE INTO list_values (list, value) VALUES (?, ?)")
  for (const { value } of used.values()) insert.run(list, value)
  return used
}

/**
 * Toutes les listes, avec l'usage de chaque valeur. Une valeur saisie mais absente de la liste
 * y est ajoutée au passage (import, ancienne saisie) : la liste ne ment jamais.
 */
export function listValues(db: Db): Record<ListKey, ListValue[]> {
  const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true })
  const result = {} as Record<ListKey, ListValue[]>
  for (const list of Object.keys(LISTS) as ListKey[]) {
    const used = sync(db, list)
    const rows = db.prepare("SELECT id, value, sort_order FROM list_values WHERE list = ?").all(list) as Array<{ id: number; value: string; sort_order: number | null }>
    result[list] = rows
      .map((r) => ({ ...r, count: used.get(r.value.toLowerCase())?.count ?? 0 }))
      // Les plus utilisées d'abord (ce qu'on saisit le plus souvent), puis l'ordre proposé, puis l'alphabet.
      .sort((a, b) => b.count - a.count || (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || collator.compare(a.value, b.value))
      .map(({ id, value, count }) => ({ id, value, count }))
  }
  return result
}

function clean(value: unknown) {
  const v = text(value)
  if (!v) throw new ValidationError(msg("lists.empty"))
  if (v.length > 80) throw new ValidationError(msg("lists.tooLong"))
  if (v.includes(",")) throw new ValidationError(msg("lists.noComma"))
  return v
}

const findValue = (db: Db, list: ListKey, value: string) =>
  db.prepare("SELECT id, value FROM list_values WHERE list = ? AND value = ? COLLATE NOCASE").get(list, value) as { id: number; value: string } | undefined

/** Ajoute une valeur (ou renvoie celle qui existe déjà, à la casse près). */
export function addValue(db: Db, list: ListKey, value: unknown) {
  const v = clean(value)
  sync(db, list) // une valeur déjà saisie garde sa casse d'origine
  const existing = findValue(db, list, v)
  if (existing) return existing
  const id = Number(db.prepare("INSERT INTO list_values (list, value) VALUES (?, ?)").run(list, v).lastInsertRowid)
  return { id, value: v }
}

/** Remplace une valeur partout où elle est portée. */
function replaceEverywhere(db: Db, list: ListKey, from: string, to: string) {
  for (const s of LISTS[list].sources) {
    if (!s.multi) {
      db.prepare(`UPDATE ${s.table} SET ${s.column} = ?, updated_at = datetime('now') WHERE ${s.column} = ? COLLATE NOCASE`).run(to, from)
      continue
    }
    const rows = db.prepare(`SELECT id, ${s.column} AS v FROM ${s.table} WHERE ${s.column} IS NOT NULL`).all() as Array<{ id: number; v: string }>
    const update = db.prepare(`UPDATE ${s.table} SET ${s.column} = ?, updated_at = datetime('now') WHERE id = ?`)
    for (const r of rows) {
      const tags = splitTags(r.v)
      if (!tags.some((t) => t.toLowerCase() === from.toLowerCase())) continue
      const next = [...new Map(tags.map((t) => (t.toLowerCase() === from.toLowerCase() ? to : t)).map((t) => [t.toLowerCase(), t])).values()]
      update.run(next.join(", "), r.id)
    }
  }
}

/**
 * Renomme une valeur partout. Si le nouveau nom existe déjà, les deux valeurs fusionnent :
 * « Leboncoin » renommé en « LeBonCoin » regroupe leurs achats dans les statistiques.
 */
export function renameValue(db: Db, list: ListKey, id: number, value: unknown) {
  const row = db.prepare("SELECT id, value FROM list_values WHERE id = ? AND list = ?").get(id, list) as { id: number; value: string } | undefined
  if (!row) throw new NotFoundError(msg("lists.notFound"))
  const v = clean(value)
  const target = findValue(db, list, v)
  db.transaction(() => {
    replaceEverywhere(db, list, row.value, target && target.id !== row.id ? target.value : v)
    if (target && target.id !== row.id) db.prepare("DELETE FROM list_values WHERE id = ?").run(row.id)
    else db.prepare("UPDATE list_values SET value = ? WHERE id = ?").run(v, row.id)
  })()
  return { merged: Boolean(target && target.id !== row.id) }
}

/** Supprime une valeur inutilisée ; une valeur utilisée se renomme ou se fusionne. */
export function deleteValue(db: Db, list: ListKey, id: number) {
  const row = db.prepare("SELECT value FROM list_values WHERE id = ? AND list = ?").get(id, list) as { value: string } | undefined
  if (!row) throw new NotFoundError(msg("lists.notFound"))
  const count = usage(db, list).get(row.value.toLowerCase())?.count ?? 0
  if (count > 0) throw new ConflictError(msg("lists.inUse", { value: row.value, count }))
  db.prepare("DELETE FROM list_values WHERE id = ?").run(id)
}
