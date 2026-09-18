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

// IGDB simulé : la fiche 20 a une jaquette, la fiche 99 n'en a pas.
const igdb = {
  game: async (igdbId: number) => ({ cover_url: igdbId === 20 ? COVER : null, covers: [], platforms: [] }),
  search: async () => [],
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
})
afterAll(() => {
  db?.close()
  rmSync(dir, { recursive: true, force: true })
})

describe("rattrapage des jaquettes", () => {
  it("va chercher chez IGDB la jaquette d'un jeu qui n'en a pas, et laisse les autres tranquilles", async () => {
    const report = await refreshMissingCovers(db, dir, igdb, fetchImpl)
    // Le jeu sans fiche IGDB n'est pas examiné : rien à demander pour lui.
    expect(report).toMatchObject({ looked: 2, downloaded: 1, remaining: 1 })
    expect(report.failed[0]).toContain("IGDB n'a pas de jaquette")

    const bioshock = db.prepare("SELECT cover_file, cover_source FROM games WHERE title = ?").get("BioShock") as { cover_file: string | null; cover_source: string | null }
    expect(bioshock.cover_source).toBe("igdb")
    expect(existsSync(path.join(dir, "covers", bioshock.cover_file!))).toBe(true)

    const sansFiche = db.prepare("SELECT cover_file FROM games WHERE title = ?").get("Jeu sans fiche IGDB") as { cover_file: string | null }
    expect(sansFiche.cover_file).toBeNull()
  })

  it("ne redemande pas une jaquette déjà posée", async () => {
    expect(await refreshMissingCovers(db, dir, igdb, fetchImpl)).toMatchObject({ looked: 1, downloaded: 0 })
  })
})

describe("photo d'exemplaire en jaquette", () => {
  it("copie la photo choisie comme jaquette, sans la retirer des photos", () => {
    const gameId = (db.prepare("SELECT id FROM games WHERE title = ?").get("Jeu sans fiche IGDB") as { id: number }).id
    const copyId = createCopy(db, gameId, { support: "Physique" })
    const photo = addPhoto(db, dir, copyId, Buffer.from(JPEG), "image/jpeg")

    const { cover } = setCoverFromPhoto(db, dir, photo.id)
    expect(cover).toMatch(/^\/covers\//)
    const game = db.prepare("SELECT cover_file, cover_source FROM games WHERE id = ?").get(gameId) as { cover_file: string; cover_source: string }
    expect(game.cover_source).toBe("photo")
    expect(existsSync(path.join(dir, "covers", game.cover_file))).toBe(true)
    // La photo d'origine reste sur l'exemplaire.
    expect(existsSync(path.join(dir, "photos", photo.url.replace("/photos/", "")))).toBe(true)
    expect(db.prepare("SELECT count(*) AS n FROM copy_photos WHERE copy_id = ?").get(copyId)).toMatchObject({ n: 1 })
  })

  it("refuse une photo inconnue", () => {
    expect(() => setCoverFromPhoto(db, dir, 9999)).toThrow()
  })
})
