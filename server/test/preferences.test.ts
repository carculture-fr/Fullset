import { mkdtempSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { openDb, type Db } from "../src/db.js"

let dir: string
let db: Db
let server: Server
let base: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-prefs-"))
  db = openDb(dir)
  server = createApp(db, dir, { igdb: null, romm: null, openAccess: true, steam: null }).listen(0)
  await new Promise((r) => server.once("listening", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const get = async () => (await fetch(`${base}/api/preferences`)).json()
const put = (body: unknown) => fetch(`${base}/api/preferences`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

describe("affichage par défaut", () => {
  it("part des valeurs d'origine, puis garde un choix sans toucher aux autres", async () => {
    expect(await get()).toEqual({ games_sort: "nom", games_view: "grille", games_groups: "replies", hardware_sort: "plateforme", language: "auto" })
    expect((await put({ games_sort: "plateforme" })).status).toBe(200)
    await put({ games_view: "liste" })
    await put({ language: "en" })
    expect(await get()).toEqual({ games_sort: "plateforme", games_view: "liste", games_groups: "replies", hardware_sort: "plateforme", language: "en" })
  })

  it("refuse une préférence ou une valeur inconnue", async () => {
    expect((await put({ games_sort: "couleur" })).status).toBe(400)
    expect((await put({ theme: "rose" })).status).toBe(400)
    expect((await put({ language: "de" })).status).toBe(400)
    expect((await get()).games_sort).toBe("plateforme")
  })
})
