import type { RommRom } from "./library.js"

export interface RommClient {
  romFor(igdbId: number): Promise<RommRom | null>
}

type RawRom = { id: number; name: string; platform_display_name?: string; platform_slug?: string; fs_size_bytes?: number; missing_from_fs?: boolean }

/**
 * Cherche dans RomM la ROM d'un jeu par son identifiant IGDB (`/api/roms/by-metadata-provider`).
 * RomM n'en renvoie qu'une, quelle que soit la plateforme. Écartées : les fichiers vides de la
 * solution d'attente « Ma collection physique » (0 octet) et les ROM absentes du disque.
 * Réponses gardées 6 h en mémoire ; 3 s au plus, pour ne jamais retenir l'affichage d'une fiche.
 */
export class Romm implements RommClient {
  private cache = new Map<number, { at: number; rom: RommRom | null }>()

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly ttlMs = 6 * 3600_000,
  ) {}

  async romFor(igdbId: number): Promise<RommRom | null> {
    const hit = this.cache.get(igdbId)
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.rom
    const res = await this.fetchImpl(`${this.baseUrl}/api/roms/by-metadata-provider?igdb_id=${Math.trunc(igdbId)}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(3000),
    })
    let rom: RommRom | null = null
    if (res.ok) {
      const body = (await res.json()) as RawRom | RawRom[]
      const raw = Array.isArray(body) ? body[0] : body
      if (raw && (raw.fs_size_bytes ?? 0) > 0 && !raw.missing_from_fs) {
        rom = { id: raw.id, name: raw.name, platform: raw.platform_display_name ?? raw.platform_slug ?? "", url: `${this.baseUrl}/rom/${raw.id}` }
      }
    } else if (res.status !== 404) {
      throw new Error(`RomM a répondu HTTP ${res.status}.`)
    }
    this.cache.set(igdbId, { at: Date.now(), rom })
    return rom
  }
}

export function rommFromEnv(): Romm | null {
  const url = process.env.ROMM_URL?.trim().replace(/\/+$/, "")
  const token = process.env.ROMM_API_TOKEN?.trim()
  return url && token ? new Romm(url, token) : null
}
