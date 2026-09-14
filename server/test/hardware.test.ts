import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { openDb, type Db } from "../src/db.js"
import { listHardware } from "../src/hardware.js"
import { importCollection } from "../src/import-collection.js"
import { listValues, renameValue } from "../src/lists.js"
import { stats } from "../src/stats.js"
import { exportJson, importExport } from "../src/transfer.js"

const collection = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/collection.json"), "utf8"))
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])

let dir: string
let db: Db
let server: Server
let base: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-hw-"))
  db = openDb(dir)
  importCollection(db, collection)
  // Hors ligne : la recherche automatique d'une image par défaut ne doit pas sortir sur Internet.
  server = createApp(db, dir, { igdb: null, romm: null, openAccess: true, fetchImpl: (async () => { throw new Error("hors ligne") }) as typeof fetch }).listen(0)
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
const ps2 = {
  kind: "Console",
  platform: "PlayStation 2",
  model: "SCPH-90004",
  edition: "Slim",
  color: "Noir",
  region: "PAL (Europe)",
  content: "Complet (boîte + notice)",
  condition_item: "Bon",
  condition_box: "Moyen",
  condition_manual: "Très bon",
  working: "Fonctionnel",
  price: "45,00",
  purchase_date: "2026-09-01",
  purchase_place: "Vinted",
  serial_number: "SN123",
}
let id: number

describe("matériel", () => {
  it("ajoute une console avec ses trois états et son achat", async () => {
    const res = await send("POST", "/api/hardware", ps2)
    expect(res.status).toBe(201)
    id = (await res.json()).id
    const detail = await (await fetch(`${base}/api/hardware/${id}`)).json()
    expect(detail).toMatchObject({ kind: "Console", model: "SCPH-90004", edition: "Slim", condition_box: "Moyen", price_cents: 4500, photos: [], valuations: [] })
  })

  it("refuse un type, une console ou un prix invalide", async () => {
    expect((await send("POST", "/api/hardware", { ...ps2, kind: "Tondeuse" })).status).toBe(400)
    expect((await send("POST", "/api/hardware", { ...ps2, platform: " " })).status).toBe(400)
    expect((await send("POST", "/api/hardware", { ...ps2, price: "cher" })).status).toBe(400)
    expect((await send("POST", "/api/hardware", { ...ps2, working: "Parfait" })).status).toBe(400)
  })

  it("se modifie, prend des photos et des estimations", async () => {
    expect((await send("PUT", `/api/hardware/${id}`, { ...ps2, working: "À réparer" })).status).toBe(200)
    const form = new FormData()
    form.append("file", new Blob([JPEG], { type: "image/jpeg" }), "p.jpg")
    const photo = await (await fetch(`${base}/api/hardware/${id}/photos`, { method: "POST", body: form })).json()
    expect(existsSync(path.join(dir, photo.url))).toBe(true)
    expect((await send("POST", `/api/hardware/${id}/valuations`, { amount: "60", valued_on: "2026-09-10" })).status).toBe(201)
    expect(listHardware(db)[0]).toMatchObject({ working: "À réparer", value_cents: 6000, photo: photo.url, photo_count: 1 })
    expect(stats(db).hardware).toMatchObject({ count: 1, spentCents: 4500, value: { estimatedCents: 6000, estimatedItems: 1 } })
    // Le total dépensé des jeux reste celui des jeux.
    expect(stats(db).spentCents).toBe(28218)
  })

  it("partage les lieux d'achat avec les jeux et propose éditions et couleurs", () => {
    const lists = listValues(db)
    expect(lists.place.find((v) => v.value === "Vinted")).toMatchObject({ count: 8 })
    expect(lists.hw_edition.find((v) => v.value === "Slim")).toMatchObject({ count: 1 })
    // Depuis la 0.13, les variantes (OLED, Lite, Fat…) sont des modèles du catalogue, plus des éditions.
    for (const e of ["Collector", "Bundle (pack avec jeux)", "Édition limitée"]) expect(lists.hw_edition.some((v) => v.value === e)).toBe(true)
    for (const e of ["OLED", "Lite", "Pro", "Modèle d'origine (Fat)"]) expect(lists.hw_edition.some((v) => v.value === e)).toBe(false)
    expect(lists.hw_color.some((v) => v.value === "Transparent")).toBe(true)
    expect(lists.edition.some((v) => v.value === "Big Hits")).toBe(true)
    renameValue(db, "place", lists.place.find((v) => v.value === "Vinted")!.id, "Vinted (appli)")
    expect(listHardware(db)[0].purchase_place).toBe("Vinted (appli)")
  })

  it("voyage dans l'export JSON", () => {
    const d = mkdtempSync(path.join(tmpdir(), "fullset-hw-json-"))
    const target = openDb(d)
    importExport(target, JSON.stringify(exportJson(db)))
    expect(listHardware(target).map(({ photo, photo_count, ...h }) => h)).toEqual(listHardware(db).map(({ photo, photo_count, ...h }) => h))
    target.close()
    rmSync(d, { recursive: true, force: true })
  })

  it("s'exporte en CSV et se supprime avec ses photos", async () => {
    // Response.text() retire le BOM : on lit les octets pour vérifier qu'il est bien là (Excel en a besoin).
    const bytes = new Uint8Array(await (await fetch(`${base}/api/export-materiel.csv`)).arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes).startsWith("type;plateforme;modèle;édition;couleur;")).toBe(true)
    const photo = listHardware(db)[0].photo!
    expect((await send("DELETE", `/api/hardware/${id}`)).status).toBe(200)
    expect(existsSync(path.join(dir, photo))).toBe(false)
    expect(listHardware(db)).toEqual([])
  })
})
