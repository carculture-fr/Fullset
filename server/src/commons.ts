// Images par défaut du matériel, prises sur Wikimedia Commons : on y trouve la plupart des
// consoles photographiées sur fond blanc (souvent par Evan-Amos, dans le domaine public).
// Le serveur seul parle à Commons ; le navigateur n'affiche que les vignettes proposées.

import { msg } from "./i18n.js"

/** `invalid` : la demande elle-même est fautive (400), pas Commons (502). */
export class CommonsError extends Error {
  constructor(
    message: string,
    readonly invalid = false,
  ) {
    super(message)
  }
}

export type CommonsImage = {
  title: string
  thumb: string
  /** Version réduite à télécharger (1200 px de large au plus). */
  url: string
  page: string
  license: string | null
  artist: string | null
}

const API = "https://commons.wikimedia.org/w/api.php"
// Politique de Wikimedia : un User-Agent qui dit qui appelle et comment le joindre.
export const COMMONS_UA = "Fullset (inventaire de jeux video auto-heberge; https://github.com/carculture-fr/Fullset)"
// Commons sert les originaux sur upload.wikimedia.org et, depuis 2026, les vignettes sur
// thumb.wikimedia.org (tailles normalisées : 330, 1280…), avec des paramètres utm_ en plus.
const COMMONS_HOSTS = ["upload.wikimedia.org", "thumb.wikimedia.org"]
export const isCommonsMedia = (url: string) => {
  try {
    const u = new URL(url)
    return u.protocol === "https:" && COMMONS_HOSTS.includes(u.hostname)
  } catch {
    return false
  }
}
const withoutTracking = (url: string) => url.replace(/\?.*$/, "")

// Les couleurs et éditions sont saisies en français ; Commons décrit en anglais.
const COLORS: Record<string, string> = {
  Noir: "black",
  Blanc: "white",
  Gris: "grey",
  Argent: "silver",
  Platine: "silver",
  Rouge: "red",
  Bleu: "blue",
  Violet: "indigo",
  Orange: "orange",
  Rose: "pink",
  Vert: "green",
  Jaune: "yellow",
  Or: "gold",
  Transparent: "clear",
}
const EDITIONS: Record<string, string> = { Slim: "slim", "Super Slim": "super slim", Lite: "lite", Mini: "mini", Pro: "pro", OLED: "OLED", XL: "XL", Elite: "elite" }
const KINDS: Record<string, string> = { Console: "console", Manette: "controller", Accessoire: "" }

type Item = { kind: string | number | null; platform: string | number | null; edition: string | number | null; color: string | number | null; model?: string | number | null }

// Constructeurs : les noms du catalogue (RomM) les portent (« Nintendo GameCube »), les noms
// de fichiers souvent pas (« GameCube-Set.jpg »). Ils ne sont pas exigés pour reconnaître la console.
const MAKERS = new Set(["nintendo", "sega", "sony", "microsoft", "atari", "snk", "nec", "bandai", "philips", "mattel", "coleco", "panasonic", "casio", "epoch", "apple", "amstrad", "magnavox", "fairchild", "bally", "samsung", "meta", "google"])

const norm = (x: string) =>
  x
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
const squash = (x: string) => norm(x).replace(/ /g, "")

// Graphies courantes ramenées au nom qu'emploient les fichiers de Commons (« Megadrive » n'y
// trouve rien, « Mega Drive » trouve la console européenne).
const PLATFORM_ALIASES: Record<string, string> = {
  megadrive: "Mega Drive",
  mastersystem: "Master System",
  megacd: "Mega-CD",
  snes: "Super Nintendo",
  supernes: "Super Nintendo",
  supernintendoentertainmentsystem: "Super Nintendo",
  nintendoentertainmentsystem: "NES",
  n64: "Nintendo 64",
  nintendo64: "Nintendo 64",
  gc: "GameCube",
  ngc: "GameCube",
  ps1: "PlayStation",
  psx: "PlayStation",
  psone: "PlayStation",
  ps2: "PlayStation 2",
  ps3: "PlayStation 3",
  ps4: "PlayStation 4",
  ps5: "PlayStation 5",
  nds: "Nintendo DS",
  gba: "Game Boy Advance",
  gameboy: "Game Boy",
}
// « Sega Mega Drive/Genesis », « TurboGrafx-16/PC Engine » : le premier nom suffit pour chercher.
export const commonsPlatform = (platform: string) => {
  const first = platform.split("/")[0].trim()
  return PLATFORM_ALIASES[squash(platform)] ?? PLATFORM_ALIASES[squash(first)] ?? first
}

// Abréviations qu'emploient les noms de fichiers (« PSX-Console-wController », « Sony-PlayStation-PS3-Slim »).
const FILE_NAMES: Record<string, string[]> = {
  playstation: ["psx", "ps1", "psone"],
  playstation2: ["ps2"],
  playstation3: ["ps3"],
  playstation4: ["ps4"],
  playstation5: ["ps5"],
  nintendo64: ["n64"],
  supernintendo: ["snes", "supernes", "superfamicom"],
  playstationportable: ["psp"],
}

