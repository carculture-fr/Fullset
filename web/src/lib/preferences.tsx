import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

import { DEFAULT_PREFERENCES, PREFERENCE_CHOICES, type Preferences } from "@domain"

import { api, send } from "./api"
import { applyAccountLanguage } from "./i18n"

export type { Preferences }
export type HardwareSort = Preferences["hardware_sort"]

// Libellés dans les fichiers de langue : `sorts.hardware.<key>`, `views.<key>`, `groups.<key>`, `languages.<key>`.
export const HARDWARE_SORTS = PREFERENCE_CHOICES.hardware_sort.map((key) => ({ key }))
export const VIEWS = PREFERENCE_CHOICES.games_view.map((key) => ({ key }))
export const GROUPS = PREFERENCE_CHOICES.games_groups.map((key) => ({ key }))
export const LANGUAGE_CHOICES = PREFERENCE_CHOICES.language.map((key) => ({ key }))

// Copie locale : la bibliothèque s'ouvre tout de suite dans le bon affichage, même hors ligne.
const CACHE_KEY = "fullset-preferences"
const cached = (): Preferences => {
  try {
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") }
  } catch {
    return DEFAULT_PREFERENCES
  }
}
const keep = (p: Preferences) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(p))
  } catch {
    // navigation privée : relu au prochain chargement
  }
}

type State = { prefs: Preferences; save: (patch: Partial<Preferences>) => Promise<void> }

const PreferencesContext = createContext<State | null>(null)

/** Affichage par défaut choisi dans les réglages, le même sur tous ses appareils. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(cached)

  useEffect(() => {
    api<Preferences>("/api/preferences").then(
      (p) => {
        setPrefs(p)
        keep(p)
      },
      () => {},
    )
  }, [])

  // Une fois connecté, la langue du compte fait foi.
  useEffect(() => applyAccountLanguage(prefs.language), [prefs.language])

  const save = useCallback(async (patch: Partial<Preferences>) => {
    const p = await send<Preferences>("PUT", "/api/preferences", patch)
    setPrefs(p)
    keep(p)
  }, [])

  return <PreferencesContext.Provider value={{ prefs, save }}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const value = useContext(PreferencesContext)
  if (!value) throw new Error("usePreferences hors de PreferencesProvider")
  return value
}
