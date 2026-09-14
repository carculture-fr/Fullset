import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import en from "@/locales/en.json"
import fr from "@/locales/fr.json"

// Langues de l'interface. Le français est la référence : en.json reprend exactement ses clés.
export const LANGUAGES = ["fr", "en"] as const
export type Language = (typeof LANGUAGES)[number]
export type LanguagePreference = "auto" | Language

// Choix fait avant la connexion (écran de connexion, assistant) ; une fois connecté, la préférence du compte fait foi.
const KEY = "fullset-language"

const isLanguage = (v: unknown): v is Language => LANGUAGES.includes(v as Language)

/** Langue du navigateur : français s'il est en tête, anglais sinon. */
export function browserLanguage(): Language {
  const tag = (typeof navigator !== "undefined" && (navigator.languages?.[0] ?? navigator.language)) || ""
  return tag.toLowerCase().startsWith("fr") ? "fr" : "en"
}

export function storedLanguage(): Language | null {
  try {
    const v = localStorage.getItem(KEY)
    return isLanguage(v) ? v : null
  } catch {
    return null
  }
}

function store(lang: Language) {
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // navigation privée : le choix vaut pour la visite
  }
}

export const resolveLanguage = (pref: LanguagePreference | undefined): Language => (isLanguage(pref) ? pref : browserLanguage())

/** Affiche l'interface dans cette langue ; <html lang> suit. */
export function applyLanguage(lang: Language) {
  if (i18n.language !== lang) void i18n.changeLanguage(lang)
  if (typeof document !== "undefined") document.documentElement.lang = lang
}

/** Sélecteur d'avant connexion : le choix est retenu sur cet appareil. */
export function chooseLanguage(lang: Language) {
  store(lang)
  applyLanguage(lang)
}

/** Préférence du compte : « auto » suit le navigateur ; un choix explicite sert aussi à l'écran de connexion. */
export function applyAccountLanguage(pref: LanguagePreference | undefined) {
  if (isLanguage(pref)) store(pref)
  applyLanguage(resolveLanguage(pref))
}

export const currentLanguage = (): Language => (isLanguage(i18n.language) ? i18n.language : "fr")

/** Locale des formats : dates JJ/MM/AAAA dans les deux langues, montants en euros. */
export const locale = () => (currentLanguage() === "en" ? "en-GB" : "fr-FR")

void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en } },
  lng: storedLanguage() ?? browserLanguage(),
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
})
if (typeof document !== "undefined") document.documentElement.lang = currentLanguage()

export type ValueGroup = keyof typeof fr.values

const table = (group: ValueGroup): Record<string, string> | undefined =>
  (i18n.getResource(currentLanguage(), "translation", `values.${group}`) ?? i18n.getResource("fr", "translation", `values.${group}`)) as
    | Record<string, string>
    | undefined

/**
 * Libellé affiché d'une valeur enregistrée en base (« Neuf », « Pas commencé »…). Les valeurs
 * stockées restent les libellés français : ce sont des clés. Valeur inconnue : affichée telle quelle.
 */
export function valueLabel(group: ValueGroup, value: string): string
export function valueLabel(group: ValueGroup, value: string | null | undefined): string | null
export function valueLabel(group: ValueGroup, value: string | null | undefined) {
  if (value === null || value === undefined) return null
  return table(group)?.[value] ?? value
}

/** Même chose sans savoir de quelle liste vient la valeur (statistiques, filtres). */
export function anyValueLabel(value: string): string {
  for (const group of Object.keys(fr.values) as ValueGroup[]) {
    const hit = table(group)?.[value]
    if (hit !== undefined) return hit
  }
  return value
}

/** Liste « a, b, c » (genres, modes, vues IGDB) : chaque élément traduit s'il est connu. */
export const listLabel = (group: ValueGroup, list: string | null) =>
  list === null ? null : list.split(/\s*,\s*/).map((v) => valueLabel(group, v)).join(", ")

export default i18n
