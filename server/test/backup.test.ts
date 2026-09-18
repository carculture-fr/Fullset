import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { buildBackup, restoreBackup } from "../src/backup.js"
import { createCopy } from "../src/copies.js"
import { openDb, type Db } from "../src/db.js"
import { addEvent } from "../src/events.js"
import { createHardware } from "../src/hardware.js"
import { summary } from "../src/stats.js"
import { unzipStore, zipStore } from "../src/zip.js"

let dir: string
let db: Db
let target: string
let targetDb: Db

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-backup-"))
  db = openDb(dir)
  const gameId = Number(db.prepare("INSERT INTO games (platform, title, cover_file) VALUES (?, ?, ?)").run("PlayStation 2", "Burnout 3: Takedown", "1-abc.jpg").lastInsertRowid)
  const copyId = createCopy(db, gameId, { support: "Physique", price: "12,00", purchase_date: "2026-01-10" })
  addEvent(db, copyId, { kind: "Prêté", happened_on: "2026-02-02", person: "Alex" })
  createHardware(db, { kind: "Console", platform: "PlayStation 2", price: "45,00" })
  mkdirSync(path.join(dir, "covers"), { recursive: true })
  mkdirSync(path.join(dir, "photos"), { recursive: true })
  writeFileSync(path.join(dir, "covers", "1-abc.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0]))
  writeFileSync(path.join(dir, "photos", "1-photo.jpg"), Buffer.from("photo"))

  target = mkdtempSync(path.join(tmpdir(), "fullset-restore-"))
  targetDb = openDb(target)
})
afterAll(() => {
  db?.close()
  targetDb?.close()
  rmSync(dir, { recursive: true, force: true })
  rmSync(target, { recursive: true, force: true })
})

describe("sauvegarde complète", () => {
  it("emporte les données et les images, et les remet en place ailleurs", () => {
    const archive = buildBackup(db, dir)
    const files = unzipStore(archive)
    expect(files.has("fullset.json")).toBe(true)
    expect(files.has("covers/1-abc.jpg")).toBe(true)
    expect(files.has("photos/1-photo.jpg")).toBe(true)

    const report = restoreBackup(targetDb, target, archive)
    expect(report).toMatchObject({ games: 1, copies: 1, images: 2 })
    expect(existsSync(path.join(target, "covers", "1-abc.jpg"))).toBe(true)
    expect(existsSync(path.join(target, "photos", "1-photo.jpg"))).toBe(true)

    // Le prêt est parti avec : l'exemplaire est toujours sorti après restauration.
    const copy = targetDb.prepare("SELECT status FROM copies").get() as { status: string | null }
    expect(copy.status).toBe("Prêté")
    expect(targetDb.prepare("SELECT count(*) AS n FROM copy_events").get()).toMatchObject({ n: 1 })
    expect(targetDb.prepare("SELECT count(*) AS n FROM hardware").get()).toMatchObject({ n: 1 })
  })

  it("remplace ce qui existait au lieu de refuser", () => {
    // Deuxième restauration sur une base déjà remplie : elle repart proprement, sans doublon.
    const report = restoreBackup(targetDb, target, buildBackup(db, dir))
    expect(report).toMatchObject({ games: 1, copies: 1 })
    expect(targetDb.prepare("SELECT count(*) AS n FROM games").get()).toMatchObject({ n: 1 })
    // Le seul exemplaire est prêté, donc sorti : les totaux de la collection sont à zéro.
    expect(summary(targetDb)).toMatchObject({ games: 0, copies: 0 })
  })

  it("refuse une archive qui n'est pas une sauvegarde Fullset", () => {
    const archive = zipStore([{ name: "covers/1-abc.jpg", data: Buffer.from([0xff, 0xd8]) }])
    expect(() => restoreBackup(targetDb, target, archive)).toThrow()
  })
})
