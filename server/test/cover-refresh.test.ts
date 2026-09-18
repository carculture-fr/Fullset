import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createCopy } from "../src/copies.js"
import { coverOneGame, refreshMissingCovers } from "../src/cover-refresh.js"
import { openDb, type Db } from "../src/db.js"
import type { IgdbClient } from "../src/igdb.js"
import { addPhoto, setCoverFromPhoto } from "../src/media.js"
import type { ScreenscraperClient } from "../src/screenscraper.js"

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const COVER = "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/bioshock.jpg"
const THUMB = "https://images.igdb.com/igdb/image/upload/t_cover_small_2x/burnout.jpg"

/** IGDB simulé : la fiche 20 propose une jaquette, la fiche 99 n'en a aucune. */
const igdb = {
  game: async (igdbId: number) => ({ covers: igdbId === 20 ? [{ label: "Europe", url: COVER }] : [], platforms: [] }),
  search: async () => [],
} as unknown as IgdbClient

/**
 * ScreenScraper simulé : il ne connaît que « Burnout Revenge », le jeu sans fiche IGDB. C'est lui
 * qui doit servir quand IGDB n'a rien — le scan prend la première source qui répond.
 */
const screenscraper = {
  search: async (titre: string) =>
    titre === "Burnout Revenge"
      ? [{ id: 42, systemId: 58, name: titre, system: "PS2", covers: [{ key: "58/42/box-2D(eu)", type: "box-2D", region: "eu", format: "png" }] }]
      : [],
  systemImages: async () => [],
  media: async () => ({ bytes: Buffer.from(JPEG), mime: "image/jpeg" }),
  systems: async () => new Map<string, number>(),
} as unknown as ScreenscraperClient

const sources = { igdb: () => igdb, screenscraper: () => screenscraper, steamgriddb: () => null }
/** Sans ScreenScraper : ce qu'IGDB ne connaît pas reste sans image. */
const igdbSeul = { igdb: () => igdb, screenscraper: () => null, steamgriddb: () => null }
const fetchImpl = (async () => new Response(JPEG, { headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch

let dir: string
let db: Db

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-covers-"))
  db = openDb(dir)
  const insert = db.prepare("INSERT INTO games (platform, title, igdb_id) VALUES (?, ?, ?)")
  insert.run("PC", "BioShock", 20)
  insert.run("PC", "Jeu sans jaquette chez IGDB", 99)
  insert.run("PC", "Jeu sans fiche IGDB", null)
  insert.run("PlayStation 2", "Burnout Revenge", null)
})
afterAll(() => {
  db?.close()
  rmSync(dir, { recursive: true, force: true })
})

const coverOf = (title: string) => (db.prepare("SELECT cover_file, cover_source, cover_url FROM games WHERE title = ?").get(title) as { cover_file: string | null; cover_source: string | null; cover_url: string | null })

describe("scan des jaquettes", () => {
  it("sans ScreenScraper, seuls les jeux qu'IGDB connaît reçoivent leur jaquette", async () => {
    const report = await refreshMissingCovers(db, dir, igdbSeul, fetchImpl)
    expect(report).toMatchObject({ looked: 4, downloaded: 1, remaining: 3 })

    const bioshock = coverOf("BioShock")
    expect(bioshock.cover_source).toBe("igdb")
    expect(existsSync(path.join(dir, "covers", bioshock.cover_file!))).toBe(true)
    // Les trois autres restent sans image, et le rapport dit pourquoi.
    expect(coverOf("Burnout Revenge").cover_file).toBeNull()
    expect(report.failed).toHaveLength(3)
  })

  it("avec ScreenScraper, un jeu sans fiche IGDB reçoit la sienne", async () => {
    const report = await refreshMissingCovers(db, dir, sources, fetchImpl)
    expect(report).toMatchObject({ looked: 3, downloaded: 1 })

    const burnout = coverOf("Burnout Revenge")
    expect(burnout.cover_source).toBe("screenscraper")
    expect(existsSync(path.join(dir, "covers", burnout.cover_file!))).toBe(true)
    // Une image venue d'un repère n'a pas d'adresse à retenir.
    expect(burnout.cover_url).toBeNull()
  })

  it("laisse tranquille ce qu'aucune source ne connaît", async () => {
    const report = await refreshMissingCovers(db, dir, sources, fetchImpl)
    expect(report).toMatchObject({ looked: 2, downloaded: 0, remaining: 2 })
    expect(report.failed.every((f) => f.includes("aucune source"))).toBe(true)
    expect(coverOf("Jeu sans fiche IGDB").cover_file).toBeNull()
  })

  it("pose la jaquette d'un seul jeu, à l'ajout", async () => {
    const id = Number(db.prepare("INSERT INTO games (platform, title, igdb_id) VALUES (?, ?, ?)").run("PlayStation 2", "Burnout Revenge", null).lastInsertRowid)
    const jeu = { id, igdb_id: null, platform: "PlayStation 2", title: "Burnout Revenge" }
    expect(await coverOneGame(db, dir, sources, jeu, fetchImpl)).toMatch(/^\/covers\//)
    expect(await coverOneGame(db, dir, sources, { ...jeu, title: "Jeu que personne ne connaît" }, fetchImpl)).toBeNull()
  })
})

describe("photo d'exemplaire en jaquette", () => {
  it("copie la photo choisie comme jaquette, sans la retirer des photos", () => {
    const gameId = (db.prepare("SELECT id FROM games WHERE title = ?").get("Jeu sans fiche IGDB") as { id: number }).id
    const copyId = createCopy(db, gameId, { support: "Physique" })
    const photo = addPhoto(db, dir, copyId, Buffer.from(JPEG), "image/jpeg")

    const { cover } = setCoverFromPhoto(db, dir, photo.id)
    expect(cover).toMatch(/^\/covers\//)
    const game = coverOf("Jeu sans fiche IGDB")
    expect(game.cover_source).toBe("photo")
    expect(existsSync(path.join(dir, "covers", game.cover_file!))).toBe(true)
    // La photo d'origine reste sur l'exemplaire.
    expect(existsSync(path.join(dir, "photos", photo.url.replace("/photos/", "")))).toBe(true)
    expect(db.prepare("SELECT count(*) AS n FROM copy_photos WHERE copy_id = ?").get(copyId)).toMatchObject({ n: 1 })
  })

  it("refuse une photo inconnue", () => {
    expect(() => setCoverFromPhoto(db, dir, 9999)).toThrow()
  })
})
