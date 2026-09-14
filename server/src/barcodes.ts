import { NotFoundError, ValidationError } from "./copies.js"
import type { Db } from "./db.js"
import { text } from "./domain.js"
import { listLibrary, type LibraryGame } from "./library.js"

// Il n'existe pas de base ouverte des codes-barres des jeux PAL : Fullset les apprend.
// Le premier scan d'une boîte se rattache à un jeu (et à son édition) ; les suivants le retrouvent.

/** EAN-8, UPC-A (12), EAN-13 ou ITF-14 : que des chiffres, clé de contrôle GS1 juste. */
export function normalizeEan(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "")
  if (![8, 12, 13, 14].includes(digits.length)) throw new ValidationError(`« ${text(raw) ?? ""} » n'est pas un code-barres EAN.`)
  const body = digits.slice(0, -1)
  const sum = [...body].reverse().reduce((n, d, i) => n + Number(d) * (i % 2 === 0 ? 3 : 1), 0)
  if ((10 - (sum % 10)) % 10 !== Number(digits.at(-1))) throw new ValidationError(`Le code ${digits} a une clé de contrôle fausse : scan à refaire.`)
  return digits
}

/** Retient le rattachement d'un code à un jeu ; un code déjà connu garde son premier jeu. */
export function rememberBarcode(db: Db, ean: string | null, gameId: number, edition: string | null) {
  if (!ean) return
  let code: string
  try {
    code = normalizeEan(ean)
  } catch {
    return // saisie libre ancienne ou code interne : on ne l'apprend pas
  }
  db.prepare("INSERT OR IGNORE INTO barcodes (ean, game_id, edition) VALUES (?, ?, ?)").run(code, gameId, edition)
}

/** Après l'enregistrement d'un exemplaire : son code, s'il en a un, désigne désormais ce jeu. */
export function learnFromCopy(db: Db, copyId: number) {
  const c = db.prepare("SELECT game_id, edition, barcode FROM copies WHERE id = ?").get(copyId) as
    | { game_id: number; edition: string | null; barcode: string | null }
    | undefined
  if (c) rememberBarcode(db, c.barcode, c.game_id, c.edition)
}

export type KnownBarcode = { ean: string; game_id: number; edition: string | null }

/**
 * Tous les codes connus, appris ou saisis sur un exemplaire. La page brocante les garde en
 * cache avec la bibliothèque : « je l'ai déjà ? » répond aussi sans réseau.
 */
export function listBarcodes(db: Db): KnownBarcode[] {
  const codes = db.prepare("SELECT ean, game_id, edition FROM barcodes ORDER BY ean").all() as KnownBarcode[]
  const seen = new Set(codes.map((c) => c.ean))
  for (const c of db.prepare("SELECT barcode, game_id, edition FROM copies WHERE barcode IS NOT NULL").all() as Array<{ barcode: string; game_id: number; edition: string | null }>) {
    let ean: string
    try {
      ean = normalizeEan(c.barcode)
    } catch {
      continue
    }
    if (seen.has(ean)) continue
    seen.add(ean)
    codes.push({ ean, game_id: c.game_id, edition: c.edition })
  }
  return codes
}

export type BarcodeRow = KnownBarcode & { title: string; platform: string; created_at: string | null; on_copy: boolean }

/** La liste à gérer : chaque code, son jeu, et s'il est aussi saisi sur un exemplaire. */
export function barcodeRows(db: Db): BarcodeRow[] {
  const games = new Map(
    (db.prepare("SELECT id, title, platform FROM games").all() as Array<{ id: number; title: string; platform: string }>).map((g) => [g.id, g]),
  )
  const learned = new Map((db.prepare("SELECT ean, created_at FROM barcodes").all() as Array<{ ean: string; created_at: string }>).map((r) => [r.ean, r.created_at]))
  const onCopies = new Set(
    (db.prepare("SELECT barcode FROM copies WHERE barcode IS NOT NULL").all() as Array<{ barcode: string }>).flatMap((c) => {
      try {
        return [normalizeEan(c.barcode)]
      } catch {
        return []
      }
    }),
  )
  return listBarcodes(db)
    .flatMap((c) => {
      const g = games.get(c.game_id)
      return g ? [{ ...c, title: g.title, platform: g.platform, created_at: learned.get(c.ean) ?? null, on_copy: onCopies.has(c.ean) }] : []
    })
    .sort((a, b) => a.title.localeCompare(b.title, "fr") || a.platform.localeCompare(b.platform, "fr"))
}

/** Oublie un code : le rattachement appris, et le code saisi sur les exemplaires qui le portent. */
export function deleteBarcode(db: Db, raw: unknown) {
  const ean = normalizeEan(raw)
  const copies = (db.prepare("SELECT id, barcode FROM copies WHERE barcode IS NOT NULL").all() as Array<{ id: number; barcode: string }>).filter((c) => {
    try {
      return normalizeEan(c.barcode) === ean
    } catch {
      return false
    }
  })
  const learned = db.prepare("DELETE FROM barcodes WHERE ean = ?").run(ean).changes
  for (const c of copies) db.prepare("UPDATE copies SET barcode = NULL, updated_at = datetime('now') WHERE id = ?").run(c.id)
  if (!learned && !copies.length) throw new NotFoundError("Code inconnu.")
}

export function exportBarcodesCsv(db: Db) {
  const cell = (v: string | null) => (v === null ? "" : /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = barcodeRows(db).map((r) => [r.ean, r.title, r.platform, r.edition, r.created_at?.slice(0, 10) ?? null].map(cell).join(";"))
  // Même forme que l'export de la collection : Excel français (point-virgule, BOM UTF-8).
  return "\uFEFF" + ["code;jeu;console;edition;appris_le", ...lines].join("\r\n") + "\r\n"
}

export type BarcodeLookup = { ean: string; known: boolean; edition: string | null; game: LibraryGame | null }

export function lookupBarcode(db: Db, raw: unknown): BarcodeLookup {
  const ean = normalizeEan(raw)
  const row = db.prepare("SELECT game_id, edition FROM barcodes WHERE ean = ?").get(ean) as { game_id: number; edition: string | null } | undefined
  // Un code saisi sur un exemplaire avant l'apprentissage compte aussi.
  const fromCopy = row
    ? undefined
    : (db.prepare("SELECT game_id, edition FROM copies WHERE replace(barcode, ' ', '') = ? LIMIT 1").get(ean) as { game_id: number; edition: string | null } | undefined)
  const hit = row ?? fromCopy
  if (!hit) return { ean, known: false, edition: null, game: null }
  const game = listLibrary(db).find((g) => g.id === hit.game_id) ?? null
  return { ean, known: game !== null, edition: hit.edition, game }
}

export function linkBarcode(db: Db, raw: unknown, gameId: unknown, edition: unknown) {
  const ean = normalizeEan(raw)
  const id = Number(gameId)
  if (!Number.isInteger(id) || !db.prepare("SELECT 1 FROM games WHERE id = ?").get(id)) throw new NotFoundError("Jeu introuvable.")
  db.prepare("INSERT INTO barcodes (ean, game_id, edition) VALUES (?, ?, ?) ON CONFLICT(ean) DO UPDATE SET game_id = excluded.game_id, edition = excluded.edition").run(
    ean,
    id,
    text(edition),
  )
  return lookupBarcode(db, ean)
}
