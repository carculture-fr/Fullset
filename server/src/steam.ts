import { createCopy } from "./copies.js"
import type { Db } from "./db.js"
import { DIGITAL } from "./domain.js"
import { createGame, findGame } from "./games.js"
import type { IgdbClient } from "./igdb.js"

// Bibliothèque Steam du compte (API Web Steam, GetOwnedGames). Choix de conception :
// les jeux absents passent par un écran de choix, et le temps de jeu ne se met à jour qu'au
// bouton « Synchroniser », jamais en tâche de fond.

export type SteamOwned = { appid: number; name: string; playtime_minutes: number; last_played: number | null }

export interface SteamClient {
  ownedGames(): Promise<SteamOwned[]>
}

export class SteamError extends Error {}

export class Steam implements SteamClient {
  constructor(
    private readonly key: string,
    private readonly steamId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async ownedGames() {
    const params = new URLSearchParams({ key: this.key, steamid: this.steamId, include_appinfo: "1", include_played_free_games: "1", format: "json" })
    let res: Response
    try {
      res = await this.fetchImpl(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?${params}`, { signal: AbortSignal.timeout(20_000) })
    } catch (err) {
      // Pas d'adresse dans le message : elle porte la clé.
      throw new SteamError(`Steam injoignable (${(err as Error).name}).`)
    }
    if (res.status === 401 || res.status === 403) throw new SteamError("Steam refuse la clé API (STEAM_API_KEY).")
    if (!res.ok) throw new SteamError(`Steam a répondu HTTP ${res.status}.`)
    const body = (await res.json()) as { response?: { games?: Array<{ appid: number; name?: string; playtime_forever?: number; rtime_last_played?: number }> } }
    // Profil privé ou SteamID faux : Steam répond 200 avec une réponse vide.
    if (!body.response?.games) throw new SteamError("Bibliothèque Steam illisible : vérifie le SteamID et que les « Détails des jeux » du profil sont publics.")
    return body.response.games.map((g) => ({
      appid: g.appid,
      name: g.name ?? `Jeu Steam ${g.appid}`,
      playtime_minutes: g.playtime_forever ?? 0,
      last_played: g.rtime_last_played ? g.rtime_last_played * 1000 : null,
    }))
  }
}

export function steamFromEnv(): Steam | null {
  const key = process.env.STEAM_API_KEY?.trim()
  const id = process.env.STEAM_ID?.trim()
  return key && id ? new Steam(key, id) : null
}

const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10

export type SteamCandidate = { appid: number; name: string; playtime_minutes: number; last_played: number | null; igdb_id: number | null }

/** Jeux Steam absents de la collection : ni reliés par leur appid, ni présents sur PC avec la même fiche IGDB. */
export function steamCandidates(db: Db): SteamCandidate[] {
  return db
    .prepare(
      `SELECT s.appid, s.name, s.playtime_minutes, s.last_played, s.igdb_id FROM steam_library s
       WHERE NOT EXISTS (SELECT 1 FROM games g WHERE g.steam_appid = s.appid)
         AND NOT EXISTS (SELECT 1 FROM games g WHERE g.platform = 'PC' AND s.igdb_id IS NOT NULL AND g.igdb_id = s.igdb_id)
       ORDER BY s.playtime_minutes DESC, s.name`,
    )
    .all() as SteamCandidate[]
}

export function steamStatus(db: Db, configured: boolean) {
  const synced = db.prepare("SELECT value FROM meta WHERE key = 'steam_synced_at'").get() as { value: string } | undefined
  const owned = (db.prepare("SELECT count(*) AS n FROM steam_library").get() as { n: number }).n
  const linked = (db.prepare("SELECT count(*) AS n FROM games WHERE steam_appid IS NOT NULL").get() as { n: number }).n
  return { configured, synced_at: synced?.value ?? null, owned, linked, candidates: steamCandidates(db).length }
}

/**
 * Lit la bibliothèque Steam, retrouve la fiche IGDB de chaque jeu (seulement pour les appid
 * encore inconnus), relie les jeux PC déjà dans la collection et reprend leur temps de jeu
 * sur leur premier exemplaire dématérialisé.
 */
export async function syncSteam(db: Db, steam: SteamClient, igdb: IgdbClient | null) {
  const owned = await steam.ownedGames()
  const known = new Map((db.prepare("SELECT appid, igdb_id FROM steam_library").all() as Array<{ appid: number; igdb_id: number | null }>).map((r) => [r.appid, r.igdb_id]))
  const missing = owned.filter((g) => !known.has(g.appid) || known.get(g.appid) === null).map((g) => String(g.appid))
  const mapped = missing.length && igdb?.steamIds ? await igdb.steamIds(missing) : new Map<string, number>()
  const now = new Date().toISOString()
  let linked = 0
  let playtime = 0

  db.transaction(() => {
    const upsert = db.prepare(
      `INSERT INTO steam_library (appid, name, playtime_minutes, last_played, igdb_id, synced_at) VALUES (@appid, @name, @playtime_minutes, @last_played, @igdb_id, @synced_at)
       ON CONFLICT(appid) DO UPDATE SET name = excluded.name, playtime_minutes = excluded.playtime_minutes, last_played = excluded.last_played,
         igdb_id = coalesce(excluded.igdb_id, steam_library.igdb_id), synced_at = excluded.synced_at`,
    )
    for (const g of owned) upsert.run({ ...g, igdb_id: known.get(g.appid) ?? mapped.get(String(g.appid)) ?? null, synced_at: now })
    // Un jeu retiré du compte Steam (remboursé, bêta) disparaît de la liste.
    db.prepare("DELETE FROM steam_library WHERE synced_at <> ?").run(now)

    const rows = db.prepare("SELECT appid, igdb_id, playtime_minutes FROM steam_library").all() as Array<{ appid: number; igdb_id: number | null; playtime_minutes: number }>
    for (const r of rows) {
      const game = db
        .prepare("SELECT id, steam_appid FROM games WHERE steam_appid = ? OR (platform = 'PC' AND ? IS NOT NULL AND igdb_id = ?) ORDER BY steam_appid IS NULL LIMIT 1")
        .get(r.appid, r.igdb_id, r.igdb_id) as { id: number; steam_appid: number | null } | undefined
      if (!game) continue
      if (game.steam_appid === null) {
        db.prepare("UPDATE games SET steam_appid = ? WHERE id = ?").run(r.appid, game.id)
        linked++
      }
      if (r.playtime_minutes > 0) {
        const res = db
          .prepare(
            `UPDATE copies SET play_time_hours = ?, updated_at = datetime('now')
             WHERE id = (SELECT id FROM copies WHERE game_id = ? AND support = ? ORDER BY id LIMIT 1) AND (play_time_hours IS NULL OR play_time_hours <> ?)`,
          )
          .run(hours(r.playtime_minutes), game.id, DIGITAL, hours(r.playtime_minutes))
        playtime += res.changes
      }
    }
    db.prepare("INSERT INTO meta (key, value) VALUES ('steam_synced_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(now)
  })()

  return { owned: owned.length, recognised: owned.filter((g) => (known.get(g.appid) ?? mapped.get(String(g.appid))) != null).length, linked, playtime, candidates: steamCandidates(db).length }
}

/** Ajoute les jeux Steam choisis : fiche IGDB quand elle est connue, exemplaire dématérialisé acheté sur Steam. */
export async function importSteam(db: Db, dataDir: string, igdb: IgdbClient | null, appids: unknown, fetchImpl?: typeof fetch) {
  const wanted = new Set((Array.isArray(appids) ? appids : []).map(Number).filter(Number.isInteger))
  const rows = steamCandidates(db).filter((c) => wanted.has(c.appid))
  const added: Array<{ appid: number; gameId: number; title: string }> = []
  const failed: Array<{ appid: number; name: string; error: string }> = []
  for (const r of rows) {
    try {
      let gameId = r.igdb_id ? findGame(db, r.igdb_id, "PC") : null
      if (gameId === null) {
        const meta = r.igdb_id && igdb ? await igdb.game(r.igdb_id, "PC") : { title: r.name }
        gameId = await createGame(db, dataDir, "PC", meta, fetchImpl)
      }
      db.prepare("UPDATE games SET steam_appid = ? WHERE id = ?").run(r.appid, gameId)
      createCopy(db, gameId, {
        support: DIGITAL,
        content: DIGITAL,
        purchase_place: "Steam",
        play_time_hours: r.playtime_minutes > 0 ? hours(r.playtime_minutes) : null,
        play_status: r.playtime_minutes > 0 ? null : "Pas commencé",
      })
      added.push({ appid: r.appid, gameId, title: r.name })
    } catch (err) {
      failed.push({ appid: r.appid, name: r.name, error: (err as Error).message })
    }
  }
  return { added, failed }
}
