import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { openDb, type Db } from "../src/db.js"
import { importCollection } from "../src/import-collection.js"
import { getGame, listLibrary } from "../src/library.js"

let dir: string
let db: Db
let server: Server
let base: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-library-"))
  db = openDb(dir)
  importCollection(db, JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/collection.json"), "utf8")))
  db.prepare("UPDATE games SET cover_file = id || '.jpg' WHERE cover_url IS NOT NULL").run()
  server = createApp(db, dir, { openAccess: true }).listen(0)
  await new Promise((r) => server.once("listening", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe("bibliothèque", () => {
  it("renvoie chaque jeu avec ses exemplaires", () => {
    const games = listLibrary(db)
    expect(games).toHaveLength(47)
    expect(games.reduce((n, g) => n + g.copies.length, 0)).toBe(48)
    const portal = games.find((g) => g.igdb_id === 72)!
    expect(portal.copies).toHaveLength(2)
    expect(portal.cover).toBe(`/covers/${portal.id}.jpg`)
    expect(games.find((g) => g.title === "Burnout 3: Takedown")!.cover).toBeNull()
  })

  it("donne la fiche complète d'un jeu", () => {
    const nfs = listLibrary(db).find((g) => g.title === "Need for Speed: Most Wanted")!
    const game = getGame(db, nfs.id as number)!
    expect(game).toMatchObject({ platform: "Nintendo GameCube", publisher: "Electronic Arts" })
    expect(String(game.summary)).toMatch(/^Arrivé en ville avec une voiture de sport/)
    expect(game.copies[0]).toMatchObject({ condition_game: "Bon", condition_box: "Bon", condition_manual: "Très bon", photos: [] })
    expect(getGame(db, 99999)).toBeNull()
  })

  it("expose les routes et valide l'identifiant", async () => {
    const lib = await (await fetch(`${base}/api/library`)).json()
    expect(lib.games).toHaveLength(47)
    expect((await fetch(`${base}/api/games/1`)).status).toBe(200)
    expect((await fetch(`${base}/api/games/99999`)).status).toBe(404)
    expect((await fetch(`${base}/api/games/abc`)).status).toBe(400)
  })
})
