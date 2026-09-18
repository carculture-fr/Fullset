import { msg } from "./i18n.js"

/**
 * Listes de référence de full-set.net : pour une console, les jeux sortis en boîte, avec leur
 * cote moyenne. Le site sert des pages HTML statiques dont chaque ligne porte ses données en
 * attributs (`data-fs-index`, `data-fs-name`, `data-fs-price`) : c'est ce qu'on lit, le reste
 * de la mise en page peut changer sans rien casser. Rien n'est récupéré tout seul : une liste
 * n'est lue que sur demande (bouton « Mettre à jour »), et gardée en base ensuite.
 */

export class CatalogSourceError extends Error {}

export const FULLSETNET = "full-set.net"
export const FULLSETNET_URL = "https://full-set.net"
export const UA = "Fullset/1.0 (collection personnelle ; https://github.com/carculture-fr/Fullset)"
const MAX_BYTES = 8_000_000

export type SourceList = {
  /** Identifiant de la liste chez la source (« psvita_eu »), et clé de la liste enregistrée. */
  slug: string
  /** Nom affiché, celui de la source. */
  name: string
  /** Console du catalogue Fullset, pour rapprocher les jeux de la collection. */
  platform: string
  region: string | null
  /**
   * Liste dont cette liste emprunte les jaquettes. Les listes régionales (« PS1 (PAL) ») n'ont
   * pas leurs propres images : elles pointent sur celles de la liste complète, qui les numérote
   * autrement. Le rapprochement se fait sur l'adresse de la fiche, commune aux deux listes.
   */
  imagesFrom?: string
}

// Les 29 listes publiées par full-set.net, rattachées aux noms de consoles du catalogue.
export const SOURCE_LISTS: readonly SourceList[] = [
  { slug: "gamewatch", name: "Game & Watch", platform: "Game & Watch", region: null },
  { slug: "gameboy", name: "Game Boy", platform: "Game Boy", region: null },
  { slug: "gameboyadvance", name: "Game Boy Advance", platform: "Game Boy Advance", region: null },
  { slug: "gamecube", name: "Game Cube", platform: "Nintendo GameCube", region: null },
  { slug: "nes", name: "NES", platform: "Nintendo Entertainment System", region: null },
  { slug: "nintendo64", name: "Nintendo 64", platform: "Nintendo 64", region: null },
  { slug: "snes", name: "Super NES", platform: "Super Nintendo Entertainment System", region: null },
  { slug: "wiiu", name: "Wii U", platform: "Wii U", region: null },
  { slug: "sega32x", name: "32X", platform: "Sega 32X", region: null },
  { slug: "dreamcast_pal", name: "Dreamcast (PAL)", platform: "Dreamcast", region: "PAL (Europe)" },
  { slug: "gamegear_pal", name: "Game Gear (PAL)", platform: "Sega Game Gear", region: "PAL (Europe)" },
  { slug: "mastersystem_pal", name: "Master System (PAL)", platform: "Sega Master System", region: "PAL (Europe)" },
  { slug: "megadrive_pal", name: "Megadrive (PAL)", platform: "Sega Mega Drive/Genesis", region: "PAL (Europe)" },
  { slug: "megacd", name: "Mega CD", platform: "Sega CD", region: null },
  { slug: "saturn", name: "Saturn", platform: "Sega Saturn", region: null },
  { slug: "psx", name: "PS1", platform: "PlayStation", region: null },
  { slug: "psx_pal", name: "PS1 (PAL)", platform: "PlayStation", region: "PAL (Europe)", imagesFrom: "psx" },
  { slug: "psx_platinum", name: "PS1 Platinum", platform: "PlayStation", region: "PAL (Europe)", imagesFrom: "psx" },
  { slug: "ps2_pal", name: "PS2 (PAL)", platform: "PlayStation 2", region: "PAL (Europe)" },
  { slug: "psp", name: "PSP", platform: "PlayStation Portable", region: null },
  { slug: "psvita_eu", name: "PS Vita (PAL)", platform: "PlayStation Vita", region: "PAL (Europe)" },
  { slug: "xbox", name: "XBox", platform: "Xbox", region: null },
  { slug: "xbox_pal", name: "XBox (PAL)", platform: "Xbox", region: "PAL (Europe)", imagesFrom: "xbox" },
  { slug: "xbox360_pal", name: "XBox 360 (PAL)", platform: "Xbox 360", region: "PAL (Europe)" },
  { slug: "atari2600", name: "Atari 2600", platform: "Atari 2600", region: null },
  { slug: "commodore64", name: "Commodore 64", platform: "Commodore 64", region: null },
  { slug: "jaguar", name: "Jaguar", platform: "Atari Jaguar", region: null },
  { slug: "neogeo", name: "Neo Geo", platform: "Neo Geo AES", region: null },
  { slug: "neogeopocket", name: "Neo Geo Pocket", platform: "Neo Geo Pocket", region: null },
]

