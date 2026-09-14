import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

import { api } from "./api"
import type { LibraryGame } from "./library"

type LibraryState = { games: LibraryGame[] | null; error: string | null; reload: () => Promise<void> }

const LibraryContext = createContext<LibraryState | null>(null)

/**
 * La bibliothèque est chargée une fois et gardée en mémoire : au retour d'une fiche,
 * la grille s'affiche aussitôt, ce qui permet au routeur de restaurer le défilement.
 */
export function LibraryProvider({ children }: { children: ReactNode }) {
  const [games, setGames] = useState<LibraryGame[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const res = await api<{ games: LibraryGame[] }>("/api/library")
      setGames(res.games)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue")
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return <LibraryContext.Provider value={{ games, error, reload }}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const value = useContext(LibraryContext)
  if (!value) throw new Error("useLibrary hors de LibraryProvider")
  return value
}
