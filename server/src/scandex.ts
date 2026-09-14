import type { Db } from "./db.js"
import { platformName } from "./igdb.js"

// ScanDex (scandex.gamery.app) : environ 100 000 codes-barres de jeux reliés à leur fiche IGDB.
// Mesuré le 14/09/2026 sur 40 codes européens (Open Products Facts) : 18 trouvés, dont 3 faux
// (Final Fantasy XIII rendu en XIII-2, Resident Evil 2 en « 1.5 »…). C'est donc une
// **suggestion**, toujours confirmée par l'utilisateur, jamais un rattachement automatique.

export type ScandexGame = { igdb_id: number; name: string; platform: string }

export interface ScandexClient {
  lookup(ean: string): Promise<ScandexGame | null>
}

export class ScandexError extends Error {}

const API = "https://scandex.gamery.app/api/v2/lookup"
// Une réponse (trouvée ou non) est gardée un mois : le service est jeune, ses données bougent.
const CACHE_DAYS = 30

export class Scandex implements ScandexClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async lookup(ean: string) {
    let res: Response
    try {
      res = await this.fetchImpl(`${API}?value=${encodeURIComponent(ean)}`, {
        headers: { Authorization: this.token, "User-Agent": "Fullset (inventaire de jeux video auto-heberge; https://github.com/carculture-fr/Fullset)" },
        signal: AbortSignal.timeout(8000),
      })
    } catch (err) {
      throw new ScandexError(`ScanDex injoignable : ${(err as Error).message}`)
    }
    if (res.status === 404) return null
    if (!res.ok) throw new ScandexError(`ScanDex a répondu HTTP ${res.status}`)
    const body = (await res.json()) as { igdb_metadata?: { id?: number; name?: string; platform?: { name?: string } } }
    const m = body.igdb_metadata
    if (!m?.id || !m.name) return null
    return { igdb_id: m.id, name: m.name, platform: platformName(m.platform?.name ?? "") }
  }
}

export function scandexFromEnv(): Scandex | null {
  const token = process.env.SCANDEX_TOKEN?.trim()
  return token ? new Scandex(token) : null
}

/** Consultation avec cache en base : un code déjà demandé ne repart pas chez ScanDex avant un mois. */
export async function identifyBarcode(db: Db, client: ScandexClient | null, ean: string, now = Date.now()): Promise<ScandexGame | null> {
  const cached = db.prepare("SELECT igdb_id, name, platform, looked_up_at FROM barcode_lookups WHERE ean = ?").get(ean) as
    | { igdb_id: number | null; name: string | null; platform: string | null; looked_up_at: number }
    | undefined
  if (cached && now - cached.looked_up_at < CACHE_DAYS * 86_400_000) {
    return cached.igdb_id && cached.name ? { igdb_id: cached.igdb_id, name: cached.name, platform: cached.platform ?? "" } : null
  }
  if (!client) return null
  const game = await client.lookup(ean)
  db.prepare(
    `INSERT INTO barcode_lookups (ean, igdb_id, name, platform, looked_up_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ean) DO UPDATE SET igdb_id = excluded.igdb_id, name = excluded.name, platform = excluded.platform, looked_up_at = excluded.looked_up_at`,
  ).run(ean, game?.igdb_id ?? null, game?.name ?? null, game?.platform ?? null, now)
  return game
}
