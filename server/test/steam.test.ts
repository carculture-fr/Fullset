import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { openDb, type Db } from "../src/db.js"
import type { IgdbClient, IgdbGame } from "../src/igdb.js"
import { importCollection } from "../src/import-collection.js"
import { Steam, type SteamOwned } from "../src/steam.js"

const collection = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/collection.json"), "utf8"))

let dir: string
let db: Db
let server: Server
let base: string
let ownedPc: { id: number; igdb_id: number }
let owned: SteamOwned[] = []
let igdbCalls = 0

const fakeIgdb: IgdbClient = {
  search: async () => [],
  game: async (id) =>
    ({
      igdb_id: id,
      title: `Jeu IGDB ${id}`,
      summary: null,
      developer: null,
      publisher: null,
      release_date: null,
      genres: null,
      game_modes: null,
      perspective: null,
      series: null,
      pegi: null,
      igdb_rating: null,
      igdb_url: null,
      cover_url: null,
      platforms: ["PC"],
      covers: [],
    }) as IgdbGame,
  steamIds: async (appids) => {
    igdbCalls++
    const map = new Map<string, number>()
    if (appids.includes("100")) map.set("100", ownedPc.igdb_id)
    if (appids.includes("200")) map.set("200", 424242)
    return map
  },
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-steam-"))
  db = openDb(dir)
  importCollection(db, collection)
  ownedPc = db.prepare("SELECT id, igdb_id FROM games WHERE platform = 'PC' AND igdb_id IS NOT NULL ORDER BY id LIMIT 1").get() as { id: number; igdb_id: number }
  owned = [
    { appid: 100, name: "Jeu déjà possédé", playtime_minutes: 754, last_played: 1_700_000_000_000 },
    { appid: 200, name: "Jeu Steam absent", playtime_minutes: 0, last_played: null },
    { appid: 300, name: "Jeu sans fiche IGDB", playtime_minutes: 30, last_played: null },
  ]
  const steam = { ownedGames: async () => owned }
  server = createApp(db, dir, { igdb: fakeIgdb, romm: null, openAccess: true, steam, fetchImpl: (async () => new Response("", { status: 404 })) as typeof fetch }).listen(0)
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

describe("synchronisation Steam", () => {
  it("relie les jeux PC déjà là et reprend leur temps de jeu, au bouton", async () => {
    expect((await (await send("GET", "/api/steam")).json()).synced_at).toBeNull()
    const r = await (await send("POST", "/api/steam/sync")).json()
    expect(r).toMatchObject({ owned: 3, recognised: 2, linked: 1, playtime: 1, candidates: 2 })
    expect(db.prepare("SELECT steam_appid FROM games WHERE id = ?").get(ownedPc.id)).toEqual({ steam_appid: 100 })
    const copy = db.prepare("SELECT play_time_hours FROM copies WHERE game_id = ? AND support = 'Dématérialisé' ORDER BY id LIMIT 1").get(ownedPc.id) as { play_time_hours: number }
    expect(copy.play_time_hours).toBe(12.6)
    expect((await (await send("GET", `/api/games/${ownedPc.id}`)).json()).steam_appid).toBe(100)
  })

  it("ne redemande à IGDB que les appid inconnus", async () => {
    const before = igdbCalls
    owned = owned.map((g) => (g.appid === 100 ? { ...g, playtime_minutes: 800 } : g))
    const r = await (await send("POST", "/api/steam/sync")).json()
    expect(r.playtime).toBe(1)
    // 300 reste sans fiche : il est redemandé, 100 et 200 ne le sont plus.
    expect(igdbCalls).toBe(before + 1)
  })

  it("propose les jeux absents, puis ajoute ceux qu'on choisit", async () => {
    const { items } = await (await send("GET", "/api/steam/candidates")).json()
    expect(items.map((i: { appid: number }) => i.appid)).toEqual([300, 200])
    const res = await send("POST", "/api/steam/import", { appids: [200, 300] })
    expect(res.status).toBe(201)
    const { added, failed } = await res.json()
    expect(failed).toEqual([])
    expect(added.map((a: { appid: number }) => a.appid).sort()).toEqual([200, 300])
    const g200 = db.prepare("SELECT id, igdb_id, title, platform FROM games WHERE steam_appid = 200").get() as { id: number; igdb_id: number; title: string; platform: string }
    expect(g200).toMatchObject({ igdb_id: 424242, title: "Jeu IGDB 424242", platform: "PC" })
    expect(db.prepare("SELECT support, purchase_place, play_status FROM copies WHERE game_id = ?").get(g200.id)).toEqual({
      support: "Dématérialisé",
      purchase_place: "Steam",
      play_status: "Pas commencé",
    })
    expect(db.prepare("SELECT title, igdb_id FROM games WHERE steam_appid = 300").get()).toEqual({ title: "Jeu sans fiche IGDB", igdb_id: null })
    expect((await (await send("GET", "/api/steam/candidates")).json()).items).toEqual([])
  })

  it("oublie un jeu retiré du compte Steam", async () => {
    owned = owned.filter((g) => g.appid !== 300)
    const r = await (await send("POST", "/api/steam/sync")).json()
    expect(r.owned).toBe(2)
    expect(db.prepare("SELECT count(*) AS n FROM steam_library").get()).toEqual({ n: 2 })
  })
})

describe("client Steam", () => {
  const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
  it("lit les jeux, le temps de jeu et la dernière partie", async () => {
    const c = new Steam("cle", "7656", reply(200, { response: { game_count: 1, games: [{ appid: 220, name: "Half-Life 2", playtime_forever: 90, rtime_last_played: 1_700_000_000 }] } }))
    expect(await c.ownedGames()).toEqual([{ appid: 220, name: "Half-Life 2", playtime_minutes: 90, last_played: 1_700_000_000_000 }])
  })
  it("explique un profil privé et une clé refusée, sans montrer la clé", async () => {
    await expect(new Steam("cle-secrete", "1", reply(200, { response: {} })).ownedGames()).rejects.toThrow(/Détails des jeux/)
    const err = (await new Steam("cle-secrete", "1", reply(403, {})).ownedGames().catch((e: Error) => e)) as Error
    expect(err.message).toMatch(/refuse la clé/)
    expect(err.message).not.toContain("cle-secrete")
  })
  it("répond 502 quand Steam n'est pas configuré", async () => {
    const d = mkdtempSync(path.join(tmpdir(), "fullset-steam-off-"))
    const s = createApp(openDb(d), d, { igdb: null, romm: null, openAccess: true, steam: null }).listen(0)
    await new Promise((r) => s.once("listening", r))
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}`
    expect((await (await fetch(`${url}/api/steam`)).json()).configured).toBe(false)
    expect((await fetch(`${url}/api/steam/sync`, { method: "POST" })).status).toBe(502)
    s.close()
    rmSync(d, { recursive: true, force: true })
  })
})
