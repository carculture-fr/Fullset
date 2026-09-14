import type { Db } from "./db.js"
import { text } from "./domain.js"

// Catalogue des consoles : celles de RomM et leurs variantes (migration 7), plus toute console
// ou tout modèle saisi par « Autre… », qui rejoint le catalogue à l'enregistrement.

export type CatalogPlatform = {
  name: string
  kind: string | null
  family: string | null
  generation: number | null
  models: string[]
  /** Nombre d'éléments de matériel et de jeux sur cette console : les plus utilisées d'abord. */
  used: number
}

// Anciens noms courts (collection.json, ancienne appli, clients d'avant la 0.13) → nom RomM / IGDB.
const OLD_NAMES: Record<string, string> = { gamecube: "Nintendo GameCube" }

export const canonicalPlatform = (name: string) => OLD_NAMES[name.trim().toLowerCase()] ?? name.trim()

export function listPlatforms(db: Db): CatalogPlatform[] {
  const platforms = db
    .prepare(
      `SELECT p.id, p.name, p.kind, p.family, p.generation,
         (SELECT count(*) FROM hardware h WHERE h.platform = p.name COLLATE NOCASE)
           + (SELECT count(*) FROM games g WHERE g.platform = p.name COLLATE NOCASE) AS used
       FROM platforms p ORDER BY p.position, p.name`,
    )
    .all() as Array<Omit<CatalogPlatform, "models"> & { id: number }>
  const models = db.prepare("SELECT platform_id, name FROM platform_models ORDER BY position, name").all() as Array<{ platform_id: number; name: string }>
  const byPlatform = new Map<number, string[]>()
  for (const m of models) byPlatform.set(m.platform_id, [...(byPlatform.get(m.platform_id) ?? []), m.name])
  // Le premier modèle en tête : IGDB le nomme « Initial version » (devenu « Modèle d'origine ») ou « … Original ».
  const first = (name: string) => (/origine|original/i.test(name) ? 0 : 1)
  for (const [id, list] of byPlatform) byPlatform.set(id, [...list].sort((a, b) => first(a) - first(b)))
  return platforms.map(({ id, ...p }) => ({ ...p, models: byPlatform.get(id) ?? [] }))
}

/** Une console ou un modèle saisi hors catalogue y entre, comme les valeurs des listes gérables. */
export function rememberPlatform(db: Db, platformRaw: unknown, modelRaw?: unknown) {
  const platform = text(platformRaw)
  if (!platform) return
  db.prepare("INSERT OR IGNORE INTO platforms (name, position) VALUES (?, (SELECT coalesce(max(position), 0) + 1 FROM platforms))").run(platform)
  const model = text(modelRaw)
  if (!model) return
  db.prepare(
    `INSERT OR IGNORE INTO platform_models (platform_id, name, position)
     SELECT id, ?, (SELECT coalesce(max(position), 0) + 1 FROM platform_models WHERE platform_id = platforms.id) FROM platforms WHERE name = ?`,
  ).run(model, platform)
}
