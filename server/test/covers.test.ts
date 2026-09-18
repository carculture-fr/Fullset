import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { coverFileName, downloadMissingCovers, renameLegacyCovers } from "../src/covers.js"
import { openDb, type Db } from "../src/db.js"

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const fetchImpl = (async () => new Response(JPEG, { headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch

let dir: string
let db: Db

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-covers-name-"))
  db = openDb(dir)
})
afterAll(() => {
  db?.close()
  rmSync(dir, { recursive: true, force: true })
})

const fileOf = (id: number) => (db.prepare("SELECT cover_file FROM games WHERE id = ?").get(id) as { cover_file: string | null }).cover_file

describe("nom des jaquettes", () => {
  it("ne dépend jamais du seul id du jeu", async () => {
    const id = Number(
      db
        .prepare("INSERT INTO games (platform, title, cover_url) VALUES (?, ?, ?)")
        .run("PlayStation 2", "Burnout 3: Takedown", "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1.jpg").lastInsertRowid,
    )

    expect(await downloadMissingCovers(db, dir, fetchImpl)).toMatchObject({ downloaded: 1 })
    const file = fileOf(id)!
    expect(file).not.toBe(`${id}.jpg`)
    expect(file).toMatch(new RegExp(`^${id}-\\w+\\.jpg$`))
    expect(existsSync(path.join(dir, "covers", file))).toBe(true)
  })

  it("garde l'id en tête et l'extension demandée", () => {
    expect(coverFileName(12, ".png")).toMatch(/^12-\w+\.png$/)
  })
})

describe("jaquettes des versions d'avant", () => {
  it("renomme celles qui portent le seul id, une fois", () => {
    const id = Number(
      db.prepare("INSERT INTO games (platform, title, cover_file) VALUES (?, ?, ?)").run("Xbox 360", "Halo: Reach", "7.jpg").lastInsertRowid,
    )
    mkdirSync(path.join(dir, "covers"), { recursive: true })
    writeFileSync(path.join(dir, "covers", "7.jpg"), Buffer.from(JPEG))

    expect(renameLegacyCovers(db, dir)).toBe(1)
    const file = fileOf(id)!
    expect(file).toMatch(new RegExp(`^${id}-\\w+\\.jpg$`))
    expect(existsSync(path.join(dir, "covers", file))).toBe(true)
    // L'ancienne adresse ne répond plus : un navigateur qui l'a gardée ne peut plus la servir.
    expect(existsSync(path.join(dir, "covers", "7.jpg"))).toBe(false)
    expect(renameLegacyCovers(db, dir)).toBe(0)
  })

  it("laisse la base tranquille quand le fichier a disparu", () => {
    const id = Number(
      db.prepare("INSERT INTO games (platform, title, cover_file) VALUES (?, ?, ?)").run("Xbox 360", "F1 2011", "99.jpg").lastInsertRowid,
    )
    expect(renameLegacyCovers(db, dir)).toBe(0)
    expect(fileOf(id)).toBe("99.jpg")
  })
})
