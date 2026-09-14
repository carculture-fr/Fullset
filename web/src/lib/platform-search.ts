// Recherche dans une longue liste de consoles : sans accents ni casse, espaces et tirets
// facultatifs (« megadrive » trouve « Sega Mega Drive/Genesis »), et les abréviations d'usage.

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
const squash = (s: string) => norm(s).replace(/ /g, "")

// Abréviation tapée → début du nom du catalogue (RomM / IGDB).
const ABBREVIATIONS: Record<string, string[]> = {
  ps1: ["PlayStation"],
  psx: ["PlayStation"],
  psone: ["PlayStation"],
  ps2: ["PlayStation 2"],
  ps3: ["PlayStation 3"],
  ps4: ["PlayStation 4"],
  ps5: ["PlayStation 5"],
  psp: ["PlayStation Portable"],
  vita: ["PlayStation Vita"],
  nes: ["Nintendo Entertainment System"],
  snes: ["Super Nintendo Entertainment System"],
  n64: ["Nintendo 64"],
  gc: ["Nintendo GameCube"],
  ngc: ["Nintendo GameCube"],
  gb: ["Game Boy"],
  gbc: ["Game Boy Color"],
  gba: ["Game Boy Advance"],
  nds: ["Nintendo DS"],
  ds: ["Nintendo DS"],
  "3ds": ["Nintendo 3DS"],
  md: ["Sega Mega Drive/Genesis"],
  sms: ["Sega Master System/Mark III"],
  pce: ["TurboGrafx-16/PC Engine"],
  x360: ["Xbox 360"],
}

/**
 * Les consoles qui correspondent à la saisie, dans l'ordre de `options` (tes consoles et les
 * grands constructeurs d'abord) ; un nom qui commence par la saisie passe devant.
 */
export function searchPlatforms(options: string[], query: string, limit = Infinity): string[] {
  const q = norm(query)
  if (!q) return options.slice(0, limit)
  const sq = squash(query)
  const wanted = (ABBREVIATIONS[sq] ?? []).map((a) => a.toLowerCase())
  const scored = options.flatMap((o, i) => {
    const n = norm(o)
    const words = q.split(" ")
    const hit = wanted.includes(o.toLowerCase()) || words.every((w) => n.includes(w)) || squash(o).includes(sq)
    if (!hit) return []
    const rank = wanted.includes(o.toLowerCase()) ? 0 : n.startsWith(q) || n.split(" ").some((w) => w.startsWith(q)) ? 1 : 2
    return [{ o, i, rank }]
  })
  return scored
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((s) => s.o)
    .slice(0, limit)
}

/** Recherche des menus : sans accents ni casse, mots dans n'importe quel ordre ; ce qui commence par la saisie d'abord. */
export function filterOptions(options: string[], query: string): string[] {
  const q = norm(query)
  if (!q) return options
  const words = q.split(" ")
  const hits = options.flatMap((o, i) => {
    const n = norm(o)
    if (!words.every((w) => n.includes(w)) && !squash(o).includes(squash(query))) return []
    return [{ o, i, first: n.startsWith(q) || n.split(" ").some((w) => w.startsWith(q)) ? 0 : 1 }]
  })
  return hits.sort((a, b) => a.first - b.first || a.i - b.i).map((h) => h.o)
}
