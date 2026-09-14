import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

import { api, send } from "./api"

export type ListKey = "place" | "edition" | "tag" | "hw_edition" | "hw_color"
export type ListValue = { id: number; value: string; count: number }
export type Lists = Record<ListKey, ListValue[]>

type ListsState = { lists: Lists | null; reload: () => Promise<void>; add: (list: ListKey, value: string) => Promise<string> }

const ListsContext = createContext<ListsState | null>(null)

/** Listes gérables (lieux d'achat, éditions, tags), partagées par la saisie et les réglages. */
export function ListsProvider({ children }: { children: ReactNode }) {
  const [lists, setLists] = useState<Lists | null>(null)
  const reload = useCallback(async () => setLists(await api<Lists>("/api/lists")), [])
  useEffect(() => {
    reload().catch(() => {})
  }, [reload])

  /** Ajoute une valeur à la liste globale et renvoie son libellé définitif (casse existante conservée). */
  const add = useCallback(
    async (list: ListKey, value: string) => {
      const res = await send<{ value: string }>("POST", `/api/lists/${list}`, { value })
      await reload()
      return res.value
    },
    [reload],
  )

  return <ListsContext.Provider value={{ lists, reload, add }}>{children}</ListsContext.Provider>
}

export function useLists() {
  const value = useContext(ListsContext)
  if (!value) throw new Error("useLists hors de ListsProvider")
  return value
}
