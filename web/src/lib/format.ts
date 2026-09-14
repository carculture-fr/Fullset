export const euros = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })

/** « 2026-03-15 » → « 15/03/2026 ». */
export function frDate(iso: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = iso.split("-")
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/** Date du jour du téléphone, au format ISO (valeur par défaut des champs date). */
export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** En français, 0 et 1 sont au singulier. */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`
