import { createContext, useContext } from "react"

export type Session = { authRequired: boolean; logout: () => Promise<void> }

export const SessionContext = createContext<Session>({ authRequired: false, logout: async () => {} })

export const useSession = () => useContext(SessionContext)
