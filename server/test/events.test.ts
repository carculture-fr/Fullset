import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createCopy } from "../src/copies.js"
import { openDb, type Db } from "../src/db.js"
import { addEvent, addHardwareEvent, currentExits, deleteEvent, exitStats, journal } from "../src/events.js"
import { createHardware, getHardware, hardwareStats, listHardware } from "../src/hardware.js"
import { getGame, listLibrary } from "../src/library.js"
import { stats, summary } from "../src/stats.js"

let dir: string
let db: Db
let gameId: number
let copyId: number

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-events-"))
  db = openDb(dir)
  gameId = Number(db.prepare("INSERT INTO games (platform, title) VALUES (?, ?)").run("PlayStation 2", "Burnout 3: Takedown").lastInsertRowid)
  copyId = createCopy(db, gameId, { support: "Physique", price: "12,00", purchase_date: "2026-01-10" })
})
afterAll(() => {
  db?.close()
  rmSync(dir, { recursive: true, force: true })
})

describe("vie d'un exemplaire", () => {
  it("une vente le sort de la bibliothèque sans effacer son histoire", () => {
    expect(listLibrary(db)[0].copies).toHaveLength(1)
    addEvent(db, copyId, { kind: "Vendu", happened_on: "2026-03-02", amount: "20,00", person: "Léa", comment: "Vendu sur Vinted" })

    // Plus aucun exemplaire possédé : le jeu quitte la bibliothèque, mais sa fiche reste.
    expect(listLibrary(db)).toHaveLength(0)
    const game = getGame(db, gameId)!
    expect(game.copies).toHaveLength(1)
    expect(game.copies[0]).toMatchObject({ status: "Vendu", left_on: "2026-03-02" })
    expect(game.copies[0].events[0]).toMatchObject({ kind: "Vendu", amount_cents: 2000, person: "Léa" })
  })

  it("ne compte plus l'exemplaire sorti dans les totaux, mais suit ce qu'il a rapporté", () => {
    expect(summary(db)).toMatchObject({ copies: 0, spentCents: 0 })
    const s = stats(db)
    expect(s.exits).toMatchObject({ count: 1, soldCents: 2000, costOfSoldCents: 1200 })
    expect(s.exits.byKind).toEqual([{ label: "Vendu", count: 1, amountCents: 2000 }])
  })

  it("le journal raconte ce qui est arrivé, jeu par jeu", () => {
    const entries = journal(db)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: "Vendu", title: "Burnout 3: Takedown", platform: "PlayStation 2", price_cents: 1200 })
  })

  it("un prêt sort l'exemplaire, un retour le fait revenir", () => {
    const back = createCopy(db, gameId, { support: "Physique", price: "9,00" })
    addEvent(db, back, { kind: "Prêté", happened_on: "2026-04-01", person: "Sam" })
    expect(listLibrary(db)).toHaveLength(0)

    addEvent(db, back, { kind: "Retour", happened_on: "2026-05-01" })
    expect(listLibrary(db)[0].copies).toHaveLength(1)
    expect(getGame(db, gameId)!.copies.find((c) => c.id === back)).toMatchObject({ status: null, left_on: null })
  })

  it("supprimer le dernier événement rend l'exemplaire à la collection", () => {
    const sold = getGame(db, gameId)!.copies.find((c) => c.status === "Vendu")!
    deleteEvent(db, sold.events[0].id)
    expect(getGame(db, gameId)!.copies.find((c) => c.id === sold.id)).toMatchObject({ status: null })
    expect(exitStats(db).count).toBe(0)
  })

  it("vaut aussi pour le matériel : une console vendue quitte la liste et les totaux", () => {
    const hwId = createHardware(db, { kind: "Console", platform: "PlayStation 2", price: "45,00" })
    expect(listHardware(db)).toHaveLength(1)
    expect(hardwareStats(db)).toMatchObject({ count: 1, spentCents: 4500 })

    addHardwareEvent(db, hwId, { kind: "Vendu", happened_on: "2026-06-01", amount: "60,00", person: "Chris" })
    expect(listHardware(db)).toHaveLength(0)
    expect(hardwareStats(db)).toMatchObject({ count: 0, spentCents: 0 })
    // La fiche reste, avec son histoire.
    expect(getHardware(db, hwId)).toMatchObject({ status: "Vendu", left_on: "2026-06-01" })
    expect(journal(db).some((e) => e.hardware_id === hwId && e.kind === "Vendu")).toBe(true)

    addHardwareEvent(db, hwId, { kind: "Retour", happened_on: "2026-06-20" })
    expect(listHardware(db)).toHaveLength(1)
  })

  it("liste ce qui est sorti et n'est pas revenu : les prêts rendus n'y sont plus", () => {
    const copyId = createCopy(db, gameId, { support: "Physique", price: "5,00" })
    addEvent(db, copyId, { kind: "Prêté", happened_on: "2026-07-01", person: "Alex" })
    expect(currentExits(db).filter((e) => e.kind === "Prêté").map((e) => e.person)).toContain("Alex")

    addEvent(db, copyId, { kind: "Retour", happened_on: "2026-07-20" })
    expect(currentExits(db).some((e) => e.person === "Alex")).toBe(false)
  })

  it("refuse un motif inconnu et une date impossible", () => {
    expect(() => addEvent(db, copyId, { kind: "Mangé par le chien" })).toThrow()
    expect(() => addEvent(db, copyId, { kind: "Vendu", happened_on: "pas une date" })).toThrow()
  })
})
