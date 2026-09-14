import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

import { DEFAULT_PREFERENCES, type Preferences } from "@domain"

import { api, send } from "./api"

export type { Preferences }
export type HardwareSort = Preferences["hardware_sort"]

export const HARDWARE_SORTS: ReadonlyArray<{ key: HardwareSort; label: string }> = [
  { key: "plateforme", label: "Par console" },
  { key: "nom", label: "Nom" },
  { key: "achat", label: "Achat le plus récent" },
  { key: "prix", label: "Prix le plus élevé" },
]
export const VIEWS: ReadonlyArray<{ key: Preferences["games_view"]; label: string }> = [
  { key: "grille", label: "Grille de jaquettes" },
  { key: "liste", label: "Liste" },
]
export const GROUPS: ReadonlyArray<{ key: Preferences["games_groups"]; label: string }> = [
  { key: "replies", label: "Repliées" },
  { key: "depliees", label: "Toutes dépliées" },
]

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
