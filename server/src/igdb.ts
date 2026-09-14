// Client IGDB (API Twitch) : recherche de jeux et métadonnées, traduites en français.
// Les résumés IGDB sont en anglais : seul le résumé reste à traduire à la main.

const TOKEN_URL = "https://id.twitch.tv/oauth2/token"
const API_URL = "https://api.igdb.com/v4"

export const igdbImage = (imageId: string, size = "t_cover_big_2x") => `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`

// Identifiants IGDB relevés le 12/09/2026 (tables regions, release_date_regions, age_rating_organizations).
const LOCALIZATION_REGIONS: Record<number, string> = { 4: "Europe", 3: "Japon", 2: "Corée" }
const EUROPE_LOCALIZATION = 4
const EUROPE_RELEASE = 1
const WORLDWIDE_RELEASE = 8
const PEGI = 2
// DLC, mod, saison, pack, mise à jour : jamais un jeu en boîte.
const EXCLUDED_GAME_TYPES = "(1,5,7,13,14)"

// Les consoles gardent le nom IGDB, celui du catalogue (RomM) ; seul le PC est abrégé.
const PLATFORM_NAMES: Record<string, string> = {
  "PC (Microsoft Windows)": "PC",
}
export const platformName = (igdbName: string) => PLATFORM_NAMES[igdbName] ?? igdbName

// Libellés alignés sur ceux de collection.json.
const FR: Record<string, string> = {
  // genres
  Racing: "Course",
  Shooter: "Tir",
  Tactical: "Tactique",
  Adventure: "Aventure",
  "Role-playing (RPG)": "Jeu de rôle",
  Simulator: "Simulation",
  Indie: "Indépendant",
  "Real Time Strategy (RTS)": "Stratégie en temps réel",
  Strategy: "Stratégie",
  "Turn-based strategy (TBS)": "Stratégie au tour par tour",
  Fighting: "Combat",
  "Hack and slash/Beat 'em up": "Beat'em all",
  Sport: "Sport",
  Platform: "Plates-formes",
  Puzzle: "Réflexion",
  Arcade: "Arcade",
  Music: "Musique",
  "Point-and-click": "Point & click",
  "Quiz/Trivia": "Quiz",
  Pinball: "Flipper",
  "Visual Novel": "Visual novel",
  "Card & Board Game": "Cartes et plateau",
  MOBA: "MOBA",
  // thèmes
  Action: "Action",
  Fantasy: "Fantasy",
  "Science fiction": "Science-fiction",
  Horror: "Horreur",
  Thriller: "Thriller",
  Survival: "Survie",
  Historical: "Historique",
  Stealth: "Infiltration",
  Comedy: "Humour",
  Business: "Gestion",
  Drama: "Drame",
  "Non-fiction": "Non-fiction",
  Sandbox: "Bac à sable",
  Educational: "Éducatif",
  Kids: "Enfants",
  "Open world": "Monde ouvert",
  Warfare: "Guerre",
  Party: "Party game",
  "4X (explore, expand, exploit, and exterminate)": "4X",
  Erotic: "Érotique",
  Mystery: "Mystère",
  Romance: "Romance",
  // modes
  "Single player": "Solo",
  Multiplayer: "Multijoueur",
  "Co-operative": "Coopération",
  "Split screen": "Écran partagé",
  "Massively Multiplayer Online (MMO)": "MMO",
  "Battle Royale": "Battle royale",
  // vues
  "First person": "Vue subjective",
  "Third person": "Vue à la 3e personne",
  "Bird view / Isometric": "Vue isométrique",
  "Side view": "Vue de côté",
  Text: "Textuel",
  Auditory: "Audio",
  "Virtual Reality": "Réalité virtuelle",
}

type Named = { name: string }
type RawGame = {
  id: number
  name: string
  game_type?: number
  summary?: string
  first_release_date?: number
  cover?: { image_id: string }
  platforms?: Array<{ id: number; name: string }>
  genres?: Named[]
  themes?: Named[]
  game_modes?: Named[]
  player_perspectives?: Named[]
  involved_companies?: Array<{ company: Named; developer: boolean; publisher: boolean }>
  collections?: Named[]
  franchises?: Named[]
  age_ratings?: Array<{ organization?: number; rating_category?: { rating: string } }>
  release_dates?: Array<{ date?: number; platform?: number; release_region?: number }>
  game_localizations?: Array<{ name?: string; region?: number; cover?: { image_id: string } }>
  total_rating?: number
  url?: string
}

const SEARCH_FIELDS =
  "name,game_type,first_release_date,cover.image_id,platforms.name,game_localizations.name,game_localizations.region,game_localizations.cover.image_id"
const DETAIL_FIELDS = [
  "name,summary,first_release_date,cover.image_id,platforms.name,genres.name,themes.name,game_modes.name",
  "player_perspectives.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher",
  "collections.name,franchises.name,age_ratings.organization,age_ratings.rating_category.rating",
  "release_dates.date,release_dates.platform,release_dates.release_region",
  "game_localizations.name,game_localizations.region,game_localizations.cover.image_id,total_rating,url",
].join(",")