export const sourceList = (slug: unknown) => SOURCE_LISTS.find((l) => l.slug === String(slug ?? "")) ?? null

/** Page d'où vient la liste : l'appli dit toujours à qui elle emprunte ses données. */
export const sourceUrl = (slug: string) => `${FULLSETNET_URL}/collection/${slug}.html`

export type SourceItem = {
  position: number
  title: string
  url: string | null
  price_cents: number | null
  /** Numéro de la jaquette chez la source, quand elle en a une (voir `coverUrl`). */
  cover_pos?: number | null
}

/**
 * Adresse de la jaquette d'un jeu chez la source. Elle se déduit de la liste et du numéro du
 * jeu : aucune recherche, aucune fiche à lire. Le site refuse d'afficher ses images sur un autre
 * domaine (403 sur le référent), donc Fullset les télécharge et les sert lui-même.
 */
export const coverUrl = (list: SourceList, position: number) => `${FULLSETNET_URL}/covers/${list.imagesFrom ?? list.slug}/${position}.jpg`

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)

const clean = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()

/** Lit les lignes de jeux d'une page de collection. Une page sans ligne exploitable est une erreur. */
export function parseSourcePage(html: string): SourceItem[] {
  const items: SourceItem[] = []
  const seen = new Set<number>()
  for (const [row] of html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)) {
    const cell = /<td class=['"]le_nom['"]>([\s\S]*?)<\/td>/.exec(row)
    if (!cell) continue
    const title = clean(/data-fs-name=['"]([^'"]*)['"]/.test(row) ? (/<a[^>]*>([\s\S]*?)<\/a>/.exec(cell[1])?.[1] ?? cell[1]) : cell[1])
    if (!title) continue
    const position = Number(/data-fs-index=['"](\d+)['"]/.exec(row)?.[1] ?? items.length + 1)
    if (seen.has(position)) continue
    seen.add(position)
    const price = Number(/data-fs-price=['"]([\d.]+)['"]/.exec(row)?.[1])
    const href = /href=['"]([^'"]*\/item\/[^'"]*)['"]/.exec(row)?.[1] ?? null
    items.push({
      position,
      // Par défaut, la jaquette porte le numéro du jeu dans sa propre liste.
      cover_pos: position,
      title,
      url: href && href.startsWith(FULLSETNET_URL) ? href : href ? `${FULLSETNET_URL}${href.startsWith("/") ? "" : "/"}${href}` : null,
      price_cents: Number.isFinite(price) && price > 0 ? Math.round(price * 100) : null,
    })
  }
  if (!items.length) throw new CatalogSourceError(msg("sets.noRows"))
  return items.sort((a, b) => a.position - b.position)
}

async function fetchPage(slug: string, fetchImpl: typeof fetch, baseUrl: string) {
  let res: Response
  try {
    res = await fetchImpl(`${baseUrl}/collection/${slug}.html`, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(20_000) })
  } catch (err) {
    throw new CatalogSourceError(msg("sets.unreachable", { error: (err as Error).message }))
  }
  if (!res.ok) throw new CatalogSourceError(msg("sets.http", { status: res.status }))
  const html = await res.text()
  if (html.length > MAX_BYTES) throw new CatalogSourceError(msg("sets.tooBig"))
  return parseSourcePage(html)
}

/** Va chercher une liste chez full-set.net. Le HTML n'est jamais rendu : seules les lignes sont lues. */
export async function fetchSourceList(list: SourceList, fetchImpl: typeof fetch = fetch, baseUrl = FULLSETNET_URL): Promise<SourceItem[]> {
  const items = await fetchPage(list.slug, fetchImpl, baseUrl)
  if (!list.imagesFrom) return items
  // Liste régionale : ses jeux sont un sous-ensemble de la liste complète, qui porte les images
  // sous sa propre numérotation. Les deux listes renvoient vers la même fiche : c'est la clé.
  const parent = await fetchPage(list.imagesFrom, fetchImpl, baseUrl)
  const byUrl = new Map(parent.flatMap((i) => (i.url ? [[i.url, i.position] as const] : [])))
  return items.map((item) => ({ ...item, cover_pos: (item.url ? byUrl.get(item.url) : null) ?? null }))
}
