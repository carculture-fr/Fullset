import type { RommRom } from "./library.js"
import { msg } from "./i18n.js"

export interface RommClient {
  romFor(igdbId: number): Promise<RommRom | null>
  /** Fiches IGDB des ROM d'une console, pour dire d'une liste ce qu'on a déjà en ROM. */
  igdbIdsForPlatform?(platform: string): Promise<{ platform: string; ids: Set<number> } | null>
}

type RawRom = { id: number; name: string; igdb_id?: number | null; platform_display_name?: string; platform_slug?: string; fs_size_bytes?: number; missing_from_fs?: boolean }
type RawPlatform = { id: number; name?: string; display_name?: string; custom_name?: string | null; slug?: string; igdb_id?: number | null }

const squash = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")

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
      throw new Error(msg("romm.http", { status: res.status }))
    }
    this.cache.set(igdbId, { at: Date.now(), rom })
    return rom
  }

  /**
   * Toutes les fiches IGDB des ROM d'une console, lues par pages de 500. Les fichiers vides et
   * les ROM absentes du disque ne comptent pas : on ne dit pas « tu l'as » pour un fichier fantôme.
   */
  async igdbIdsForPlatform(platform: string) {
    const headers = { Authorization: `Bearer ${this.token}` }
    const res = await this.fetchImpl(`${this.baseUrl}/api/platforms`, { headers, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(msg("romm.http", { status: res.status }))
    const platforms = (await res.json()) as RawPlatform[]
    const found = platforms.find((p) => [p.custom_name, p.display_name, p.name].some((n) => n && squash(n) === squash(platform)))
    if (!found) return null
    const ids = new Set<number>()
    const size = 500
    for (let offset = 0; offset < 50_000; offset += size) {
      const page = await this.fetchImpl(`${this.baseUrl}/api/roms?platform_id=${found.id}&limit=${size}&offset=${offset}`, { headers, signal: AbortSignal.timeout(30_000) })
      if (!page.ok) throw new Error(msg("romm.http", { status: page.status }))
      const body = (await page.json()) as { items?: RawRom[] }
      const items = body.items ?? []
      for (const rom of items) if (rom.igdb_id && (rom.fs_size_bytes ?? 1) > 0 && !rom.missing_from_fs) ids.add(rom.igdb_id)
      if (items.length < size) break
    }
    return { platform: found.custom_name ?? found.display_name ?? found.name ?? platform, ids }
  }

  /** Vérifie l'adresse et le jeton (bouton « Tester » des réglages). */
  async check() {
    const res = await this.fetchImpl(`${this.baseUrl}/api/platforms`, { headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(8000), redirect: "error" })
    if (res.status === 401 || res.status === 403) throw new Error(msg("romm.tokenRefused"))
    if (!res.ok) throw new Error(msg("romm.http", { status: res.status }))
    const platforms = (await res.json()) as unknown[]
    return Array.isArray(platforms) ? platforms.length : 0
  }
}

export function rommFromEnv(): Romm | null {
  const url = process.env.ROMM_URL?.trim().replace(/\/+$/, "")
  const token = process.env.ROMM_API_TOKEN?.trim()
  return url && token ? new Romm(url, token) : null
}