/** Du plus précis au plus large : une GameCube Platine sans photo « platinum » garde celle de la GameCube. */
export function commonsQueries(item: Item): string[] {
  const words = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(" ").trim()
  const platform = commonsPlatform(String(item.platform ?? ""))
  const kind = KINDS[String(item.kind)] ?? ""
  const variant = variantWords(item, platform)
  const color = COLORS[String(item.color)]
  return [...new Set([words(platform, variant, color, kind), words(platform, variant, kind), words(platform, kind), platform])].filter(Boolean)
}

/**
 * Le modèle choisi dans le catalogue (« Xbox 360 S », « Slimline ») ou, à défaut, l'édition
 * (Slim, Lite…), sans les mots déjà dans le nom de la console. « Modèle d'origine » n'ajoute rien.
 */
function variantWords(item: Item, platform: string) {
  const model = String(item.model ?? "")
  const raw = model && model !== "Modèle d'origine" ? model : (EDITIONS[String(item.edition)] ?? "")
  const known = new Set(norm(`${platform} ${String(item.platform ?? "")}`).split(" "))
  return norm(raw)
    .split(" ")
    .filter((w) => w && !known.has(w))
    .join(" ")
}

const plain = (html: string | undefined) => (html ? html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || null : null)

type ApiPage = {
  title: string
  index?: number
  imageinfo?: Array<{ thumburl?: string; url: string; descriptionurl: string; mime: string; width: number; extmetadata?: Record<string, { value: string }> }>
}

async function query(params: Record<string, string>, fetchImpl: typeof fetch): Promise<CommonsImage[]> {
  const search = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
    iiurlwidth: "1200",
    iiextmetadatafilter: "LicenseShortName|Artist",
    ...params,
  })
  let res: Response
  try {
    res = await fetchImpl(`${API}?${search}`, { headers: { "User-Agent": COMMONS_UA }, signal: AbortSignal.timeout(10_000) })
  } catch (err) {
    throw new CommonsError(msg("commons.unreachable", { error: (err as Error).message }))
  }
  if (!res.ok) throw new CommonsError(msg("commons.http", { status: res.status }))
  const body = (await res.json()) as { query?: { pages?: Record<string, ApiPage> } }
  return Object.values(body.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((p) => {
      const ii = p.imageinfo?.[0]
      // Des photos, pas des logos vectoriels ni des documents, et assez grandes pour une fiche.
      if (!ii || !["image/jpeg", "image/png"].includes(ii.mime) || ii.width < 600) return []
      const url = withoutTracking(ii.thumburl ?? ii.url)
      if (!isCommonsMedia(url)) return []
      return [
        {
          title: p.title,
          // Vignette de la grille de choix : une taille normalisée de Commons.
          thumb: url.includes("/thumb/") ? url.replace(/\/\d+px-([^/]+)$/, "/330px-$1") : url,
          url,
          page: ii.descriptionurl,
          license: plain(ii.extmetadata?.LicenseShortName?.value),
          artist: plain(ii.extmetadata?.Artist?.value),
        },
      ]
    })
}

export async function searchCommons(q: string, fetchImpl: typeof fetch = fetch, limit = 12) {
  return query({ generator: "search", gsrnamespace: "6", gsrlimit: String(limit), gsrsearch: `${q} filetype:bitmap` }, fetchImpl)
}

/**
 * Les propositions pour un élément. La recherche la plus précise (avec la couleur) ramène
 * souvent peu de chose, ou rien d'utile : on enchaîne les recherches de plus en plus larges
 * et on garde tout, les images qui désignent vraiment la console en tête.
 */
export async function imageOptions(item: Item, fetchImpl: typeof fetch = fetch, q?: string) {
  const queries = q ? [q] : commonsQueries(item)
  // En parallèle : quatre recherches au plus, le temps d'une seule.
  const results = await Promise.all(queries.map((query) => searchCommons(query, fetchImpl)))
  const seen = new Map<string, CommonsImage>()
  let chosen: string | null = null
  results.forEach((options, i) => {
    for (const o of options) if (!seen.has(o.title)) seen.set(o.title, o)
    if (!chosen && pickAutomatic(item, options)) chosen = queries[i]
  })
  const all = [...seen.values()]
  const ranked = all.map((o, i) => ({ o, i, s: score(item, o) })).sort((a, b) => Number(b.s !== null) - Number(a.s !== null) || (b.s ?? 0) - (a.s ?? 0) || a.i - b.i)
  return { query: chosen ?? queries.find(Boolean) ?? "", options: ranked.map((r) => r.o).slice(0, 18) }
}

