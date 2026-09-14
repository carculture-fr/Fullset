import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, RouterProvider, createBrowserRouter } from "react-router-dom"

import { Layout } from "@/components/layout"
import { Login } from "@/components/login"
import { Setup } from "@/components/setup"
import { api, UNAUTHORIZED_EVENT, type Me } from "@/lib/api"
import { LibraryProvider } from "@/lib/library-data"
import { PreferencesProvider } from "@/lib/preferences"
import { SessionContext } from "@/lib/session"
import Add from "@/pages/Add"
import Barcodes from "@/pages/Barcodes"
import Brocante from "@/pages/Brocante"
import CopyEditor from "@/pages/CopyEditor"
import EditGame from "@/pages/EditGame"
import Game from "@/pages/Game"
import Hardware from "@/pages/Hardware"
import HardwareDetail from "@/pages/HardwareDetail"
import HardwareEditor from "@/pages/HardwareEditor"
import ImportLegacy from "@/pages/ImportLegacy"
import Library from "@/pages/Library"
import Settings from "@/pages/Settings"
import Stats from "@/pages/Stats"
import Steam from "@/pages/Steam"
import { ListsProvider } from "@/lib/lists"
import Wishlist from "@/pages/Wishlist"

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Library /> },
      { path: "ajouter", element: <Add /> },
      { path: "brocante", element: <Brocante /> },
      { path: "codes-barres", element: <Barcodes /> },
      { path: "steam", element: <Steam /> },
      { path: "jeux/:id", element: <Game /> },
      { path: "jeux/:id/modifier", element: <EditGame /> },
      { path: "jeux/:id/ajouter", element: <CopyEditor /> },
      { path: "jeux/:id/exemplaires/:copyId", element: <CopyEditor /> },
      { path: "stats", element: <Stats /> },
      { path: "souhaits", element: <Wishlist /> },
      { path: "reglages", element: <Settings /> },
      { path: "consoles", element: <Hardware /> },
      { path: "consoles/ajouter", element: <HardwareEditor /> },
      { path: "consoles/:id", element: <HardwareDetail /> },
      { path: "consoles/:id/modifier", element: <HardwareEditor /> },
      { path: "importer/ancienne-appli", element: <ImportLegacy /> },
      { path: "*", element: <NotFound /> },
    ],
  },
])

export default function App() {
  const { t, i18n } = useTranslation()
  const [me, setMe] = useState<Me | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const refresh = useCallback(
    () =>
      api<Me>("/api/auth/me").then(
        (m) => {
          setMe(m)
          setUnreachable(false)
        },
        () => setUnreachable(true),
      ),
    [],
  )

  useEffect(() => {
    refresh()
    const expired = () => setMe((m) => (m ? { ...m, authenticated: false } : m))
    window.addEventListener(UNAUTHORIZED_EVENT, expired)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, expired)
  }, [refresh])

  const session = useMemo(
    () => ({
      authRequired: true,
      logout: async () => {
        await api("/api/auth/logout", { method: "POST" })
        // Les données gardées pour le hors-ligne partent avec la session (la coque de l'appli reste).
        if ("caches" in window) await Promise.all(["gc-api", "gc-images"].map((c) => caches.delete(c)))
        await refresh()
      },
    }),
    [refresh],
  )

  if (!me && unreachable) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-muted-foreground">{t("app.unreachable")}</p>
        <button onClick={refresh} className="rounded-lg border border-border px-4 py-2 text-sm">
          {t("common.retry")}
        </button>
      </main>
    )
  }
  if (!me) return null
  if (me.setupRequired) return <Setup onDone={refresh} />
  if (!me.authenticated) return <Login onDone={refresh} />
  return (
    <SessionContext.Provider value={session}>
      <LibraryProvider>
        <ListsProvider>
          <PreferencesProvider>
            {/* Changement de langue : les pages repartent, formats (montants, dates) compris. */}
            <RouterProvider key={i18n.language} router={router} />
          </PreferencesProvider>
        </ListsProvider>
      </LibraryProvider>
    </SessionContext.Provider>
  )
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="py-16 text-center">
      <p className="text-muted-foreground">{t("app.notFound")}</p>
      <Link to="/" className="mt-3 inline-block text-sm text-primary underline">
        {t("app.backToLibrary")}
      </Link>
    </div>
  )
}
