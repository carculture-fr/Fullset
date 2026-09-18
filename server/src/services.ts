import { ValidationError } from "./copies.js"
import type { Db } from "./db.js"
import { Igdb, type IgdbClient } from "./igdb.js"
import { Romm, type RommClient } from "./romm.js"
import { Scandex, type ScandexClient } from "./scandex.js"
import { Screenscraper, type ScreenscraperClient } from "./screenscraper.js"
import { SteamGrid, type SteamGridClient } from "./steamgriddb.js"
import { Steam, type SteamClient } from "./steam.js"
import { msg } from "./i18n.js"

/**
 * Services externes, réglables dans l'appli (assistant de premier lancement, Réglages) ou par
 * variables d'environnement, qui passent devant et ne se modifient pas depuis l'interface.
 * Les secrets ne repartent jamais vers le navigateur : on n'en montre que les 4 derniers caractères.
 */

type Field = { key: string; env: string; secret: boolean }
export const SERVICES = {
  igdb: [
    { key: "client_id", env: "IGDB_CLIENT_ID", secret: false },
    { key: "client_secret", env: "IGDB_CLIENT_SECRET", secret: true },
  ],
  steam: [
    { key: "api_key", env: "STEAM_API_KEY", secret: true },
    { key: "steam_id", env: "STEAM_ID", secret: false },
  ],
  scandex: [{ key: "token", env: "SCANDEX_TOKEN", secret: true }],
  // Deux jeux d'identifiants chez ScreenScraper : ceux du logiciel, et ceux de ton compte.
  screenscraper: [
    { key: "dev_id", env: "SCREENSCRAPER_DEV_ID", secret: false },
    { key: "dev_password", env: "SCREENSCRAPER_DEV_PASSWORD", secret: true },
    { key: "user", env: "SCREENSCRAPER_USER", secret: false },
    { key: "password", env: "SCREENSCRAPER_PASSWORD", secret: true },
  ],
  steamgriddb: [{ key: "api_key", env: "STEAMGRIDDB_API_KEY", secret: true }],
  romm: [
    { key: "url", env: "ROMM_URL", secret: false },
    { key: "api_token", env: "ROMM_API_TOKEN", secret: true },
  ],
} as const satisfies Record<string, readonly Field[]>

export type ServiceName = keyof typeof SERVICES
export const isServiceName = (s: string): s is ServiceName => Object.hasOwn(SERVICES, s)

type Source = "env" | "app" | null

function read(db: Db, service: ServiceName, f: Field): { value: string | null; source: Source } {
  const env = process.env[f.env]?.trim()
  if (env) return { value: env, source: "env" }
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(`${service}.${f.key}`) as { value: string } | undefined
  return row ? { value: row.value, source: "app" } : { value: null, source: null }
}

const values = (db: Db, service: ServiceName) => Object.fromEntries(SERVICES[service].map((f) => [f.key, read(db, service, f).value])) as Record<string, string | null>

export function servicesStatus(db: Db) {
  return Object.fromEntries(
    (Object.keys(SERVICES) as ServiceName[]).map((name) => {
      const fields = Object.fromEntries(
        SERVICES[name].map((f: Field) => {
          const { value, source } = read(db, name, f)
          const preview = value === null ? null : f.secret ? `••••${value.slice(-4)}` : value
          return [f.key, { set: value !== null, source, secret: f.secret, preview }]
        }),
      )
      return [name, { configured: Object.values(fields).every((f) => f.set), fields }]
    }),
  )
}

function validate(service: ServiceName, key: string, value: string) {
  if (value.length > 500) throw new ValidationError(msg("services.tooLong"))
  if (service === "steam" && key === "steam_id" && !/^\d{17}$/.test(value)) throw new ValidationError(msg("services.steamId"))
  if (service === "romm" && key === "url") {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new ValidationError(msg("services.rommUrlInvalid"))
    }
    if (!["http:", "https:"].includes(url.protocol)) throw new ValidationError(msg("services.rommUrlProtocol"))
    return value.replace(/\/+$/, "")
  }
  return value
}

