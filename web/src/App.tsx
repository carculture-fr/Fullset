import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, RouterProvider, createBrowserRouter } from "react-router-dom"

import { Layout, Logo } from "@/components/layout"
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
      <main className="flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="flex w-full max-w-[440px] flex-col items-center gap-5 rounded-[28px] bg-card p-5 text-center shadow-sm sm:p-8">
          <Logo size={48} />
          <p className="text-[15px] text-muted-foreground">{t("app.unreachable")}</p>
          <button onClick={refresh} className="inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-heading text-[16px] text-primary-foreground transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[.98]">
            {t("common.retry")}
          </button>
        </div>
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
    <div className="flex flex-col items-center py-16 text-center">
      <div aria-hidden="true" className="aspect-[3/4] w-[96px] rounded-[12px] border-[1.5px] border-dashed border-border-strong bg-card" />
      <h1 className="mt-6 text-[22px]">{t("app.notFound")}</h1>
      <Link
        to="/"
        className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-6 font-heading text-[16px] text-primary-foreground transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[.98]"
      >
        {t("app.backToLibrary")}
      </Link>
    </div>
  )
}
