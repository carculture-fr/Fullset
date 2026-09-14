import type { NextFunction, Request, Response } from "express"

import { SESSION_IDLE_MS, checkCredentials, createAccount, createSession, deleteSession, findSession, getAccount } from "./account.js"
import type { Db } from "./db.js"
import { msg } from "./i18n.js"

/**
 * Connexion par identifiant et mot de passe (un seul compte par installation). Tant qu'aucun
 * compte n'existe, l'API est fermée et seul l'assistant de premier lancement (/api/setup) répond.
 * Session : jeton aléatoire dans un cookie HttpOnly, SameSite=Lax, Secure derrière HTTPS ; son
 * empreinte en base (table sessions), supprimée à la déconnexion.
 */

const COOKIE = "fullset_session"
const MAX_FAILURES = 10
const FAILURE_WINDOW_MS = 15 * 60_000

function cookieValue(req: Request): string | undefined {
  for (const part of req.headers.cookie?.split(";") ?? []) {
    const [name, ...rest] = part.trim().split("=")
    if (name === COOKIE) return rest.join("=")
  }
  return undefined
}

/** Chemin tel que le routeur le compare : décodé, en minuscules, barres obliques répétées fusionnées. */
export function routePath(req: Request) {
  let p = req.path
  try {
    p = decodeURIComponent(p)
  } catch {
    // encodage invalide : on garde le chemin brut
  }
  return p.toLowerCase().replace(/\/{2,}/g, "/")
}

/** HTTPS vu du client : req.secure (proxy de confiance) ou l'en-tête du proxy. Il ne sert qu'à durcir. */
export const viaHttps = (req: Request) => req.secure || req.get("x-forwarded-proto") === "https"

// Routes ouvertes sans session : la sonde, l'état de connexion, la connexion et l'assistant.
const PUBLIC_API = new Set(["/api/health", "/api/auth/me", "/api/auth/login", "/api/auth/logout", "/api/setup"])

/** `openAccess` : pour les tests seulement, l'API répond sans compte ni session. */
export function createAuth(db: Db, { openAccess = false }: { openAccess?: boolean } = {}) {
  const failures = new Map<string, number[]>()

  const current = (req: Request) => findSession(db, cookieValue(req))

  function setCookie(req: Request, res: Response, token: string, maxAge = SESSION_IDLE_MS / 1000) {
    res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${viaHttps(req) ? "; Secure" : ""}`)
  }
  const openSession = (req: Request, res: Response) => setCookie(req, res, createSession(db, req.get("user-agent")))

  function handleMe(req: Request, res: Response) {
    if (openAccess) return res.json({ setupRequired: false, authenticated: true })
    res.json({ setupRequired: !getAccount(db), authenticated: Boolean(getAccount(db) && current(req)) })
  }

  /** Premier lancement : crée le compte, puis l'inscription est close pour de bon. */
  async function setup(req: Request, res: Response) {
    const done = () => res.status(409).json({ error: msg("auth.alreadyInstalled") })
    if (getAccount(db)) return done()
    if (!(await createAccount(db, req.body ?? {}))) return done()
    openSession(req, res)
    res.status(201).json({ ok: true })
  }

  /** Dix échecs par quart d'heure et par adresse IP (l'IP réelle, derrière un proxy déclaré de confiance). */
  async function login(req: Request, res: Response) {
    const ip = req.ip ?? "?"
    const now = Date.now()
    const recent = (failures.get(ip) ?? []).filter((t) => now - t < FAILURE_WINDOW_MS)
    if (recent.length >= MAX_FAILURES) return res.status(429).json({ error: msg("auth.tooManyAttempts") })
    // L'essai compte avant la vérification : une rafale simultanée ne passe pas sous la limite.
    failures.set(ip, [...recent, now])
    if (!(await checkCredentials(db, req.body?.username, req.body?.password))) {
      return res.status(401).json({ error: msg("auth.badCredentials") })
    }
    failures.delete(ip)
    openSession(req, res)
    res.json({ ok: true })
  }

  function logout(req: Request, res: Response) {
    const token = cookieValue(req)
    if (token) deleteSession(db, token)
    setCookie(req, res, "", 0)
    res.json({ ok: true })
  }

  /** Garde /api/* (sauf routes publiques) et les photos. */
  function requireAuth(req: Request, res: Response, next: NextFunction) {
    // Express route sans tenir compte de la casse : « /API/library » atteint « /api/library ».
    // La garde compare donc un chemin décodé et en minuscules.
    const p = routePath(req).replace(/\/+$/, "")
    if (!p.startsWith("/api") && !p.startsWith("/photos")) return next()
    if (PUBLIC_API.has(p) || openAccess) return next()
    if (!getAccount(db) || !current(req)) return res.status(401).json({ error: msg("auth.required") })
    next()
  }

  /** Jeton de la session en cours (pour « déconnecter les autres appareils »). */
  const sessionToken = (req: Request) => current(req)?.token ?? null

  return { handleMe, setup, login, logout, requireAuth, sessionToken }
}
