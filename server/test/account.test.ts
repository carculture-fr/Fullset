import { mkdtempSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { checkCredentials, setPassword, verifyPassword } from "../src/account.js"
import { createApp } from "../src/app.js"
import { openDb, type Db } from "../src/db.js"

// Installation (premier lancement), connexion par mot de passe, sessions en base.

let dir: string
let db: Db
let server: Server
let base: string

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-account-"))
  db = openDb(dir)
  server = createApp(db, dir, { igdb: null, romm: null, scandex: null, steam: null }).listen(0)
  await new Promise((r) => server.once("listening", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(() => {
  server.close()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

// Comme un navigateur sur le site : Origin du site lui-même (contrôle d'origine sans liste).
const call = (method: string, url: string, body?: unknown, cookie?: string | null, headers: Record<string, string> = {}) =>
  fetch(`${base}${url}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: base, ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? null
const me = async (cookie?: string | null) => (await call("GET", "/api/auth/me", undefined, cookie)).json()
const PASSWORD = "un-mot-de-passe-solide"
const install = async () => cookieOf(await call("POST", "/api/setup", { username: "alice", password: PASSWORD }))!
const login = (username = "alice", password = PASSWORD) => call("POST", "/api/auth/login", { username, password })

describe("premier lancement", () => {
  it("ferme l'API tant que le compte n'existe pas", async () => {
    expect(await me()).toEqual({ setupRequired: true, authenticated: false })
    expect((await call("GET", "/api/library")).status).toBe(401)
    expect((await call("POST", "/api/games", {})).status).toBe(401)
  })

  it("crée le compte et ouvre la session, puis ferme l'inscription", async () => {
    expect((await call("POST", "/api/setup", { username: "alice", password: "court" })).status).toBe(400)
    expect((await call("POST", "/api/setup", { username: "a b", password: PASSWORD })).status).toBe(400)
    const cookie = await install()
    expect(cookie).toMatch(/^fullset_session=/)
    expect(await me(cookie)).toEqual({ setupRequired: false, authenticated: true })
    expect((await call("GET", "/api/library", undefined, cookie)).status).toBe(200)
    const again = await call("POST", "/api/setup", { username: "mallory", password: PASSWORD })
    expect(again.status).toBe(409)
    expect(cookieOf(again)).toBeNull()
    expect((await (await call("GET", "/api/account", undefined, cookie)).json()).username).toBe("alice")
  })

  it("refuse une installation venue d'un autre site", async () => {
    const res = await call("POST", "/api/setup", { username: "alice", password: PASSWORD }, null, { Origin: "https://intrus.example" })
    expect(res.status).toBe(403)
    expect(await me()).toMatchObject({ setupRequired: true })
  })
})

describe("connexion", () => {
  beforeEach(install)

  it("ouvre une session avec le bon mot de passe, sans tenir compte de la casse de l'identifiant", async () => {
    expect((await login("alice", "mauvais-mot-de-passe")).status).toBe(401)
    expect((await login("bob")).status).toBe(401)
    const res = await login("ALICE")
    expect(res.status).toBe(200)
    expect(await me(cookieOf(res))).toMatchObject({ authenticated: true })
  })

  it("pose un cookie Secure derrière un proxy HTTPS", async () => {
    const res = await call("POST", "/api/auth/login", { username: "alice", password: PASSWORD }, null, { "X-Forwarded-Proto": "https" })
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly.*SameSite=Lax; Secure/)
  })

  it("se ferme après dix essais faux, même avec le bon mot de passe ensuite", async () => {
    for (let i = 0; i < 10; i++) expect((await login("alice", `faux-${i}-mot-de-passe`)).status).toBe(401)
    expect((await login()).status).toBe(429)
  })

  it("rejette un cookie inventé", async () => {
    expect(await me("fullset_session=invente")).toMatchObject({ authenticated: false })
  })

  it("se déconnecter supprime vraiment la session", async () => {
    const cookie = cookieOf(await login())!
    await call("POST", "/api/auth/logout", undefined, cookie)
    expect(await me(cookie)).toMatchObject({ authenticated: false })
    expect((await call("GET", "/api/library", undefined, cookie)).status).toBe(401)
  })

  it("déconnecte les autres appareils sur demande", async () => {
    const phone = cookieOf(await login())!
    const laptop = cookieOf(await login())!
    await call("POST", "/api/account/logout-others", {}, laptop)
    expect(await me(phone)).toMatchObject({ authenticated: false })
    expect(await me(laptop)).toMatchObject({ authenticated: true })
  })
})

describe("compte", () => {
  it("change de mot de passe avec l'actuel, et déconnecte les autres appareils", async () => {
    const cookie = await install()
    const other = cookieOf(await login())!
    expect((await call("PUT", "/api/account/password", { current: "pas-le-bon-mot", password: "nouveau-mot-de-passe" }, cookie)).status).toBe(400)
    expect((await call("PUT", "/api/account/password", { current: PASSWORD, password: "court" }, cookie)).status).toBe(400)
    expect((await call("PUT", "/api/account/password", { current: PASSWORD, password: "nouveau-mot-de-passe" }, cookie)).status).toBe(200)
    expect((await login()).status).toBe(401)
    expect((await login("alice", "nouveau-mot-de-passe")).status).toBe(200)
    expect(await me(other)).toMatchObject({ authenticated: false })
    expect(await me(cookie)).toMatchObject({ authenticated: true })
  })

  it("modifie le profil ; l'e-mail est facultatif mais doit être valide", async () => {
    const cookie = await install()
    expect((await call("PUT", "/api/account", { username: "alice", email: "pas-un-mail" }, cookie)).status).toBe(400)
    expect((await call("PUT", "/api/account", { username: "alice2", display_name: "Alice", email: "" }, cookie)).status).toBe(200)
    expect(await (await call("GET", "/api/account", undefined, cookie)).json()).toEqual({ username: "alice2", display_name: "Alice", email: null })
  })

  it("le secours en ligne de commande pose un nouveau mot de passe", async () => {
    await install()
    await setPassword(db, "mot-de-passe-de-secours")
    expect(await checkCredentials(db, "alice", PASSWORD)).toBe(false)
    expect(await checkCredentials(db, "alice", "mot-de-passe-de-secours")).toBe(true)
  })

  it("ne plante pas sur un compte venu d'une base sans mot de passe", async () => {
    expect(await verifyPassword("n'importe-quoi", "inutilise$0123abcd")).toBe(false)
  })
})