export type IgdbCandidate = {
  igdb_id: number
  /** Titre européen quand IGDB en connaît un (« FIFA Football 2005 »), sinon le titre principal. */
  name: string
  original_name: string | null
  year: number | null
  platforms: string[]
  cover: string | null
}

export type GameMeta = {
  igdb_id: number
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
  cover_url: string | null
}

export type IgdbGame = GameMeta & { platforms: string[]; covers: Array<{ label: string; url: string }> }

export interface IgdbClient {
  search(q: string): Promise<IgdbCandidate[]>
  game(igdbId: number, platform?: string): Promise<IgdbGame>
  /** Fiche IGDB de chaque appid Steam connu d'IGDB (external_games, source 1 = Steam). */
  steamIds?(appids: string[]): Promise<Map<string, number>>
}

const list = (values: Array<string | undefined> | undefined) => {
  const clean = [...new Set((values ?? []).filter((v): v is string => Boolean(v)))]
  return clean.length ? clean.join(", ") : null
}
const fr = (items: Named[] | undefined) => (items ?? []).map((i) => FR[i.name] ?? i.name)
const isoDay = (ts: number | undefined) => (ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null)
const europe = (raw: RawGame) => raw.game_localizations?.find((l) => l.region === EUROPE_LOCALIZATION)

const normalizeTitle = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

/**
 * IGDB classe mal les portages : pour « FIFA Soccer 2005 », la version PSP passait avant le jeu
 * principal. Titre exact (principal ou localisé) d'abord, puis jeu principal, puis l'ordre d'IGDB.
 */
