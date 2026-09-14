import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { openDb, type Db } from "../src/db.js"
import { importCollection } from "../src/import-collection.js"
import { Scandex, identifyBarcode, type ScandexClient } from "../src/scandex.js"

const collection = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/collection.json"), "utf8"))

// ScanDex simulé : un code connu (un jeu de la collection), le reste inconnu ; les appels sont comptés.
let calls = 0
let ownedIgdb = 0
const fake: ScandexClient = {
  lookup: async (ean) => {
    calls++
    if (ean === "5030917085789") return { igdb_id: ownedIgdb, name: "Jeu possédé", platform: "Nintendo GameCube" }
    if (ean === "5026555245920") return { igdb_id: 999999, name: "Grand Theft Auto IV", platform: "Xbox 360" }
    return null
  },
}

let dir: string
let db: Db
let server: Server
let base: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-scandex-"))
  db = openDb(dir)
  importCollection(db, collection)
  ownedIgdb = (db.prepare("SELECT igdb_id FROM games WHERE platform = 'Nintendo GameCube' AND igdb_id IS NOT NULL LIMIT 1").get() as { igdb_id: number }).igdb_id
  server = createApp(db, dir, { igdb: null, romm: null, openAccess: true, scandex: fake }).listen(0)
  await new Promise((r) => server.once("listening", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const identify = async (ean: string) => (await fetch(`${base}/api/barcodes/${ean}/identify`)).json()

describe("identification d'un code par ScanDex", () => {
  it("propose le jeu et dit s'il est déjà dans la collection", async () => {
    const r = await identify("5030917085789")
    expect(r).toMatchObject({ configured: true, suggestion: { igdb_id: ownedIgdb, platform: "Nintendo GameCube" } })
    expect(r.owned[0]).toMatchObject({ platform: "Nintendo GameCube" })
  })

  it("propose un jeu non possédé, sans rien rattacher", async () => {
    const r = await identify("5026555245920")
    expect(r).toMatchObject({ suggestion: { name: "Grand Theft Auto IV", platform: "Xbox 360" }, owned: [] })
    expect(db.prepare("SELECT count(*) AS n FROM barcodes WHERE ean = '5026555245920'").get()).toEqual({ n: 0 })
  })

  it("garde les réponses, même négatives, et refuse un code invalide", async () => {
    const before = calls
    await identify("5026555245920")
    expect((await identify("5051644108305")).suggestion).toBeNull()
    await identify("5051644108305")
    expect(calls).toBe(before + 1)
    expect((await fetch(`${base}/api/barcodes/123/identify`)).status).toBe(400)
  })

  it("redemande après un mois", async () => {
    let n = 0
    const client: ScandexClient = { lookup: async () => (n++, null) }
    await identifyBarcode(db, client, "3307216018216", Date.now())
    await identifyBarcode(db, client, "3307216018216", Date.now() + 31 * 86_400_000)
    expect(n).toBe(2)
  })
})

describe("client ScanDex", () => {
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
  it("lit la fiche IGDB et abrège le PC comme le reste de l'appli", async () => {
    const c = new Scandex("jeton", reply(200, { igdb_metadata: { id: 12, name: "Half-Life 2", platform: { id: 6, name: "PC (Microsoft Windows)" } } }))
    expect(await c.lookup("0014633098655")).toEqual({ igdb_id: 12, name: "Half-Life 2", platform: "PC" })
  })
  it("rend null pour un code absent, une erreur pour une panne", async () => {
    expect(await new Scandex("jeton", reply(404, { message: "This barcode does not exist yet." })).lookup("1")).toBeNull()
    await expect(new Scandex("jeton", reply(500, {})).lookup("1")).rejects.toThrow(/HTTP 500/)
  })
})
