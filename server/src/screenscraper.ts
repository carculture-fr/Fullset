import { msg } from "./i18n.js"

/**
 * ScreenScraper (screenscraper.fr) : la base francophone du retrogaming. C'est la seule à porter
 * les titres français des jeux (« Bob l'éponge : Bataille pour Bikini Bottom ») et une jaquette
 * par région, là où IGDB ne connaît souvent que le titre anglais.
 *
 * Deux jeux d'identifiants, comme chez eux : ceux du logiciel (devid / devpassword, délivrés sur
 * demande aux applications gratuites) et ceux du compte de la personne (ssid / sspassword), qui
 * portent ses quotas. Les deux se règlent dans l'appli, comme les autres services.
 *
 * Piège vérifié le 18/09/2026 : les adresses de médias que rend l'API **portent le devid et le
 * devpassword en clair**. Elles ne partent donc jamais vers le navigateur : l'appli ne montre
 * qu'un repère opaque (« 62/136706/box-2D(eu) ») et va chercher l'image elle-même.
 */

const API = "https://api.screenscraper.fr/api2"
const SOFT = "fullset"
const TIMEOUT = 20_000

/** Types de médias qui sont des jaquettes, du plus utile au moins. */
const COVER_TYPES = ["box-2D", "box-3D", "box-texture", "box-2D-side", "box-2D-back", "support-2D"] as const
/** Régions préférées pour une collection européenne. */
const REGION_RANK: Record<string, number> = { eu: 0, fr: 1, wor: 2, ss: 3, us: 4, jp: 5 }

export class ScreenscraperError extends Error {}

export type ScreenscraperCover = {
  /** Repère sans identifiant, à repasser à `media()` : « 62/136706/box-2D(eu) ». */
  key: string
  type: string
  region: string | null
  format: string
}

export type ScreenscraperGame = {
  id: number
  systemId: number
  /** Titre européen quand il existe, sinon le titre commun. */
  name: string
  system: string
  covers: ScreenscraperCover[]
}

export interface ScreenscraperClient {
  /** Nom de console normalisé -> identifiant de système chez ScreenScraper. */
  systems(): Promise<Map<string, number>>
  search(title: string, platform?: string): Promise<ScreenscraperGame[]>
  media(key: string, maxWidth?: number): Promise<{ bytes: Buffer; mime: string }>
}

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

type RawName = { region?: string; text?: string }
type RawMedia = { type?: string; region?: string; format?: string }
type RawGame = { id?: number | string; noms?: RawName[]; systeme?: { id?: number | string; text?: string }; medias?: RawMedia[] }

const KEY = /^(\d{1,5})\/(\d{1,9})\/([A-Za-z0-9()\-_]{1,40})$/

export class Screenscraper implements ScreenscraperClient {
  private cachedSystems: Map<string, number> | null = null

