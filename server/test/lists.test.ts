import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { openDb, type Db } from "../src/db.js"
import { importCollection } from "../src/import-collection.js"
import { ConflictError, addValue, deleteValue, listValues, renameValue } from "../src/lists.js"

const collection = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/collection.json"), "utf8"))

let dir: string
let db: Db
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-lists-"))
  db = openDb(dir)
  importCollection(db, collection)
})
afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const find = (list: "place" | "edition" | "tag", value: string) => listValues(db)[list].find((v) => v.value === value)
const countWhere = (sql: string, ...args: unknown[]) => (db.prepare(`SELECT count(*) AS n FROM copies WHERE ${sql}`).get(...args) as { n: number }).n

describe("listes de valeurs", () => {
  it("propose les éditions d'office et reprend les valeurs déjà saisies", () => {
    const lists = listValues(db)
    expect(lists.edition.length).toBeGreaterThanOrEqual(33)
    expect(lists.edition[0]).toMatchObject({ value: "Standard", count: 40 })
    for (const e of ["Platinum", "Essentials", "Classics", "Le Choix des Joueurs", "Game of the Year (GOTY)", "Collector", "Steelbook"]) {
      expect(lists.edition.some((v) => v.value === e)).toBe(true)
    }
    expect(find("place", "Vinted")).toMatchObject({ count: 7 })
    expect(lists.place[0].value).toBe("Steam")
  })

  it("renomme partout", () => {
    const id = find("place", "Leboncoin")!.id
    expect(renameValue(db, "place", id, "Leboncoin (annonces)")).toEqual({ merged: false })
    expect(countWhere("purchase_place = ?", "Leboncoin (annonces)")).toBe(4)
    expect(find("place", "Leboncoin")).toBeUndefined()
  })

  it("fusionne quand le nouveau nom existe déjà", () => {
    const id = find("place", "Dépôt-vente")!.id
    expect(renameValue(db, "place", id, "boutique d'occasion")).toEqual({ merged: true })
    expect(find("place", "Boutique d'occasion")).toMatchObject({ count: 9 })
    expect(find("place", "Dépôt-vente")).toBeUndefined()
  })

  it("ne supprime qu'une valeur inutilisée, sans la ressusciter ensuite", () => {
    expect(() => deleteValue(db, "place", find("place", "Vinted")!.id)).toThrow(ConflictError)
    deleteValue(db, "edition", find("edition", "Démo")!.id)
    expect(find("edition", "Démo")).toBeUndefined()
  })

  it("renomme un tag au milieu des autres, sans doublon", () => {
    db.prepare("UPDATE copies SET tags = 'Collector, Steelbook' WHERE id = 1").run()
    db.prepare("UPDATE copies SET tags = 'steelbook, Boîtier métal' WHERE id = 2").run()
    expect(find("tag", "Steelbook")).toMatchObject({ count: 2 })
    renameValue(db, "tag", find("tag", "Steelbook")!.id, "Boîtier métal")
    const tags = db.prepare("SELECT tags FROM copies WHERE id IN (1, 2) ORDER BY id").all()
    expect(tags).toEqual([{ tags: "Collector, Boîtier métal" }, { tags: "Boîtier métal" }])
  })

  it("ajoute sans doublon de casse, et refuse une virgule", () => {
    expect(addValue(db, "place", "vinted").value).toBe("Vinted")
    expect(addValue(db, "place", "Vide-grenier").value).toBe("Vide-grenier")
    expect(() => addValue(db, "tag", "a, b")).toThrow(/virgule/)
  })
})