function rank(games: RawGame[], q: string): RawGame[] {
  const nq = normalizeTitle(q)
  const score = (g: RawGame) => {
    const names = [g.name, ...(g.game_localizations ?? []).map((l) => l.name ?? "")].map(normalizeTitle)
    return (names.includes(nq) ? 0 : 2) + (g.game_type === undefined || g.game_type === 0 ? 0 : 1)
  }
  return games
    .map((g, i) => ({ g, i, s: score(g) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.g)
}

function toCandidate(raw: RawGame): IgdbCandidate {
  const eu = europe(raw)
  const cover = eu?.cover?.image_id ?? raw.cover?.image_id
  return {
    igdb_id: raw.id,
    name: eu?.name ?? raw.name,
    original_name: eu?.name && eu.name !== raw.name ? raw.name : null,
    year: raw.first_release_date ? new Date(raw.first_release_date * 1000).getUTCFullYear() : null,
    platforms: [...new Set((raw.platforms ?? []).map((p) => platformName(p.name)))],
    cover: cover ? igdbImage(cover, "t_cover_small_2x") : null,
  }
}

/**
 * Traduit une fiche IGDB dans nos champs. La date retenue est la sortie européenne sur la
 * plateforme de l'exemplaire, sinon la sortie mondiale, sinon la plus ancienne connue.
 */
export function mapGame(raw: RawGame, platform?: string): IgdbGame {
  const eu = europe(raw)
  const platformId = platform ? raw.platforms?.find((p) => platformName(p.name) === platform)?.id : undefined
  const dates = (raw.release_dates ?? [])
    .filter((d) => d.date && (platformId === undefined || d.platform === platformId))
    .sort((a, b) => a.date! - b.date!)
  const release =
    dates.find((d) => d.release_region === EUROPE_RELEASE) ?? dates.find((d) => d.release_region === WORLDWIDE_RELEASE) ?? dates[0]
  const companies = (role: "developer" | "publisher") =>
    list(raw.involved_companies?.filter((c) => c[role]).map((c) => c.company.name))
  const pegi = raw.age_ratings?.find((a) => a.organization === PEGI)?.rating_category?.rating

  const covers: IgdbGame["covers"] = []
  if (eu?.cover) covers.push({ label: "Europe", url: igdbImage(eu.cover.image_id) })
  if (raw.cover) covers.push({ label: "Principale", url: igdbImage(raw.cover.image_id) })
  for (const l of raw.game_localizations ?? []) {
    if (l.cover && l !== eu) covers.push({ label: LOCALIZATION_REGIONS[l.region ?? 0] ?? "Autre région", url: igdbImage(l.cover.image_id) })
  }

  return {
    igdb_id: raw.id,
    title: eu?.name ?? raw.name,
    summary: raw.summary?.trim() || null,
    developer: companies("developer"),
    publisher: companies("publisher"),
    release_date: isoDay(release?.date ?? raw.first_release_date),
    genres: list([...fr(raw.genres), ...fr(raw.themes)]),
    game_modes: list(fr(raw.game_modes)),
    perspective: list(fr(raw.player_perspectives)),
    series: raw.collections?.[0]?.name ?? raw.franchises?.[0]?.name ?? null,
    pegi: pegi ? `PEGI ${pegi}` : null,
    igdb_rating: raw.total_rating === undefined ? null : Math.round(raw.total_rating),
    igdb_url: raw.url ?? null,
    cover_url: covers[0]?.url ?? null,
    platforms: [...new Set((raw.platforms ?? []).map((p) => platformName(p.name)))],
    covers,
  }
}

export class IgdbError extends Error {}

export class Igdb implements IgdbClient {
  private token: { value: string; expiresAt: number } | null = null
  // Une recherche lance trois requêtes en parallèle : elles doivent partager la même demande de jeton.
  private pendingToken: Promise<string> | null = null

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return Promise.resolve(this.token.value)
    this.pendingToken ??= this.requestToken().finally(() => {
      this.pendingToken = null
    })
    return this.pendingToken
  }

  private async requestToken() {
    const params = new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, grant_type: "client_credentials" })
    const res = await this.fetchImpl(`${TOKEN_URL}?${params}`, { method: "POST", signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new IgdbError(`Authentification Twitch refusée (HTTP ${res.status}).`)
    const body = (await res.json()) as { access_token: string; expires_in: number }
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 }
    return this.token.value
  }

  private async query<T>(endpoint: string, body: string, retry = true): Promise<T[]> {
    const res = await this.fetchImpl(`${API_URL}/${endpoint}`, {
      method: "POST",
      headers: { "Client-ID": this.clientId, Authorization: `Bearer ${await this.accessToken()}` },
      body,
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 401 && retry) {
      this.token = null
      return this.query(endpoint, body, false)
    }
    if (!res.ok) throw new IgdbError(`IGDB a répondu HTTP ${res.status}.`)
    return (await res.json()) as T[]
  }

  /**
   * Cherche par titre principal, et aussi parmi les titres alternatifs et européens :
   * « FIFA Football 2005 » n'est connu d'IGDB que comme titre localisé de « FIFA Soccer 2005 ».
   */
  async search(q: string): Promise<IgdbCandidate[]> {
    const s = q.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim()
    if (s.length < 2) return []
    // Titre chargé de mentions d'édition (« Grid Autosport Black (Limited Edition) ») : on retente
    // sans les parenthèses puis en retirant les derniers mots, quatre essais au plus.
    const base = s.replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\s+/g, " ").trim().split(" ")
    const attempts = [s]
    for (let n = base.length; n >= 2; n--) attempts.push(base.slice(0, n).join(" "))
    for (const attempt of [...new Set(attempts)].slice(0, 4)) {
      const found = await this.searchOnce(attempt)
      if (found.length) return found
    }
    return []
  }

  private async searchOnce(s: string): Promise<IgdbCandidate[]> {
    // Mot à mot : « ratchet gladiator » doit trouver « Ratchet: Gladiator », ponctuation comprise.
    const words = s
      .split(" ")
      .map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, ""))
      .filter((w) => w.length >= 2)
      .slice(0, 6)
    const nameMatch = (words.length ? words : [s]).map((w) => `name ~ *"${w}"*`).join(" & ")
    const [direct, alternative, localized] = await Promise.all([
      this.query<RawGame>("games", `search "${s}"; fields ${SEARCH_FIELDS}; where game_type != ${EXCLUDED_GAME_TYPES}; limit 20;`),
      this.query<{ game: number }>("alternative_names", `fields game; where ${nameMatch}; limit 10;`),
      this.query<{ game: number }>("game_localizations", `fields game; where ${nameMatch}; limit 10;`),
    ])
    const known = new Set(direct.map((g) => g.id))
    const extraIds = [...new Set([...alternative, ...localized].map((x) => x.game))].filter((id) => id && !known.has(id))
    const extra = extraIds.length
      ? await this.query<RawGame>(
          "games",
          `fields ${SEARCH_FIELDS}; where id = (${extraIds.join(",")}) & game_type != ${EXCLUDED_GAME_TYPES}; limit ${extraIds.length};`,
        )
      : []
    return rank([...direct, ...extra], s).map(toCandidate)
  }

  async steamIds(appids: string[]) {
    const map = new Map<string, number>()
    for (let i = 0; i < appids.length; i += 400) {
      const chunk = appids.slice(i, i + 400).filter((a) => /^\d+$/.test(a))
      if (!chunk.length) continue
      const rows = await this.query<{ game?: number; uid: string }>(
        "external_games",
        `fields game,uid; where external_game_source = 1 & uid = (${chunk.map((a) => `"${a}"`).join(",")}); limit 500;`,
      )
      for (const r of rows) if (r.game && !map.has(r.uid)) map.set(r.uid, r.game)
    }
    return map
  }

  async game(igdbId: number, platform?: string): Promise<IgdbGame> {
    const [raw] = await this.query<RawGame>("games", `fields ${DETAIL_FIELDS}; where id = ${Math.trunc(igdbId)};`)
    if (!raw) throw new IgdbError(`Jeu IGDB ${igdbId} introuvable.`)
    return mapGame(raw, platform)
  }
}

export function igdbFromEnv(): Igdb | null {
  const id = process.env.IGDB_CLIENT_ID?.trim()
  const secret = process.env.IGDB_CLIENT_SECRET?.trim()
  return id && secret ? new Igdb(id, secret) : null
}
