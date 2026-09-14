// Listes de valeurs proposées dans l'interface. Les libellés sont ceux de collection.json.

export const SUPPORTS = ["Physique", "Dématérialisé"] as const
export const CONTENTS = ["Complet (jeu + boîte + notice)", "Jeu + boîte", "Jeu seul", "Dématérialisé", "Non défini"] as const
export const CONDITIONS = ["Neuf", "Très bon", "Bon", "Moyen", "Mauvais", "Très mauvais", "Non défini"] as const
export const MANUAL_CONDITIONS = [...CONDITIONS, "Absente"] as const
export const PLAY_STATUSES = ["Pas commencé", "En cours", "Terminé", "Abandonné"] as const
export const REGIONS = ["PAL (Europe)", "NTSC-U", "NTSC-J"] as const
export const GOALS = ["À garder", "À vendre", "À échanger"] as const

// Matériel : consoles, manettes et accessoires, décrits comme les exemplaires de jeux.
export const HW_KINDS = ["Console", "Manette", "Accessoire"] as const
export const HW_CONTENTS = ["Complet (boîte + notice)", "Avec boîte", "Sans boîte", "Non défini"] as const
export const HW_WORKING = ["Fonctionnel", "Fonctionne avec défauts", "À réparer", "Hors service", "Non testé"] as const

// Affichage par défaut des listes, choisi dans les réglages.
export const PREFERENCE_CHOICES = {
  games_sort: ["nom", "achat", "prix", "valeur", "plateforme"],
  games_view: ["grille", "liste"],
  games_groups: ["replies", "depliees"],
  hardware_sort: ["plateforme", "nom", "achat", "prix"],
  // Langue de l'interface : « auto » suit le navigateur (français s'il est en tête, anglais sinon).
  language: ["auto", "fr", "en"],
} as const
export type Preferences = { [K in keyof typeof PREFERENCE_CHOICES]: (typeof PREFERENCE_CHOICES)[K][number] }
export const DEFAULT_PREFERENCES: Preferences = { games_sort: "nom", games_view: "grille", games_groups: "replies", hardware_sort: "plateforme", language: "auto" }

export const DIGITAL = "Dématérialisé"
export const UNDEFINED = "Non défini"

const SYNONYMS: Record<string, string> = {
  "Non précisé": UNDEFINED,
}

/** Chaîne nettoyée, ou null si vide. */
export function text(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

/** Valeur d'une liste fermée : synonymes ramenés au libellé canonique, vide → null. */
export function listValue(v: unknown): string | null {
  const s = text(v)
  return s === null ? null : (SYNONYMS[s] ?? s)
}

export const toCents = (euros: unknown): number | null => {
  if (euros === null || euros === undefined || euros === "") return null
  const n = typeof euros === "number" ? euros : Number(String(euros).replace(",", "."))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** « 25/11/2005 » → « 2005-11-25 » ; une date déjà ISO passe telle quelle. */
export function isoDate(v: unknown): string | null {
  const s = text(v)
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}
