// Import du CSV d'une ancienne application d'inventaire (colonnes anglaises ou françaises).
// Deux temps : l'analyse propose (doublons, rapprochement IGDB), l'utilisateur tranche, puis l'import écrit.

import { NotFoundError, ValidationError, createCopy, validateCopy } from "./copies.js"
import type { Db } from "./db.js"
import { DIGITAL, isoDate, text, toCents } from "./domain.js"
import { createGame, findGame } from "./games.js"
import type { IgdbCandidate, IgdbClient, IgdbGame } from "./igdb.js"
import { ImportFormatError, parseCsv } from "./transfer.js"
import { todayIso } from "./valuations.js"
import { msg } from "./i18n.js"

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

// En-têtes reconnus, une fois normalisés (sans accents ni ponctuation).
const HEADERS: Record<string, string> = {
  name: "name", nom: "name", titre: "name",
  platform: "platform", plateforme: "platform",
  status: "status", statut: "status",
  region: "region",
  content: "content", contenu: "content",
  support: "support",
  goal: "goal", objectif: "goal",
  edition: "edition",
  "condition game": "cond_game", "etat jeu": "cond_game",
  "condition item box": "cond_box", "etat element boite": "cond_box",
  "condition item manual": "cond_manual", "etat element manuel": "cond_manual", "etat element notice": "cond_manual",
  copies: "copies", exemplaires: "copies",
  duration: "duration", duree: "duration",
  "percentage completed": "pct", "pourcentage acheve": "pct",
  rate: "rate", note: "rate",
  "purchasing price": "price", "prix d achat": "price", "prix achat": "price",
  "estimated price": "estimated", "prix estime": "estimated",
  "acquisition date": "acquired", "date d acquisition": "acquired",
  "completion date": "completed", "date d achevement": "completed",
  "acquisition location": "location", "lieu d acquisition": "location",
  tags: "tags",
  barcode: "barcode", "code barres": "barcode", "code barre": "barcode",
  comment: "comment", commentaire: "comment",
}

const table = (entries: Array<[string[], string]>) => Object.fromEntries(entries.flatMap(([keys, v]) => keys.map((k) => [k, v])))

const STATUS = table([
  [["unstarted", "not started", "non commence", "pas commence"], "Pas commencé"],
  [["in progress", "playing", "en cours"], "En cours"],
  [["completed", "finished", "termine", "fini"], "Terminé"],
  [["abandoned", "abandonne"], "Abandonné"],
])
const REGION = table([
  [["eur", "europe", "pal", "pal europe"], "PAL (Europe)"],
  [["usa", "us", "ntsc u", "north america", "amerique du nord"], "NTSC-U"],
  [["jpn", "jap", "japan", "japon", "ntsc j"], "NTSC-J"],
])
const CONTENT = table([
  [["full", "complete", "complet", "complet jeu boite notice"], "Complet (jeu + boîte + notice)"],
  [["item box", "element boite", "jeu boite"], "Jeu + boîte"],
  [["loose", "item", "element", "jeu seul"], "Jeu seul"],
  [["not defined", "non defini"], "Non défini"],
  [["dematerialized", "digital", "dematerialise"], DIGITAL],
])
const SUPPORT = table([
  [["optical disc", "disque optique", "disc", "cartridge", "cartouche", "physical", "physique"], "Physique"],
  [["dematerialized", "digital", "dematerialise", "download"], DIGITAL],
])
const GOAL = table([
  [["to keep", "a garder"], "À garder"],
  [["to sell", "a vendre"], "À vendre"],
  [["to trade", "to exchange", "a echanger"], "À échanger"],
])
const CONDITION = table([
  [["new", "neuf", "mint"], "Neuf"],
  [["very good", "tres bon"], "Très bon"],
  [["good", "bon"], "Bon"],
  [["medium", "average", "fair", "moyen"], "Moyen"],
  [["bad", "poor", "mauvais"], "Mauvais"],
  [["very bad", "tres mauvais"], "Très mauvais"],
  [["not defined", "non defini"], "Non défini"],
])
const MANUAL = { ...CONDITION, ...table([[["missing", "absent", "absente"], "Absente"]]) }
const PLATFORM = table([
  [["windows", "pc", "pc windows", "pc microsoft windows"], "PC"],
  [["gamecube", "nintendo gamecube"], "Nintendo GameCube"],
])
const EMPTY = new Set(["", "n a", "na", "none", "null", "aucun"])
const DIGITAL_MARKS = new Set(["dematerialized", "digital", "dematerialise"])

