import { msg } from "./i18n.js"

/**
 * SteamGridDB (steamgriddb.com) : jaquettes et artworks déposés par une communauté, avec une clé
 * gratuite par personne. Utile là où IGDB n'a rien et où ScreenScraper ne connaît pas la console
 * (jeux récents, éditions particulières). Les images sont servies par leur CDN, sans identifiant
 * dans l'adresse : elles peuvent être proposées telles quelles, puis téléchargées au choix.
 *
 * L'API vit sur www.steamgriddb.com ; api.steamgriddb.com ne résout pas (vérifié le 18/09/2026).
 */

const API = "https://www.steamgriddb.com/api/v2"
const TIMEOUT = 15_000
/** Format d'une jaquette de boîte : portrait 2:3, comme les jaquettes de la collection. */
const COVER_DIMENSIONS = "600x900,342x482,660x930"

export class SteamGridError extends Error {}

export type SteamGridGame = { id: number; name: string }
export type SteamGridImage = {
  id: number
  url: string
  thumb: string
  width: number
  height: number
  style: string | null
  author: string | null
}

export interface SteamGridClient {
  search(q: string): Promise<SteamGridGame[]>
  covers(gameId: number): Promise<SteamGridImage[]>
}

export class SteamGrid implements SteamGridClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(path: string): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(`${API}${path}`, { headers: { Authorization: `Bearer ${this.apiKey}` }, signal: AbortSignal.timeout(TIMEOUT) })
    } catch (err) {
      throw new SteamGridError(msg("steamgriddb.unreachable", { error: (err as Error).message }))
    }
    if (res.status === 401 || res.status === 403) throw new SteamGridError(msg("steamgriddb.keyRefused"))
    if (!res.ok) throw new SteamGridError(msg("steamgriddb.http", { status: res.status }))
    const body = (await res.json()) as { success?: boolean; data?: T; errors?: string[] }
    if (!body.success) throw new SteamGridError(msg("steamgriddb.refused", { reason: (body.errors ?? []).join(", ").slice(0, 120) }))
    return (body.data ?? []) as T
  }

  async search(q: string) {
    const clean = q.trim()
    if (clean.length < 2) return []
    const rows = await this.call<Array<{ id?: number; name?: string }>>(`/search/autocomplete/${encodeURIComponent(clean)}`)
    return rows.flatMap((r) => (Number.isInteger(r.id) && r.name ? [{ id: r.id as number, name: r.name }] : []))
  }

  async covers(gameId: number) {
    if (!Number.isInteger(gameId) || gameId <= 0) return []
    const rows = await this.call<Array<Record<string, unknown>>>(`/grids/game/${gameId}?dimensions=${COVER_DIMENSIONS}&types=static&nsfw=false&humor=false`)
    return rows.flatMap((r) => {
      const url = typeof r.url === "string" ? r.url : null
      if (!url || !url.startsWith("https://")) return []
      return [
        {
          id: Number(r.id) || 0,
          url,
          thumb: typeof r.thumb === "string" ? r.thumb : url,
          width: Number(r.width) || 0,
          height: Number(r.height) || 0,
          style: typeof r.style === "string" ? r.style : null,
          author: typeof (r.author as { name?: string } | undefined)?.name === "string" ? ((r.author as { name: string }).name) : null,
        },
      ]
    })
  }
}
