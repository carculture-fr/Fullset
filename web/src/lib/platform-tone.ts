/** Couleur de tranche d'une jaquette absente, par famille de console. Les valeurs vivent dans index.css. */
export function spineTone(platform: string | null | undefined): string {
  const p = (platform ?? "").toLowerCase()
  if (/nintendo|gamecube|game boy|wii|switch|\bnes\b|snes|n64|\bds\b|3ds/.test(p)) return "var(--spine-nintendo)"
  if (/playstation|\bps[1-5]\b|psp|vita/.test(p)) return "var(--spine-playstation)"
  if (/xbox/.test(p)) return "var(--spine-xbox)"
  if (/\bpc\b|windows|steam|\bmac\b|linux/.test(p)) return "var(--spine-pc)"
  if (/sega|mega drive|genesis|saturn|dreamcast|master system|game gear/.test(p)) return "var(--spine-sega)"
  return "var(--spine-other)"
}