export type LegacyCopy = Record<string, string | null>

export type LegacyRow = {
  index: number
  title: string
  platform: string
  copy: LegacyCopy
  estimatedCents: number | null
  /** Valeurs que l'import ne sait pas traduire : reportées dans le commentaire, jamais perdues. */
  warnings: string[]
}

const isEmpty = (v: unknown) => EMPTY.has(norm(v))
const positive = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", "."))
  return Number.isFinite(n) && n > 0 ? String(n) : null
}

export function parseLegacyCsv(content: string): LegacyRow[] {
  const [header, ...lines] = parseCsv(content)
  const keys = (header ?? []).map((h) => HEADERS[norm(h)])
  if (!keys.includes("name") || !keys.includes("platform")) {
    throw new ImportFormatError(msg("legacy.notLegacyCsv"))
  }
  return lines.map((cells, index) => {
    const r: Record<string, string> = {}
    keys.forEach((k, j) => k && (r[k] = cells[j] ?? ""))
    const warnings: string[] = []
    const map = (key: string, dict: Record<string, string>, label: string) => {
      const raw = r[key]
      if (isEmpty(raw)) return null
      const v = dict[norm(raw)]
      if (!v) warnings.push(msg("legacy.originalValue", { field: msg(`fields.${label}`), value: raw.trim() }))
      return v ?? null
    }
    const digital = DIGITAL_MARKS.has(norm(r.support)) || DIGITAL_MARKS.has(norm(r.content))
    // Pour une clé Steam, l'ancienne appli écrit « Dematerialized » dans les trois états : ce n'est pas un état.
    const condition = (key: string, dict: Record<string, string>, label: string) =>
      digital || DIGITAL_MARKS.has(norm(r[key])) ? null : map(key, dict, label)
    const title = text(r.name) ?? msg("legacy.untitled")
    const platform = PLATFORM[norm(r.platform)] ?? text(r.platform) ?? "Inconnue"
    const copy: LegacyCopy = {
      title_as_entered: title,
      support: digital ? DIGITAL : (map("support", SUPPORT, "support") ?? "Physique"),
      content: digital ? DIGITAL : map("content", CONTENT, "content"),
      condition_game: condition("cond_game", CONDITION, "conditionGame"),
      condition_box: condition("cond_box", CONDITION, "conditionBox"),
      condition_manual: condition("cond_manual", MANUAL, "conditionManual"),
      play_status: map("status", STATUS, "playStatus"),
      goal: map("goal", GOAL, "goal"),
      region: map("region", REGION, "region"),
      edition: isEmpty(r.edition) ? null : text(r.edition),
      quantity: positive(r.copies) ?? "1",
      price: isEmpty(r.price) ? null : text(r.price),
      purchase_date: isEmpty(r.acquired) ? null : (isoDate(r.acquired) ?? text(r.acquired)),
      purchase_place: isEmpty(r.location) ? null : text(r.location),
      completion_date: isEmpty(r.completed) ? null : (isoDate(r.completed) ?? text(r.completed)),
      play_time_hours: positive(r.duration),
      completion_pct: positive(r.pct),
      rating: positive(r.rate),
      tags: isEmpty(r.tags) ? null : text(r.tags),
      barcode: isEmpty(r.barcode) ? null : text(r.barcode),
      comment: [isEmpty(r.comment) ? null : text(r.comment), ...warnings].filter(Boolean).join(" · ") || null,
    }
    const estimated = toCents(isEmpty(r.estimated) ? null : text(r.estimated))
    return { index, title, platform, copy, estimatedCents: estimated && estimated > 0 ? estimated : null, warnings }
  })
}

export type MatchStatus = "duplicate" | "sure" | "check" | "none"

export type AnalyzedRow = LegacyRow & {
  status: MatchStatus
  duplicate: { gameId: number; copyId: number } | null
  candidates: IgdbCandidate[]
  /** Proposition de l'analyse : l'identifiant IGDB retenu, ou null. */
  proposed: number | null
}

/**
 * Analyse sans rien écrire. Un exemplaire déjà présent (même titre saisi, plateforme, date et prix)
 * est reconnu sans interroger IGDB : réimporter l'export d'origine ne double donc rien.
 * Sinon IGDB propose ; « sûr » seulement si le titre correspond exactement sur la bonne plateforme.
 */
