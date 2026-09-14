import { ValidationError } from "./copies.js"
import type { Db } from "./db.js"
import { DEFAULT_PREFERENCES, PREFERENCE_CHOICES, type Preferences } from "./domain.js"

// Affichage par défaut gardé en base pour valoir sur tous ses appareils.
const KEY = "preferences"
const choices = PREFERENCE_CHOICES as Record<string, readonly string[]>

export function getPreferences(db: Db): Preferences {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(KEY) as { value: string } | undefined
  let stored: Record<string, unknown> = {}
  try {
    stored = row ? JSON.parse(row.value) : {}
  } catch {
    // Valeur illisible : on repart des valeurs d'origine.
  }
  const out: Record<string, string> = { ...DEFAULT_PREFERENCES }
  for (const key of Object.keys(choices)) {
    const v = stored[key]
    if (typeof v === "string" && choices[key].includes(v)) out[key] = v
  }
  return out as Preferences
}

/** Enregistre les choix envoyés ; ceux qu'on n'envoie pas restent tels quels. */
export function setPreferences(db: Db, input: unknown): Preferences {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ValidationError("Préférences attendues.")
  const next: Record<string, string> = { ...getPreferences(db) }
  for (const [key, v] of Object.entries(input)) {
    if (!choices[key]) throw new ValidationError(`Préférence inconnue : « ${key} ».`)
    if (typeof v !== "string" || !choices[key].includes(v)) throw new ValidationError(`« ${String(v)} » n'est pas un choix possible pour ${key}.`)
    next[key] = v
  }
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(KEY, JSON.stringify(next))
  return next as Preferences
}
