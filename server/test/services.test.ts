import { mkdtempSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { openDb, type Db } from "../src/db.js"

// Services réglés dans l'appli : secrets jamais renvoyés, variables d'environnement prioritaires.

const STEAM_KEY = "0123456789ABCDEF0123456789ABCDEF" // gitleaks:allow (fausse clé de test)
const fakeFetch = (async (url: string) => {
  if (url.includes("GetOwnedGames")) return Response.json({ response: { game_count: 2, games: [{ appid: 1, name: "A" }, { appid: 2, name: "B" }] } })
  return new Response("", { status: 404 })
}) as unknown as typeof fetch

let dir: string
let db: Db
let server: Server
let base: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-services-"))
  db = openDb(dir)
  server = createApp(db, dir, { openAccess: true, fetchImpl: fakeFetch }).listen(0)
  await new Promise((r) => server.once("listening", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

afterEach(() => {
  delete process.env.SCANDEX_TOKEN
})

const get = async () => (await fetch(`${base}/api/services`)).json()
const put = (name: string, body: unknown) => fetch(`${base}/api/services/${name}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

describe("services", () => {
  it("part sans rien de configuré", async () => {
    const s = await get()
    expect(Object.keys(s)).toEqual(["igdb", "steam", "scandex", "screenscraper", "steamgriddb", "romm"])
    expect(s.steam).toEqual({ configured: false, fields: { api_key: { set: false, source: null, secret: true, preview: null }, steam_id: { set: false, source: null, secret: false, preview: null } } })
  })

  it("enregistre Steam, ne renvoie jamais la clé, et le teste pour de vrai", async () => {
    expect((await put("steam", { api_key: STEAM_KEY, steam_id: "123" })).status).toBe(400)
    const res = await put("steam", { api_key: STEAM_KEY, steam_id: "76561190000000000" })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain(STEAM_KEY)
    expect(JSON.parse(text).steam).toMatchObject({ configured: true, fields: { api_key: { preview: "••••CDEF", source: "app" }, steam_id: { preview: "76561190000000000" } } })
    const test = await (await fetch(`${base}/api/services/steam/test`, { method: "POST" })).json()
    expect(test).toEqual({ ok: true, message: "Steam répond : 2 jeux sur le compte." })
    expect((await (await fetch(`${base}/api/steam`)).json()).configured).toBe(true)
  })

  it("garde la clé quand on ne change que l'autre champ, et se retire", async () => {
    await put("steam", { steam_id: "76561190000000001" })
    expect((await get()).steam.fields.api_key.preview).toBe("••••CDEF")
    await put("steam", { api_key: null, steam_id: null })
    expect((await get()).steam.configured).toBe(false)
  })

  it("rend IGDB disponible dès qu'il est enregistré", async () => {
    expect((await (await fetch(`${base}/api/health`)).json()).igdb).toBe(false)
    await put("igdb", { client_id: "id", client_secret: "secret" })
    expect((await (await fetch(`${base}/api/health`)).json()).igdb).toBe(true)
  })

  it("laisse passer devant la variable d'environnement, sans la rendre modifiable", async () => {
    process.env.SCANDEX_TOKEN = "jeton-venu-de-env-9876"
    expect((await get()).scandex).toMatchObject({ configured: true, fields: { token: { source: "env", preview: "••••9876" } } })
    expect((await put("scandex", { token: "autre" })).status).toBe(400)
  })

  it("refuse un service, un champ ou une adresse RomM inconnus", async () => {
    expect((await put("netflix", {})).status).toBe(400)
    expect((await put("romm", { mot: "x" })).status).toBe(400)
    expect((await put("romm", { url: "ftp://nas/romm" })).status).toBe(400)
    expect((await put("romm", { url: "http://192.0.2.10:8080/", api_token: "t" })).status).toBe(200)
    expect((await get()).romm.fields.url.preview).toBe("http://192.0.2.10:8080")
  })
})
