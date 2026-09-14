import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { CATALOG_2026_09 } from "../src/catalog-2026-09.js"
import { listPlatforms } from "../src/catalog.js"
import { openDb, type Db } from "../src/db.js"
import { importCollection } from "../src/import-collection.js"

const collection = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/collection.json"), "utf8"))
const offline = (async () => {
  throw new Error("hors ligne")
}) as typeof fetch

let dir: string
let db: Db
let server: Server
let base: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-catalog-"))
  db = openDb(dir)
  importCollection(db, collection)
  server = createApp(db, dir, { igdb: null, romm: null, openAccess: true, fetchImpl: offline }).listen(0)
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
const platform = async (name: string) => ((await (await send("GET", "/api/platforms")).json()).platforms as Array<{ name: string; models: string[]; used: number }>).find((p) => p.name === name)

describe("catalogue des consoles", () => {
  it("contient les 135 consoles de RomM et leurs variantes, « Modèle d'origine » en tête", async () => {
    expect(CATALOG_2026_09).toHaveLength(135)
    expect(listPlatforms(db).length).toBeGreaterThanOrEqual(135)
    expect((await platform("PlayStation 2"))?.models).toEqual(["Modèle d'origine", "Slimline"])
    expect((await platform("Xbox 360"))?.models).toEqual(expect.arrayContaining(["Xbox 360 S", "Xbox 360 Elite"]))
    expect((await platform("Xbox 360"))?.models[0]).toBe("Xbox 360 Original")
    expect((await platform("Nintendo DS"))?.models).toEqual(expect.arrayContaining(["Nintendo DS Lite", "Nintendo DSi"]))
  })

  it("prend le nom RomM : GameCube devient Nintendo GameCube, à l'import comme à la saisie", async () => {
    expect(db.prepare("SELECT count(*) AS n FROM games WHERE platform = 'GameCube'").get()).toEqual({ n: 0 })
    expect((await platform("Nintendo GameCube"))?.used).toBeGreaterThan(0)
    const { id } = await (await send("POST", "/api/hardware", { kind: "Console", platform: "GameCube" })).json()
    expect((await (await send("GET", `/api/hardware/${id}`)).json()).platform).toBe("Nintendo GameCube")
  })

  it("apprend une console ou un modèle saisis par « Autre »", async () => {
    await send("POST", "/api/hardware", { kind: "Console", platform: "Xbox 360", model: "Xbox 360 E" })
    expect((await platform("Xbox 360"))?.models).toContain("Xbox 360 E")
    await send("POST", "/api/hardware", { kind: "Console", platform: "Console maison", model: "Prototype 1" })
    expect((await platform("Console maison"))?.models).toEqual(["Prototype 1"])
  })
})
