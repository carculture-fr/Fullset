/**
 * Listes de jeux tirées d'un fichier texte : les `.nfo` qui accompagnent les packs de ROMs, ou
 * n'importe quelle liste faite main (un titre par ligne). Ces fichiers mêlent un en-tête décoré,
 * des informations de pack et la liste elle-même : on ne garde que ce qui ressemble à un titre.
 */

const MAX_TITLES = 20_000

// Décoration et informations de pack : rien à en tirer.
const DECORATION = /^[\s*#=~_+.\-–—|]*$/
const INFO_LINE = /^[\s|>-]*[A-Za-zÀ-ÿ' ]{3,40}\s*[.…]{2,}\s*:/
const INFO_WORDS =
  /^(uploader|taille|poids|size|format|nombre de|number of|platform|plateforme|torrent|source|release|date|langue|language|region|genre|il s'agit|voici|sont inclus|les roms|ce fullset|liste|contenu|md5|sha1|crc|password|mot de passe)\b/i

const REGION_TAG = /\s*[([](?:europe|eur|usa|japan|jap|jpn|world|france|germany|australia|korea|rev \d|v\d|[a-z]{2}(?:\s*,\s*[a-z]{2})+)[^)\]]*[)\]]\s*$/i

/** Enlève ce qui entoure un titre dans une liste de fichiers : arborescence, extension, tags. */
function cleanTitle(raw: string) {
  let s = raw.replace(/\r/g, "").trim()
  // Arborescence « |    |----Nom du jeu.wbfs », puces, et cadre décoratif « * INFORMATION * ».
  s = s.replace(/^[|\s]*[-]{2,}/, "").replace(/^[|>*#•\s]+/, "").replace(/[*#\s]+$/, "").trim()
  // Taille en fin de ligne : « Jeu.nds ... 16 MB ».
  s = s.replace(/\s*[.…]{2,}\s*[\d.,]+\s*[KMGT]i?[Bo]\s*$/i, "")
  // Identifiant de sérigraphie en tête : « PCSB00040 - Titre », « SLES-12345 : Titre ».
  s = s.replace(/^[A-Z]{3,5}[- ]?\d{4,6}\s*[-:–]\s*/, "")
  // Numéro de liste : « 0123. Titre ». Jamais la forme « 007 - … », qui est un vrai titre.
  s = s.replace(/^\d{1,4}\s*[.)]\s+/, "")
  // Extension de fichier et code de la ROM.
  s = s.replace(/_?\[[A-Z0-9]{4,8}\]/g, "").replace(/\.(zip|7z|rar|iso|chd|cso|rvz|wbfs|wua|nds|gba|gbc|gb|smc|sfc|n64|z64|bin|cue|gdi|cdi|pkg|nsp|xci|md|gen|sms|gg|pce|vpk|img|ecm)$/i, "")
  // Régions et langues en fin de titre, parfois plusieurs : « (Europe) (En,Fr,De) ».
  for (let before = ""; before !== s; ) {
    before = s
    s = s.replace(REGION_TAG, "")
  }
  return s.replace(/\s{2,}/g, " ").trim()
}

const looksLikeTitle = (s: string) => {
  if (s.length < 2 || s.length > 120) return false
  if (DECORATION.test(s) || INFO_LINE.test(s) || INFO_WORDS.test(s)) return false
  // Une vraie ligne de titre contient au moins une lettre ou un chiffre, et pas de phrase entière.
  if (!/[\p{L}\p{N}]/u.test(s)) return false
  // Titre de section d'un en-tête : deux ou trois mots, tout en capitales, sans chiffre
  // (« INFORMATION », « FILE LISTING »). Un vrai titre en capitales porte presque toujours un chiffre.
  if (/^[\p{Lu}\s'&.-]+$/u.test(s) && s.split(/\s+/).length <= 3) return false
  return s.split(/\s+/).length <= 18
}

export type RomsetList = { titles: string[]; skipped: number }

/** Lit un fichier de liste et rend les titres, sans doublon, dans l'ordre du fichier. */
export function parseRomsetList(text: string): RomsetList {
  const seen = new Set<string>()
  const titles: string[] = []
  let skipped = 0
  for (const line of text.split(/\n/)) {
    const raw = line.replace(/\r/g, "")
    if (!raw.trim()) continue
    const title = cleanTitle(raw)
    if (!looksLikeTitle(title)) {
      skipped += 1
      continue
    }
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    titles.push(title)
    if (titles.length >= MAX_TITLES) break
  }
  return { titles, skipped }
}

/** Identifiant de liste importée, tiré du nom donné : lettres, chiffres et tirets. */
export const fileSlug = (name: string) =>
  `fichier-${name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)}`