export async function analyzeLegacy(db: Db, igdb: IgdbClient | null, content: string): Promise<AnalyzedRow[]> {
  const rows = parseLegacyCsv(content)
  const existing = db
    .prepare(
      `SELECT c.id, c.game_id, lower(c.title_as_entered) AS title, g.platform, coalesce(c.purchase_date, '') AS date, coalesce(c.price_cents, -1) AS price
       FROM copies c JOIN games g ON g.id = c.game_id ORDER BY c.id`,
    )
    .all() as Array<{ id: number; game_id: number; title: string; platform: string; date: string; price: number }>
  const used = new Set<number>()
  const searches = new Map<string, IgdbCandidate[]>()
  const out: AnalyzedRow[] = []

  for (const row of rows) {
    const price = toCents(row.copy.price) ?? -1
    const twin = existing.find(
      (e) => !used.has(e.id) && e.title === row.title.toLowerCase() && e.platform === row.platform && e.date === (row.copy.purchase_date ?? "") && e.price === price,
    )
    if (twin) {
      used.add(twin.id)
      out.push({ ...row, status: "duplicate", duplicate: { gameId: twin.game_id, copyId: twin.id }, candidates: [], proposed: null })
      continue
    }
    let found = searches.get(row.title)
    if (found === undefined) {
      found = igdb ? await igdb.search(row.title).catch(() => []) : []
      searches.set(row.title, found)
    }
    const onPlatform = found.filter((c) => c.platforms.includes(row.platform))
    const candidates = [...onPlatform, ...found.filter((c) => !onPlatform.includes(c))].slice(0, 5)
    const exact = onPlatform.find((c) => norm(c.name) === norm(row.title) || norm(c.original_name) === norm(row.title))
    const proposed = exact ?? onPlatform[0] ?? candidates[0] ?? null
    out.push({
      ...row,
      status: exact ? "sure" : candidates.length ? "check" : "none",
      duplicate: null,
      candidates,
      proposed: proposed?.igdb_id ?? null,
    })
  }
  return out
}

export type LegacyDecision = { title: string; platform: string; copy: LegacyCopy; estimatedCents: number | null; igdb_id: number | null }

export type LegacyReport = { copies: number; gamesCreated: number; valuations: number }

/** Écrit les lignes retenues. Tout est validé avant la première écriture. */
export async function commitLegacy(db: Db, dataDir: string, igdb: IgdbClient | null, decisions: LegacyDecision[], fetchImpl?: typeof fetch): Promise<LegacyReport> {
  const errors: string[] = []
  decisions.forEach((d, i) => {
    try {
      validateCopy(d.copy ?? {}, d.title)
    } catch (err) {
      errors.push(msg("legacy.line", { line: i + 1, title: d.title, error: (err as Error).message }))
    }
    if (d.igdb_id !== null && !igdb) errors.push(msg("legacy.line", { line: i + 1, title: d.title, error: msg("legacy.igdbNotConfigured") }))
  })
  if (errors.length) throw new ValidationError(errors.join(" "))

  const metas = new Map<number, IgdbGame>()
  const report: LegacyReport = { copies: 0, gamesCreated: 0, valuations: 0 }
  for (const d of decisions) {
    let gameId: number | null
    if (d.igdb_id !== null) {
      gameId = findGame(db, d.igdb_id, d.platform)
      if (gameId === null) {
        const meta = metas.get(d.igdb_id) ?? (await igdb!.game(d.igdb_id, d.platform))
        metas.set(d.igdb_id, meta)
        gameId = await createGame(db, dataDir, d.platform, meta, fetchImpl)
        report.gamesCreated++
      }
    } else {
      const manual = db
        .prepare("SELECT id FROM games WHERE igdb_id IS NULL AND lower(title) = lower(?) AND platform = ?")
        .get(d.title, d.platform) as { id: number } | undefined
      gameId = manual?.id ?? null
      if (gameId === null) {
        gameId = await createGame(db, dataDir, d.platform, { title: d.title }, fetchImpl)
        report.gamesCreated++
      }
    }
    const copyId = createCopy(db, gameId, d.copy)
    report.copies++
    if (d.estimatedCents) {
      db.prepare("INSERT INTO valuations (copy_id, amount_cents, valued_on, source, note) VALUES (?, ?, ?, 'manuel', ?)").run(
        copyId,
        d.estimatedCents,
        todayIso(),
        msg("legacy.estimatedNote"),
      )
      report.valuations++
    }
  }
  return report
}

export { NotFoundError }
