import { locale } from "./i18n"

// Formats de la langue active ; la devise reste l'euro.
export const euros = (cents: number) => (cents / 100).toLocaleString(locale(), { style: "currency", currency: "EUR" })

/** « 2026-03-15 » → « 15/03/2026 » (fr-FR comme en-GB). */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat(locale(), { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(Date.UTC(y, m - 1, d))
}

/** Date et heure courtes d'un horodatage (« 14/09/2026 17:34 »). */
export const formatDateTime = (value: string | number | Date) => new Date(value).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" })

/** Nombre dans la langue active (séparateurs de milliers et décimales). */
export const formatNumber = (n: number, options?: Intl.NumberFormatOptions) => n.toLocaleString(locale(), options)

/** Date du jour du téléphone, au format ISO (valeur par défaut des champs date). */
export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
