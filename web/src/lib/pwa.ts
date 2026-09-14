import { registerSW } from "virtual:pwa-register"

// Version de l'interface, gravée au build (VITE_APP_VERSION, depuis APP_VERSION du Dockerfile).
export const CLIENT_VERSION: string = import.meta.env.VITE_APP_VERSION || "dev"

let registration: ServiceWorkerRegistration | undefined

const check = () => {
  if (navigator.onLine) registration?.update().catch(() => {})
}

/**
 * Le service worker garde l'application pour le hors-ligne. Une application restée ouverte
 * (onglet ou appli installée) ne revoyait jamais la nouvelle version : on la cherche au retour
 * sur l'appli et toutes les 30 minutes ; une fois installée, la page se recharge (autoUpdate).
 */
export function startPwa() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      registration = r
      document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check())
      setInterval(check, 30 * 60_000)
    },
  })
}

/**
 * Filet de sécurité : le serveur annonce une autre version que celle de l'interface affichée.
 * On force la mise à jour puis on recharge, une seule fois par version (pas de boucle si la
 * nouvelle interface tarde à s'installer).
 */
export async function reloadIfOutdated(serverVersion: string) {
  if (CLIENT_VERSION === "dev" || serverVersion === "dev" || serverVersion === CLIENT_VERSION) return
  const key = `fullset-reload-${serverVersion}`
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, "1")
  } catch {
    return
  }
  const installed = new Promise<void>((resolve) => {
    navigator.serviceWorker?.addEventListener("controllerchange", () => resolve(), { once: true })
    setTimeout(resolve, 5000)
  })
  await registration?.update().catch(() => {})
  await installed
  window.location.reload()
}
