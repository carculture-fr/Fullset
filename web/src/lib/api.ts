import type { LibraryCopy } from "./library"

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Émis quand la session a expiré : l'application repasse sur l'écran de connexion. */
export const UNAUTHORIZED_EVENT = "fullset:unauthorized"

async function handle<T>(path: string, res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}))
  if (res.status === 401 && !path.startsWith("/api/auth/")) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Erreur ${res.status}`)
  return body as T
}

/** Hors ligne, l'application se consulte (données en cache) mais n'enregistre rien. */
const offlineGuard = (method = "GET") => {
  if (method !== "GET" && !navigator.onLine) throw new ApiError(0, "Hors ligne : rien n'est enregistré tant que le réseau n'est pas revenu.")
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  offlineGuard(init?.method)
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } })
  return handle<T>(path, res)
}

export const send = <T>(method: string, path: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export async function upload<T>(path: string, blob: Blob, filename = "image.jpg"): Promise<T> {
  offlineGuard("POST")
  const form = new FormData()
  form.append("file", blob, filename)
  return handle<T>(path, await fetch(path, { method: "POST", body: form }))
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Erreur inconnue.")

export type Health = { ok: boolean; version: string; schema: number; igdb: boolean; time: string }
export type Me = { setupRequired: boolean; authenticated: boolean }
export type Account = { username: string; display_name: string | null; email: string | null }
export type KnownBarcode = { ean: string; game_id: number; edition: string | null }
export type SteamCandidate = { appid: number; name: string; playtime_minutes: number; last_played: number | null; igdb_id: number | null }
export type SteamStatus = { configured: boolean; synced_at: string | null; owned: number; linked: number; candidates: number }
export type SteamSyncReport = { owned: number; recognised: number; linked: number; playtime: number; candidates: number }
export type BarcodeRow = KnownBarcode & { title: string; platform: string; created_at: string | null; on_copy: boolean }
export type BarcodeIdentify = {
  ean: string
  configured: boolean
  suggestion: { igdb_id: number; name: string; platform: string } | null
  owned: Array<{ id: number; platform: string }>
}

export type Summary = {
  games: number
  copies: number
  physical: number
  digital: number
  spentCents: number
  byPlatform: Array<{ platform: string; games: number; copies: number; spentCents: number }>
}

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
  value: { estimatedCents: number; estimatedCopies: number; costOfEstimatedCents: number }
  wishlist: { count: number; targetCents: number }
  hardware: {
    count: number
    spentCents: number
    byKind: Breakdown
    byPlatform: Breakdown
    value: { estimatedCents: number; estimatedItems: number }
  }
}

export type HardwareItem = {
  id: number
  kind: string
  platform: string
  model: string | null
  edition: string | null
  color: string | null
  region: string | null
  content: string | null
  condition_item: string | null
  condition_box: string | null
  condition_manual: string | null
  working: string | null
  price_cents: number | null
  purchase_date: string | null
  purchase_place: string | null
  serial_number: string | null
  comment: string | null
  value_cents: number | null
  valued_on: string | null
  photo: string | null
  photo_count: number
  /** Image par défaut (Wikimedia Commons), montrée tant qu'il n'y a pas de photo. */
  image: string | null
  image_credit: string | null
  image_page: string | null
}

export type CatalogPlatform = { name: string; kind: string | null; family: string | null; generation: number | null; models: string[]; used: number }

export type CommonsImage = { title: string; thumb: string; url: string; page: string; license: string | null; artist: string | null }

export type HardwareDetail = HardwareItem & { photos: Photo[]; valuations: Valuation[] }

export type Valuation = { id: number; amount_cents: number; valued_on: string; source: string; note: string | null }
export type RommRom = { id: number; name: string; platform: string; url: string }

export type WishItem = {
  id: number
  igdb_id: number | null
  platform: string | null
  title: string
  cover_url: string | null
  target_price_cents: number | null
  note: string | null
  created_at: string
  owned_game_id: number | null
}

export type Photo = { id: number; url: string }

export type CopyDetail = LibraryCopy & {
  completion_date: string | null
  play_time_hours: number | null
  completion_pct: number | null
  rating: number | null
  barcode: string | null
  comment: string | null
  photos: Photo[]
  valuations: Valuation[]
}

export type GameDetail = {
  id: number
  igdb_id: number | null
  platform: string
  title: string
  summary: string | null
  developer: string | null
  publisher: string | null
  release_date: string | null
  genres: string | null
  game_modes: string | null
  perspective: string | null
  series: string | null
  pegi: string | null
  igdb_rating: number | null
  igdb_url: string | null
  cover: string | null
  cover_source: string | null
  steam_appid: number | null
  copies: CopyDetail[]
  romm?: RommRom | null
}

export type IgdbCandidate = {
  igdb_id: number
  name: string
  original_name: string | null
  year: number | null
  platforms: string[]
  cover: string | null
}

export type CoverOption = { label: string; url: string }

export type LegacyRow = {
  index: number
  title: string
  platform: string
  copy: Record<string, string | null>
  estimatedCents: number | null
  warnings: string[]
  status: "duplicate" | "sure" | "check" | "none"
  duplicate: { gameId: number; copyId: number } | null
  candidates: IgdbCandidate[]
  proposed: number | null
}

export type LegacyReport = { copies: number; gamesCreated: number; valuations: number }
