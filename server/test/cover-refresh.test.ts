import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createCopy } from "../src/copies.js"
import { refreshMissingCovers } from "../src/cover-refresh.js"
import { openDb, type Db } from "../src/db.js"
import type { IgdbClient } from "../src/igdb.js"
import { addPhoto, setCoverFromPhoto } from "../src/media.js"

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const COVER = "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/bioshock.jpg"
const THUMB = "https://images.igdb.com/igdb/image/upload/t_cover_small_2x/burnout.jpg"

/**
 * IGDB simulé : la fiche 20 a une jaquette, la fiche 99 n'en a pas, et la recherche par titre
 * ne connaît que « Burnout Revenge » sur PlayStation 2 (avec un homonyme sur une autre console,
 * qui ne doit pas être retenu).
 */
const igdb = {
  game: async (igdbId: number) => ({ cover_url: igdbId === 20 ? COVER : null, covers: [], platforms: [] }),
  search: async (q: string) =>
    q === "Burnout Revenge"
      ? [
          { igdb_id: 7, name: "Burnout Revenge", original_name: null, year: 2005, platforms: ["Xbox"], cover: THUMB },
          { igdb_id: 8, name: "Burnout Revenge", original_name: null, year: 2005, platforms: ["PlayStation 2"], cover: THUMB },
        ]
      : [],
} as unknown as IgdbClient
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

describe("rattrapage des jaquettes", () => {
  it("va chercher chez IGDB la jaquette des jeux qui n'en ont pas", async () => {
    const report = await refreshMissingCovers(db, dir, igdb, fetchImpl)
    expect(report).toMatchObject({ looked: 4, downloaded: 2 })

    const bioshock = coverOf("BioShock")
    expect(bioshock.cover_source).toBe("igdb")
    expect(existsSync(path.join(dir, "covers", bioshock.cover_file!))).toBe(true)
  })

  it("sans fiche IGDB, retient le titre identique sur la bonne console, en grande taille", () => {
    const burnout = coverOf("Burnout Revenge")
    expect(burnout.cover_file).not.toBeNull()
    // La recherche rend une vignette : la jaquette enregistrée est la grande.
    expect(burnout.cover_url).toContain("t_cover_big_2x")
  })

  it("laisse tranquille ce qu'IGDB ne reconnaît pas", async () => {
    expect(coverOf("Jeu sans fiche IGDB").cover_file).toBeNull()
    const report = await refreshMissingCovers(db, dir, igdb, fetchImpl)
    expect(report).toMatchObject({ looked: 2, downloaded: 0, remaining: 2 })
    expect(report.failed.some((f) => f.includes("aucune fiche IGDB au même titre"))).toBe(true)
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