/** Relit un fichier chez Commons : l'adresse, l'auteur et la licence viennent de Commons, jamais du client. */
export async function commonsFile(title: string, fetchImpl: typeof fetch = fetch) {
  if (!/^File:[^|#<>[\]{}]+$/.test(title)) throw new CommonsError(msg("commons.invalidName"), true)
  const [image] = await query({ titles: title }, fetchImpl)
  if (!image) throw new CommonsError(msg("commons.notFound"))
  return image
}

// Mots qui, dans un nom de fichier, désignent un autre modèle que celui cherché : une Xbox
// n'est pas une Xbox 360, une Wii pas une Wii U, une PlayStation pas une PS Vita, une DS pas
// une DS Lite (sauf si c'est l'édition saisie).
const OTHER_MODELS = new Set(["vita", "portable", "psp", "one", "series", "advance", "color", "colour", "pocket", "micro", "u", "dsi", "3ds", "2ds", "mini", "classic", "nomad", "cd", "32x", "lite", "slim", "superslim", "xl", "pro", "elite", "oled", "genesis", "go", "street", "debug", "devkit", "development", "prototype", "kiosk", "demo"])
// Pas une vue de la console : carte mère, manette seule, logo, boîte, jeu.
const NOT_CONSOLE = new Set(["motherboard", "board", "controller", "cont", "6button", "button", "remote", "nunchuk", "wiimote", "gamepad", "joycon", "camera", "eye", "move", "vr", "headset", "kinect", "tv", "adapter", "wifi", "wireless", "hdd", "harddrive", "memory", "card", "cable", "charger", "keyboard", "mouse", "battery", "microphone", "logo", "box", "boxed", "cartridge", "disc", "inside", "internals", "teardown", "screenshot"])

/** Note d'une proposition, ou null si elle ne désigne pas la console cherchée. */
function score(item: Item, o: CommonsImage): number | null {
  const platform = commonsPlatform(String(item.platform ?? ""))
  const tokens = norm(o.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "")).split(" ")
  const name = ` ${tokens.join(" ")} `
  const allWords = norm(platform).split(" ").filter(Boolean)
  const words = allWords.some((w) => !MAKERS.has(w)) ? allWords.filter((w) => !MAKERS.has(w)) : allWords
  const aliases = FILE_NAMES[squash(platform)] ?? []
  const found = words.every((w) => name.includes(` ${w} `)) || tokens.join("").includes(words.join("")) || tokens.some((t) => aliases.includes(t))
  if (!found) return null
  const edition = variantWords(item, platform)
  const allowed = new Set([...allWords, ...aliases, ...edition.split(" "), squash(edition)])
  const slimVariant = /\b(slim|slimline|superslim|lite)\b/.test(edition)
  // Le « S » de « Xbox 360 S » ou « 360S » désigne la version fine.
  if (slimVariant) allowed.add("s")
  // IGDB dit « Slimline » (PS2), les fichiers disent « Slim ».
  if (edition.includes("slimline")) allowed.add("slim")
  const manette = String(item.kind) === "Manette"
  for (const t of tokens) {
    if (allowed.has(t)) continue
    // « 360 », mais aussi « 360s » ou « 2ds » collés : un numéro de modèle absent de la plateforme,
    // ou une variante (« 360s ») qui n'est pas celle choisie (« Xbox 360 Original »).
    const modelNumber = /^(\d{1,3})([a-z]{0,2})$/.exec(t)
    if (modelNumber && (!allowed.has(modelNumber[1]) || (modelNumber[2] && !allowed.has(modelNumber[2])))) return null
    if (OTHER_MODELS.has(t)) return null
    // Une variante fine (Slim, Lite) n'est pas le premier modèle, dit « Fat » sur Commons.
    if (t === "fat" && slimVariant) return null
    if (!manette && NOT_CONSOLE.has(t)) return null
  }
  let s = 0
  // L'édition saisie (Slim, Lite…) prime : une PS3 Slim ne prend pas la photo de la PS3 d'origine.
  if (edition && (tokens.join(" ").includes(edition) || (edition.includes("slimline") && tokens.includes("slim")))) s += 3
  if (tokens.includes("set")) s += 3
  if (tokens.some((t) => ["fl", "fr", "front"].includes(t))) s += 2
  if (tokens.includes("console")) s += 1
  if (manette && tokens.some((t) => t.includes("controller") || t === "cont")) s += 3
  if (tokens.some((t) => ["eu", "pal", "europe"].includes(t))) s += 1
  const color = COLORS[String(item.color)]
  if (color && tokens.includes(color)) s += 1
  if (tokens.some((t) => ["back", "rear", "bl", "br"].includes(t))) s -= 2
  // Les photos d'Evan-Amos sont des vues studio sur fond blanc, homogènes d'une console à l'autre.
  if (o.artist?.includes("Evan-Amos")) s += 1
  return s
}

/**
 * Choix automatique pour un élément sans image : la proposition la mieux notée parmi celles
 * dont le nom de fichier désigne la console (« Sony-PlayStation-2-30001-Console-FL » pour
 * « PlayStation 2 »). Sans correspondance nette, rien : mieux vaut l'icône qu'une image fausse.
 */
export function pickAutomatic(item: Item, options: CommonsImage[]) {
  let best: { o: CommonsImage; s: number } | undefined
  for (const o of options) {
    const s = score(item, o)
    if (s !== null && (!best || s > best.s)) best = { o, s }
  }
  return best?.o
}
