import type { Db } from "./db.js"
import { CONDITIONS, CONTENTS, DIGITAL, MANUAL_CONDITIONS, PLAY_STATUSES } from "./domain.js"
import { exitStats, type ExitStats } from "./events.js"
import { hardwareStats, type HardwareStats } from "./hardware.js"

export type Summary = {
  games: number
  copies: number
  physical: number
  digital: number
  spentCents: number
  byPlatform: Array<{ platform: string; games: number; copies: number; spentCents: number }>
}

// Le prix d'un exemplaire est ce qui a été payé pour la ligne, quantité comprise :
// le total dépensé est donc une somme simple, sans multiplier par la quantité.
export function summary(db: Db): Summary {
  const totals = db
    .prepare(
      `SELECT count(DISTINCT game_id) AS games, count(*) AS copies,
              sum(support <> ?) AS physical, sum(support = ?) AS digital,
              coalesce(sum(price_cents), 0) AS spentCents
       FROM copies WHERE status IS NULL`,
    )
    .get(DIGITAL, DIGITAL) as Omit<Summary, "byPlatform">
  const byPlatform = db
    .prepare(
      `SELECT g.platform, count(DISTINCT g.id) AS games, count(c.id) AS copies,
              coalesce(sum(c.price_cents), 0) AS spentCents
       FROM copies c JOIN games g ON g.id = c.game_id
       WHERE c.status IS NULL
       GROUP BY g.platform ORDER BY spentCents DESC, copies DESC, g.platform`,
    )
    .all() as Summary["byPlatform"]
  return { ...totals, physical: totals.physical ?? 0, digital: totals.digital ?? 0, byPlatform }
}

export const NONE = "Non renseigné"

export type Breakdown = Array<{ label: string; count: number; spentCents: number }>

export type Stats = Summary & {
  spentPhysicalCents: number
  spentDigitalCents: number
  byPlace: Breakdown
  byMonth: Array<{ month: string; count: number; spentCents: number }>
  undated: { count: number; spentCents: number }
  byContent: Breakdown
  byStatus: Breakdown
  conditions: { game: Breakdown; box: Breakdown; manual: Breakdown }
  /** Dernière estimation de chaque exemplaire estimé, et ce que ces exemplaires ont coûté. */
  value: { estimatedCents: number; estimatedCopies: number; costOfEstimatedCents: number }
  wishlist: { count: number; targetCents: number }
  /** Ce qui est sorti de la collection : vendu, donné, prêté… et ce que les ventes ont rapporté. */
  exits: ExitStats
  /** Consoles et matériel, comptés à part : le total dépensé des jeux reste celui des jeux. */
  hardware: HardwareStats
}

type Row = { label: string | null; count: number; spentCents: number }

/** Regroupe par une colonne ; vide → « Non renseigné », rangé en dernier. `order` impose l'ordre d'une liste fermée. */
function breakdown(db: Db, column: string, where: string, params: unknown[], order?: readonly string[]): Breakdown {
  const rows = db
    .prepare(
      `SELECT ${column} AS label, count(*) AS count, coalesce(sum(price_cents), 0) AS spentCents
       FROM copies ${where ? `${where} AND` : "WHERE"} status IS NULL GROUP BY ${column}`,
    )
    .all(...params) as Row[]
  const rank = (label: string | null) => {
    if (label === null) return Number.MAX_SAFE_INTEGER
    const i = order?.indexOf(label) ?? -1
    return i < 0 ? 1000 : i
  }
  return rows
    .sort((a, b) => (order ? rank(a.label) - rank(b.label) : (a.label === null ? 1 : 0) - (b.label === null ? 1 : 0) || b.spentCents - a.spentCents || b.count - a.count))
    .map((r) => ({ label: r.label ?? NONE, count: r.count, spentCents: r.spentCents }))
}

/** Tous les mois du premier au dernier achat daté, y compris ceux sans achat : l'axe du temps ne saute rien. */
function months(db: Db) {
  const rows = db
    .prepare(
      `SELECT substr(purchase_date, 1, 7) AS month, count(*) AS count, coalesce(sum(price_cents), 0) AS spentCents
       FROM copies WHERE purchase_date IS NOT NULL AND status IS NULL GROUP BY month ORDER BY month`,
    )
    .all() as Array<{ month: string; count: number; spentCents: number }>
  if (!rows.length) return []
  const byMonth = new Map(rows.map((r) => [r.month, r]))
  const out: Stats["byMonth"] = []
  let [y, m] = rows[0].month.split("-").map(Number)
  const last = rows[rows.length - 1].month
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`
    out.push(byMonth.get(key) ?? { month: key, count: 0, spentCents: 0 })
    if (key === last) break
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

export function stats(db: Db): Stats {
  const base = summary(db)
  const split = db
    .prepare(
      `SELECT coalesce(sum(CASE WHEN support = ? THEN 0 ELSE price_cents END), 0) AS physical,
              coalesce(sum(CASE WHEN support = ? THEN price_cents ELSE 0 END), 0) AS digital
       FROM copies WHERE status IS NULL`,
    )
    .get(DIGITAL, DIGITAL) as { physical: number; digital: number }
  const undated = db
    .prepare("SELECT count(*) AS count, coalesce(sum(price_cents), 0) AS spentCents FROM copies WHERE purchase_date IS NULL AND status IS NULL")
    .get() as { count: number; spentCents: number }
  const physical = ["WHERE support <> ?", [DIGITAL]] as const
  const value = db
    .prepare(
      `SELECT count(*) AS estimatedCopies, coalesce(sum(v.amount_cents), 0) AS estimatedCents,
              coalesce(sum(c.price_cents), 0) AS costOfEstimatedCents
       FROM copies c
       JOIN valuations v ON v.id = (SELECT id FROM valuations WHERE copy_id = c.id ORDER BY valued_on DESC, id DESC LIMIT 1)
       WHERE c.status IS NULL`,
    )
    .get() as Stats["value"]
  const wishlist = db
    .prepare("SELECT count(*) AS count, coalesce(sum(target_price_cents), 0) AS targetCents FROM wishlist")
    .get() as Stats["wishlist"]
  return {
    value,
    wishlist,
    exits: exitStats(db),
    hardware: hardwareStats(db),
    ...base,
    spentPhysicalCents: split.physical,
    spentDigitalCents: split.digital,
    byPlace: breakdown(db, "purchase_place", "", []),
    byMonth: months(db),
    undated,
    byContent: breakdown(db, "content", "", [], CONTENTS),
    byStatus: breakdown(db, "play_status", "", [], PLAY_STATUSES),
    // Les états n'ont de sens que pour les exemplaires physiques.
    conditions: {
      game: breakdown(db, "condition_game", physical[0], [...physical[1]], CONDITIONS),
      box: breakdown(db, "condition_box", physical[0], [...physical[1]], CONDITIONS),
      manual: breakdown(db, "condition_manual", physical[0], [...physical[1]], MANUAL_CONDITIONS),
    },
  }
}
