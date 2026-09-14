import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { openDb, type Db } from "../src/db.js"
import { importCollection } from "../src/import-collection.js"
import { listLibrary } from "../src/library.js"
import { Romm, type RommClient } from "../src/romm.js"
import { stats } from "../src/stats.js"
import { exportCsv, exportJson, importExport } from "../src/transfer.js"

const collection = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/collection.json"), "utf8"))

const fakeRomm: RommClient = {
  romFor: async (igdbId) => (igdbId === 243048 ? { id: 3280, name: "Need for Speed: Most Wanted", platform: "Nintendo GameCube", url: "http://romm/rom/3280" } : null),
}

let dir: string
let db: Db
let server: Server
let base: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-l5-"))
  db = openDb(dir)
  importCollection(db, collection)
  server = createApp(db, dir, { igdb: null, romm: fakeRomm, openAccess: true }).listen(0)
  await new Promise((r) => server.once("listening", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const send = (method: string, url: string, body?: unknown) =>
  fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
const nfs = () => listLibrary(db).find((g) => g.title === "Need for Speed: Most Wanted")!

describe("valeur estimée", () => {
  it("garde l'historique, la plus récente fait foi", async () => {
    const copyId = nfs().copies[0].id
    expect((await send("POST", `/api/copies/${copyId}/valuations`, { amount: "20,00", valued_on: "2026-09-01", note: "annonces Vinted" })).status).toBe(201)
    expect((await send("POST", `/api/copies/${copyId}/valuations`, { amount: "15", valued_on: "2026-06-01" })).status).toBe(201)
    expect(nfs().copies[0]).toMatchObject({ value_cents: 2000, valued_on: "2026-09-01" })
    const game = await (await fetch(`${base}/api/games/${nfs().id}`)).json()
    expect(game.copies[0].valuations.map((v: { amount_cents: number }) => v.amount_cents)).toEqual([2000, 1500])
  })

  it("refuse un montant ou une date invalide", async () => {
    const copyId = nfs().copies[0].id
    expect((await send("POST", `/api/copies/${copyId}/valuations`, { amount: "beaucoup" })).status).toBe(400)
    expect((await send("POST", `/api/copies/${copyId}/valuations`, { amount: "5", valued_on: "2026-02-30" })).status).toBe(400)
    expect((await send("POST", `/api/copies/999999/valuations`, { amount: "5" })).status).toBe(404)
  })

  it("donne la valeur totale et ce qu'ont coûté les exemplaires estimés", () => {
    expect(stats(db).value).toEqual({ estimatedCents: 2000, estimatedCopies: 1, costOfEstimatedCents: 1490 })
  })

  it("voyage dans l'export : dernière valeur en CSV, historique en JSON", () => {
    const csv = exportCsv(db)
    const csvTarget = openDb(mkdtempSync(path.join(tmpdir(), "fullset-l5-csv-")))
    importExport(csvTarget, csv)
    expect(exportCsv(csvTarget)).toBe(csv)
    expect(stats(csvTarget).value.estimatedCents).toBe(2000)

    const jsonTarget = openDb(mkdtempSync(path.join(tmpdir(), "fullset-l5-json-")))
    importExport(jsonTarget, JSON.stringify(exportJson(db)))
    const history = jsonTarget.prepare("SELECT amount_cents, note FROM valuations ORDER BY valued_on").all()
    expect(history).toEqual([
      { amount_cents: 1500, note: null },
      { amount_cents: 2000, note: "annonces Vinted" },
    ])
  })

  it("supprime une estimation", async () => {
    const game = await (await fetch(`${base}/api/games/${nfs().id}`)).json()
    const older = game.copies[0].valuations[1]
    expect((await send("DELETE", `/api/valuations/${older.id}`)).status).toBe(200)
    expect((await send("DELETE", `/api/valuations/${older.id}`)).status).toBe(404)
  })
})

describe("liste de souhaits", () => {
  it("ajoute, signale un jeu déjà possédé, modifie et retire", async () => {
    const a = await (await send("POST", "/api/wishlist", { igdb_id: 123456, platform: "Dreamcast", title: "Shenmue II", target_price: "8,00" })).json()
    await send("POST", "/api/wishlist", { igdb_id: 243048, platform: "GameCube", title: "Need for Speed: Most Wanted" })
    const list = (await (await fetch(`${base}/api/wishlist`)).json()).items
    expect(list.find((w: { title: string }) => w.title === "Shenmue II")).toMatchObject({ target_price_cents: 800, owned_game_id: null })
    expect(list.find((w: { title: string }) => w.title === "Need for Speed: Most Wanted").owned_game_id).toBe(nfs().id)
    expect(stats(db).wishlist).toEqual({ count: 2, targetCents: 800 })

    expect((await send("PUT", `/api/wishlist/${a.id}`, { igdb_id: 123456, platform: "Dreamcast", title: "Shenmue II", target_price: "6" })).status).toBe(200)
    expect((await send("POST", "/api/wishlist", { title: "X", cover_url: "http://ailleurs/image.jpg" })).status).toBe(400)
    expect((await send("POST", "/api/wishlist", { title: " " })).status).toBe(400)
    expect((await send("DELETE", `/api/wishlist/${a.id}`)).status).toBe(200)
    expect((await (await fetch(`${base}/api/wishlist`)).json()).items).toHaveLength(1)
  })
})

describe("lien RomM", () => {
  it("ajoute la ROM à la fiche quand elle existe", async () => {
    const withRom = await (await fetch(`${base}/api/games/${nfs().id}`)).json()
    expect(withRom.romm).toMatchObject({ id: 3280, url: "http://romm/rom/3280" })
    const other = listLibrary(db).find((g) => g.igdb_id !== null && g.igdb_id !== 243048)!
    expect((await (await fetch(`${base}/api/games/${other.id}`)).json()).romm).toBeNull()
  })

  it("écarte les fichiers vides de la solution d'attente et met en cache", async () => {
    let calls = 0
    const responses: Record<number, unknown> = {
      1: { id: 10, name: "Vide", platform_display_name: "PlayStation 3", fs_size_bytes: 0, missing_from_fs: false },
      2: { id: 11, name: "Absent", platform_display_name: "GameCube", fs_size_bytes: 10, missing_from_fs: true },
      3: { id: 12, name: "Burnout Revenge", platform_display_name: "PlayStation 2", fs_size_bytes: 3979935744, missing_from_fs: false },
    }
    const fetchImpl = (async (url: string | URL | Request) => {
      calls++
      const igdb = Number(new URL(String(url)).searchParams.get("igdb_id"))
      return responses[igdb] ? new Response(JSON.stringify(responses[igdb])) : new Response('{"detail":"not found"}', { status: 404 })
    }) as typeof fetch
    const romm = new Romm("http://romm.lan", "jeton", fetchImpl)
    expect(await romm.romFor(1)).toBeNull()
    expect(await romm.romFor(2)).toBeNull()
    expect(await romm.romFor(4)).toBeNull()
    expect(await romm.romFor(3)).toEqual({ id: 12, name: "Burnout Revenge", platform: "PlayStation 2", url: "http://romm.lan/rom/12" })
    await romm.romFor(3)
    expect(calls).toBe(4)
  })

  it("n'empêche pas d'ouvrir la fiche si RomM est en panne", async () => {
    const d = mkdtempSync(path.join(tmpdir(), "fullset-romm-"))
    const db2 = openDb(d)
    importCollection(db2, collection)
    const s = createApp(db2, d, { igdb: null, openAccess: true, romm: { romFor: async () => { throw new Error("panne") } } }).listen(0)
    await new Promise((r) => s.once("listening", r))
    const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/api/games/1`)
    expect(res.status).toBe(200)
    expect((await res.json()).romm).toBeNull()
    s.close()
    rmSync(d, { recursive: true, force: true })
  })
})
