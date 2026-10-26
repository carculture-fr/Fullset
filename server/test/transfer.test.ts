import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { openDb, type Db } from "../src/db.js"
import { CollectionNotEmptyError, importCollection } from "../src/import-collection.js"
import { listLibrary } from "../src/library.js"
import { stats, summary } from "../src/stats.js"
import { exportCsv, exportJson, importExport, parseCsv } from "../src/transfer.js"

const collection = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures/collection.json"), "utf8"))

const dirs: string[] = []
const freshDb = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "fullset-transfer-"))
  dirs.push(dir)
  return { dir, db: openDb(dir) }
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const imported = () => {
  const { db } = freshDb()
  importCollection(db, collection)
  return db
}

describe("export CSV", () => {
  it("est lisible par Excel en français", () => {
    const csv = exportCsv(imported())
    expect(csv.startsWith("﻿id_jeu;igdb_id;plateforme;titre;")).toBe(true)
    const rows = parseCsv(csv)
    expect(rows).toHaveLength(49)
    const header = rows[0]
    const nfs = rows.find((r) => r[header.indexOf("titre")] === "Need for Speed: Most Wanted")!
    expect(nfs[header.indexOf("prix")]).toBe("15,74")
    expect(nfs[header.indexOf("résumé")]).toMatch(/^Arrivé en ville avec une voiture de sport/)
  })

  it("réimporté dans une instance vide, redonne la même collection (critère 4)", () => {
    const source = imported()
    const csv = exportCsv(source)
    const { db: target } = freshDb()
    expect(importExport(target, csv)).toEqual({ games: 47, copies: 48, totalCents: 67248 })
    expect(exportCsv(target)).toBe(csv)
    expect(summary(target)).toEqual(summary(source))
    expect(listLibrary(target).map(({ cover, ...g }) => g)).toEqual(listLibrary(source).map(({ cover, ...g }) => g))
  })

  it("accepte aussi un CSV à virgules", () => {
    const { db } = freshDb()
    const csv = 'plateforme,titre,support,prix,commentaire\r\nPC,"Jeu, avec virgule",Dématérialisé,"4,99","dit ""génial"""\r\n'
    expect(importExport(db, csv)).toEqual({ games: 1, copies: 1, totalCents: 499 })
    expect(listLibrary(db)[0].title).toBe("Jeu, avec virgule")
  })

  // Audit du 14/09/2026 : un titre venu de l'extérieur ne doit pas s'exécuter dans Excel.
  it("neutralise les formules à l'export, et les relit à l'identique", () => {
    const source = imported()
    source.prepare(`UPDATE games SET title = '=HYPERLINK("http://x")' WHERE id = (SELECT min(id) FROM games)`).run()
    source.prepare("UPDATE copies SET comment = '-2 rayures' WHERE id = (SELECT min(id) FROM copies)").run()
    const csv = exportCsv(source)
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`)
    expect(csv).toContain(";'-2 rayures")
    const { db: target } = freshDb()
    importExport(target, csv)
    expect(exportCsv(target)).toBe(csv)
  })

  it("refuse un CSV étranger et un import dans une collection non vide", () => {
    const { db } = freshDb()
    expect(() => importExport(db, "Name;Platform\nHalo;Xbox\n")).toThrow(/pas un export Fullset/)
    const full = imported()
    expect(() => importExport(full, exportCsv(full))).toThrow(CollectionNotEmptyError)
  })
})

describe("export JSON", () => {
  it("fait l'aller-retour", () => {
    const source = imported()
    const json = exportJson(source)
    expect(json).toMatchObject({ format: "fullset", version: 1 })
    const { db: target } = freshDb()
    expect(importExport(target, JSON.stringify(json))).toEqual({ games: 47, copies: 48, totalCents: 67248 })
    expect(exportCsv(target)).toBe(exportCsv(source))
  })
})

describe("statistiques", () => {
  const db: Db = imported()
  const s = stats(db)

  it("retombe sur le total, quel que soit le découpage", () => {
    expect(s.spentCents).toBe(67248)
    expect(s.spentPhysicalCents + s.spentDigitalCents).toBe(67248)
    expect(s.byMonth.reduce((n, m) => n + m.spentCents, 0) + s.undated.spentCents).toBe(67248)
    expect(s.byPlace.reduce((n, p) => n + p.spentCents, 0)).toBe(67248)
    expect(s.byPlatform.reduce((n, p) => n + p.spentCents, 0)).toBe(67248)
  })

  it("donne des mois continus, sans trou", () => {
    const months = s.byMonth.map((m) => m.month)
    for (let i = 1; i < months.length; i++) {
      const [y, m] = months[i - 1].split("-").map(Number)
      expect(months[i]).toBe(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`)
    }
    expect(s.undated.count).toBe(4)
  })

  it("ne compte les états que sur les exemplaires physiques, dans l'ordre de la liste", () => {
    for (const b of [s.conditions.game, s.conditions.box, s.conditions.manual]) {
      expect(b.reduce((n, x) => n + x.count, 0)).toBe(24)
    }
    expect(s.conditions.game.map((x) => x.label)).toEqual(["Neuf", "Très bon", "Bon", "Moyen", "Mauvais", "Non renseigné"])
  })
})

describe("routes d'export et d'import", () => {
  it("télécharge les exports et importe collection.json dans une instance vide", async () => {
    const { dir, db } = freshDb()
    const server: Server = createApp(db, dir, { igdb: null, openAccess: true, fetchImpl: (async () => new Response("", { status: 404 })) as typeof fetch }).listen(0)
    await new Promise((r) => server.once("listening", r))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const form = new FormData()
    form.append("file", new Blob([JSON.stringify(collection)], { type: "application/json" }), "collection.json")
    const imp = await fetch(`${base}/api/import`, { method: "POST", body: form })
    expect(await imp.json()).toMatchObject({ games: 47, copies: 48, totalCents: 67248 })

    const csv = await fetch(`${base}/api/export.csv`)
    expect(csv.headers.get("content-type")).toMatch(/^text\/csv/)
    expect(csv.headers.get("content-disposition")).toMatch(/attachment; filename="fullset-\d{4}-\d{2}-\d{2}\.csv"/)
    expect((await csv.text()).split("\r\n")).toHaveLength(50)
    const json = await (await fetch(`${base}/api/export.json`)).json()
    expect(json.games).toHaveLength(47)
    expect((await (await fetch(`${base}/api/stats`)).json()).spentCents).toBe(67248)

    const again = await fetch(`${base}/api/import`, { method: "POST", body: form })
    expect(again.status).toBe(409)
    server.close()
  })
})
