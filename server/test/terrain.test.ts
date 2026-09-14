import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { normalizeEan } from "../src/barcodes.js"
import { openDb, type Db } from "../src/db.js"
import { importCollection } from "../src/import-collection.js"

// Codes-barres appris au scan, en-têtes de sécurité et contrôle d'origine.

const collection = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/collection.json"), "utf8"))
const ORIGIN = "https://fullset.example"

let dir: string
let db: Db
let server: Server
let base: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-terrain-"))
  db = openDb(dir)
  importCollection(db, collection)
  server = createApp(db, dir, { igdb: null, romm: null, openAccess: true, allowedOrigins: [ORIGIN] }).listen(0)
  await new Promise((r) => server.once("listening", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const send = (method: string, url: string, body?: unknown, origin: string | null = ORIGIN) =>
  fetch(`${base}${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const firstGame = () => db.prepare("SELECT g.id, c.id AS copy_id FROM games g JOIN copies c ON c.game_id = g.id ORDER BY g.id LIMIT 1").get() as { id: number; copy_id: number }

describe("normalisation EAN", () => {
  it("accepte EAN-13, EAN-8, UPC-A, ignore espaces et tirets", () => {
    expect(normalizeEan("3 307215 913345")).toBe("3307215913345")
    expect(normalizeEan("5-030917-285080")).toBe("5030917285080")
    expect(normalizeEan("96385074")).toBe("96385074")
    expect(normalizeEan("045496590420")).toBe("045496590420")
  })

  it("refuse une longueur ou une clé de contrôle fausse", () => {
    expect(() => normalizeEan("12345")).toThrow(/n'est pas un code-barres/)
    expect(() => normalizeEan("3307215913346")).toThrow(/clé de contrôle/)
  })
})

describe("codes-barres", () => {
  it("un code inconnu ne désigne rien", async () => {
    const res = await send("GET", "/api/barcodes/5030917285080")
    expect(await res.json()).toEqual({ ean: "5030917285080", known: false, edition: null, game: null })
    expect((await send("GET", "/api/barcodes/123")).status).toBe(400)
  })

  it("s'apprend à l'enregistrement d'un exemplaire, sans écraser le premier rattachement", async () => {
    const { id, copy_id } = firstGame()
    const copy = (await (await send("GET", `/api/games/${id}`)).json()).copies[0]
    const res = await send("PUT", `/api/copies/${copy_id}`, { ...copy, barcode: "3307215913345", edition: "Platinum" })
    expect(res.status).toBe(200)
    const hit = await (await send("GET", "/api/barcodes/3307215913345")).json()
    expect(hit).toMatchObject({ known: true, edition: "Platinum", game: { id } })
    expect(hit.game.copies.length).toBeGreaterThan(0)
  })

  it("se rattache à la main, et se corrige", async () => {
    const games = db.prepare("SELECT id FROM games ORDER BY id LIMIT 2").all() as Array<{ id: number }>
    const linked = await (await send("POST", "/api/barcodes", { ean: "96385074", game_id: games[0].id, edition: "Standard" })).json()
    expect(linked).toMatchObject({ ean: "96385074", known: true, game: { id: games[0].id } })
    const fixed = await (await send("POST", "/api/barcodes", { ean: "96385074", game_id: games[1].id, edition: null })).json()
    expect(fixed).toMatchObject({ known: true, edition: null, game: { id: games[1].id } })
    expect((await send("POST", "/api/barcodes", { ean: "96385074", game_id: 999999 })).status).toBe(404)
  })

  it("se liste en entier pour la consultation hors ligne", async () => {
    const { codes } = await (await send("GET", "/api/barcodes")).json()
    expect(codes).toEqual(expect.arrayContaining([expect.objectContaining({ ean: "3307215913345", edition: "Platinum" }), expect.objectContaining({ ean: "96385074" })]))
  })

  it("se liste avec son jeu, s'exporte et s'oublie", async () => {
    const { rows } = await (await send("GET", "/api/barcodes?details=1")).json()
    const row = rows.find((r: { ean: string }) => r.ean === "3307215913345")
    expect(row).toMatchObject({ edition: "Platinum", on_copy: true })
    expect(row.title).toBeTruthy()
    // text() retire le BOM : on le vérifie sur les octets.
    const bytes = new Uint8Array(await (await send("GET", "/api/export-codes.csv")).arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const csv = new TextDecoder().decode(bytes)
    expect(csv.split("\r\n")[0]).toBe("code;jeu;console;edition;appris_le")
    expect(csv).toContain("3307215913345;")
    expect((await send("DELETE", "/api/barcodes/3307215913345")).status).toBe(200)
    expect((await (await send("GET", "/api/barcodes/3307215913345")).json()).known).toBe(false)
    expect(db.prepare("SELECT count(*) AS n FROM copies WHERE barcode = '3307215913345'").get()).toEqual({ n: 0 })
    expect((await send("DELETE", "/api/barcodes/3307215913345")).status).toBe(404)
  })

  it("disparaît avec son jeu", () => {
    const g = db.prepare("SELECT game_id FROM barcodes WHERE ean = '96385074'").get() as { game_id: number }
    db.prepare("DELETE FROM copies WHERE game_id = ?").run(g.game_id)
    db.prepare("DELETE FROM games WHERE id = ?").run(g.game_id)
    expect(db.prepare("SELECT 1 FROM barcodes WHERE ean = '96385074'").get()).toBeUndefined()
  })
})

describe("durcissement", () => {
  it("pose les en-têtes de sécurité, sans X-Powered-By", async () => {
    const res = await send("GET", "/api/health")
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'")
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self';")
    expect(res.headers.get("x-frame-options")).toBe("DENY")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("referrer-policy")).toBe("same-origin")
    expect(res.headers.get("permissions-policy")).toContain("camera=(self)")
    expect(res.headers.get("x-powered-by")).toBeNull()
    expect(res.headers.get("strict-transport-security")).toBe("max-age=31536000")
  })

  it("refuse une écriture venue d'une autre origine, ou sans origine", async () => {
    const body = { value: "Brocante de test" }
    expect((await send("POST", "/api/lists/place", body, "https://intrus.example")).status).toBe(403)
    expect((await send("POST", "/api/lists/place", body, null)).status).toBe(403)
    expect((await send("POST", "/api/lists/place", body)).status).toBe(201)
    // Les lectures ne sont pas concernées.
    expect((await send("GET", "/api/lists", undefined, null)).status).toBe(200)
  })
})