  constructor(
    private readonly devId: string,
    private readonly devPassword: string,
    private readonly user: string,
    private readonly password: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Identifiants de l'appel. Cet objet ne doit jamais sortir d'ici : il porte deux mots de passe. */
  private credentials() {
    return {
      devid: this.devId,
      devpassword: this.devPassword,
      softname: SOFT,
      output: "json",
      ssid: this.user,
      sspassword: this.password,
    }
  }

  /**
   * Appel à l'API. L'adresse n'apparaît dans aucun message d'erreur : elle porte les mots de
   * passe. ScreenScraper répond en texte brut (« Erreur de login… ») quand ça coince.
   */
  private async call(endpoint: string, params: Record<string, string>) {
    const query = new URLSearchParams({ ...this.credentials(), ...params })
    let res: Response
    try {
      res = await this.fetchImpl(`${API}/${endpoint}?${query}`, { signal: AbortSignal.timeout(TIMEOUT) })
    } catch (err) {
      throw new ScreenscraperError(msg("screenscraper.unreachable", { error: (err as Error).message }))
    }
    const body = await res.text()
    if (!res.ok) throw new ScreenscraperError(msg("screenscraper.http", { status: res.status }))
    if (!body.trim().startsWith("{")) throw new ScreenscraperError(msg("screenscraper.refused", { reason: body.trim().slice(0, 120) }))
    try {
      return JSON.parse(body) as { response?: Record<string, unknown> }
    } catch {
      throw new ScreenscraperError(msg("screenscraper.unreadable"))
    }
  }

  async systems() {
    if (this.cachedSystems) return this.cachedSystems
    const body = await this.call("systemesListe.php", {})
    const list = (body.response?.systemes ?? []) as Array<{ id?: number | string; noms?: Record<string, string> }>
    const map = new Map<string, number>()
    for (const s of list) {
      const id = Number(s.id)
      if (!Number.isInteger(id)) continue
      // Un système porte plusieurs noms (européen, commun, constructeur) : tous mènent à son id.
      for (const nom of Object.values(s.noms ?? {})) {
        for (const part of String(nom).split(/\s*\/\s*/)) {
          const key = norm(part)
          if (key && !map.has(key)) map.set(key, id)
        }
      }
    }
    this.cachedSystems = map
    return map
  }

  /** Identifiant de système pour une console du catalogue Fullset, si ScreenScraper la connaît. */
  private async systemIdFor(platform: string | undefined) {
    if (!platform) return null
    const systems = await this.systems()
    const key = norm(platform)
    if (systems.has(key)) return systems.get(key)!
    // « Nintendo GameCube » chez nous, « Game Cube » chez eux : on retente sans le constructeur.
    const sans = key.replace(/^(nintendo|sony|microsoft|sega|atari|snk|commodore|bandai|nec) /, "")
    return systems.get(sans) ?? null
  }

  async search(title: string, platform?: string) {
    const clean = title.trim()
    if (clean.length < 2) return []
    const systemId = await this.systemIdFor(platform)
    const body = await this.call("jeuRecherche.php", {
      recherche: clean,
      ...(systemId === null ? {} : { systemeid: String(systemId) }),
    })
    const jeux = (body.response?.jeux ?? []) as RawGame[]
    return jeux.map((jeu) => this.toGame(jeu)).filter((g): g is ScreenscraperGame => g !== null)
  }

  private toGame(jeu: RawGame): ScreenscraperGame | null {
    const id = Number(jeu.id)
    const systemId = Number(jeu.systeme?.id)
    if (!Number.isInteger(id) || !Number.isInteger(systemId)) return null
    const noms = jeu.noms ?? []
    const name = (noms.find((n) => n.region === "eu") ?? noms.find((n) => n.region === "wor") ?? noms[0])?.text?.trim()
    if (!name) return null

    const covers: ScreenscraperCover[] = []
    for (const media of jeu.medias ?? []) {
      const type = String(media.type ?? "")
      if (!COVER_TYPES.includes(type as (typeof COVER_TYPES)[number])) continue
      const region = media.region ? String(media.region) : null
      covers.push({
        key: `${systemId}/${id}/${type}${region ? `(${region})` : ""}`,
        type,
        region,
        format: String(media.format ?? "png"),
      })
    }
    covers.sort(
      (a, b) =>
        COVER_TYPES.indexOf(a.type as (typeof COVER_TYPES)[number]) - COVER_TYPES.indexOf(b.type as (typeof COVER_TYPES)[number]) ||
        (REGION_RANK[a.region ?? ""] ?? 9) - (REGION_RANK[b.region ?? ""] ?? 9),
    )
    return { id, systemId, name, system: String(jeu.systeme?.text ?? ""), covers }
  }

  /** Va chercher l'image derrière un repère. Le repère est vérifié : il vient du navigateur. */
  async media(key: string, maxWidth = 600) {
    const parts = KEY.exec(key)
    if (!parts) throw new ScreenscraperError(msg("screenscraper.badKey"))
    const [, systemId, gameId, media] = parts
    const query = new URLSearchParams({ ...this.credentials(), systemeid: systemId, jeuid: gameId, media, maxwidth: String(maxWidth) })
    let res: Response
    try {
      res = await this.fetchImpl(`${API}/mediaJeu.php?${query}`, { signal: AbortSignal.timeout(TIMEOUT) })
    } catch (err) {
      throw new ScreenscraperError(msg("screenscraper.unreachable", { error: (err as Error).message }))
    }
    if (!res.ok) throw new ScreenscraperError(msg("screenscraper.http", { status: res.status }))
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
    const bytes = Buffer.from(await res.arrayBuffer())
    // Média absent : l'API répond « NOMEDIA » en texte, avec un code 200.
    if (!mime.startsWith("image/") || bytes.length < 100) throw new ScreenscraperError(msg("screenscraper.noMedia"))
    return { bytes, mime }
  }
}
