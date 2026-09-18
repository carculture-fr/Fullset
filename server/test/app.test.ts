import { mkdtempSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createAccount } from "../src/account.js"
import { createApp } from "../src/app.js"
import { openDb, schemaVersion, type Db } from "../src/db.js"

let dir: string
let db: Db
let server: Server
let base: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-"))
  db = openDb(dir)
  await createAccount(db, { username: "alice", password: "mot-de-passe-de-test" })
  server = createApp(db, dir, { igdb: null, romm: null }).listen(0)
  await new Promise((r) => server.once("listening", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe("base", () => {
  it("applique les migrations et reste idempotente à la réouverture", () => {
    expect(schemaVersion(db)).toBe(17)
    const again = openDb(dir)
    expect(schemaVersion(again)).toBe(17)
    again.close()
  })
})

describe("/api/health", () => {
  it("répond 200 en lisant la base, sans authentification", async () => {
    const res = await fetch(`${base}/api/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, schema: 17 })
  })
})

describe("authentification", () => {
  it("refuse l'API sans session", async () => {
    const res = await fetch(`${base}/api/auth/me`)
    expect(await res.json()).toEqual({ setupRequired: false, authenticated: false })
    expect((await fetch(`${base}/api/library`)).status).toBe(401)
  })

  // Faille trouvée à l'audit du 14/09/2026 : le routeur ignore la casse, la garde ne l'ignorait pas.
  it("garde l'API et les photos quelle que soit l'écriture du chemin", async () => {
    for (const p of ["/API/library", "/Api/account", "/api/Library", "/%61pi/library", "//api/library", "/api/library/", "/PHOTOS/1-x.jpg", "/Photos/1-x.jpg"]) {
      expect([p, (await fetch(`${base}${p}`)).status]).toEqual([p, 401])
    }
    const write = await fetch(`${base}/API/games`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: "{}" })
    expect(write.status).toBe(401)
  })

  it("refuse toute écriture sans origine, quel que soit le chemin", async () => {
    expect((await fetch(`${base}/API/games`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(403)
    expect((await fetch(`${base}/nimporte-ou`, { method: "POST" })).status).toBe(403)
  })

  it("refuse un corps JSON trop gros avant même de le lire, sans session", async () => {
    const big = JSON.stringify({ value: "x".repeat(200_000) })
    expect((await fetch(`${base}/api/lists/place`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: big })).status).toBe(401)
  })
})