/** Absent : inchangé ; null ou vide : retiré ; texte : enregistré. Un champ tenu par l'environnement ne bouge pas. */
export function saveService(db: Db, service: string, input: Record<string, unknown>) {
  if (!isServiceName(service)) throw new ValidationError(msg("services.unknown"))
  const fields: readonly Field[] = SERVICES[service]
  const writes: Array<[string, string | null]> = []
  for (const [key, raw] of Object.entries(input ?? {})) {
    const f = fields.find((x) => x.key === key)
    if (!f) throw new ValidationError(msg("services.unknownField", { key }))
    if (raw === undefined) continue
    if (process.env[f.env]?.trim()) throw new ValidationError(msg("services.envLocked", { env: f.env }))
    const value = typeof raw === "string" ? raw.trim() : raw === null ? "" : null
    if (value === null) throw new ValidationError(msg("services.invalidValue"))
    writes.push([`${service}.${key}`, value ? validate(service, key, value) : null])
  }
  db.transaction(() => {
    for (const [key, value] of writes) {
      if (value === null) db.prepare("DELETE FROM settings WHERE key = ?").run(key)
      else db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").run(key, value)
    }
  })()
}

type Overrides = {
  igdb?: IgdbClient | null
  steam?: SteamClient | null
  scandex?: ScandexClient | null
  romm?: RommClient | null
  screenscraper?: ScreenscraperClient | null
  steamgriddb?: SteamGridClient | null
}

/**
 * Les clients se construisent à la demande depuis la configuration du moment, et restent en
 * mémoire tant qu'elle ne change pas (IGDB garde ainsi son jeton Twitch). Les tests passent leurs
 * propres clients (`overrides`).
 */
export function createServices(db: Db, overrides: Overrides, fetchImpl: typeof fetch) {
  const cache = new Map<ServiceName, { sig: string; client: unknown }>()
  function build<T>(name: ServiceName, make: (v: Record<string, string>) => T): T | null {
    if (overrides[name] !== undefined) return overrides[name] as T | null
    const v = values(db, name)
    if (Object.values(v).some((x) => x === null)) return null
    const sig = JSON.stringify(v)
    const hit = cache.get(name)
    if (hit?.sig === sig) return hit.client as T
    const client = make(v as Record<string, string>)
    cache.set(name, { sig, client })
    return client
  }
  return {
    igdb: () => build<IgdbClient>("igdb", (v) => new Igdb(v.client_id, v.client_secret, fetchImpl)),
    steam: () => build<SteamClient>("steam", (v) => new Steam(v.api_key, v.steam_id, fetchImpl)),
    scandex: () => build<ScandexClient>("scandex", (v) => new Scandex(v.token, fetchImpl)),
    romm: () => build<RommClient>("romm", (v) => new Romm(v.url, v.api_token, fetchImpl)),
    screenscraper: () => build<ScreenscraperClient>("screenscraper", (v) => new Screenscraper(v.dev_id, v.dev_password, v.user, v.password, fetchImpl)),
    steamgriddb: () => build<SteamGridClient>("steamgriddb", (v) => new SteamGrid(v.api_key, fetchImpl)),
  }
}

export type Services = ReturnType<typeof createServices>

/** Bouton « Tester » : un vrai appel au service, avec un message lisible. */
export async function testService(services: Services, name: string): Promise<{ ok: boolean; message: string }> {
  if (!isServiceName(name)) throw new ValidationError(msg("services.unknown"))
  const client = services[name]()
  if (!client) return { ok: false, message: msg("services.test.notConfigured") }
  try {
    if (name === "igdb") return { ok: true, message: msg("services.test.igdb", { count: (await (client as IgdbClient).search("zelda")).length }) }
    if (name === "steam") return { ok: true, message: msg("services.test.steam", { count: (await (client as SteamClient).ownedGames()).length }) }
    if (name === "scandex") {
      await (client as ScandexClient).lookup("5026555245920")
      return { ok: true, message: msg("services.test.scandex") }
    }
    if (name === "screenscraper") {
      return { ok: true, message: msg("services.test.screenscraper", { count: (await (client as ScreenscraperClient).search("Tearaway")).length }) }
    }
    if (name === "steamgriddb") {
      return { ok: true, message: msg("services.test.steamgriddb", { count: (await (client as SteamGridClient).search("Tearaway")).length }) }
    }
    const romm = client as RommClient & { check?: () => Promise<number> }
    return { ok: true, message: msg("services.test.romm", { count: romm.check ? await romm.check() : 0 }) }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
}
