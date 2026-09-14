import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { openDb } from "../src/db.js"
import type { IgdbCandidate, IgdbClient, IgdbGame } from "../src/igdb.js"
import { importCollection } from "../src/import-collection.js"
import { analyzeLegacy, commitLegacy, parseLegacyCsv } from "../src/legacy.js"
import { listLibrary } from "../src/library.js"
import { stats } from "../src/stats.js"

const fixture = (f: string) => readFileSync(path.join(import.meta.dirname, "fixtures", f), "utf8")
const legacyCsv = fixture("export-origine.csv")
const collection = JSON.parse(fixture("collection.json"))

const candidate = (igdb_id: number, name: string, platforms: string[], original_name: string | null = null): IgdbCandidate => ({
  igdb_id,
  name,
  original_name,
  year: 2011,
  platforms,
  cover: null,
})

const makeIgdb = () => {
  const searched: string[] = []
  const client: IgdbClient = {
    search: async (q) => {
      searched.push(q)
      if (q.includes("MW3")) return [candidate(979, "Call of Duty: Modern Warfare 3", ["PC", "Xbox 360"])]
      if (q === "Halo 3") return [candidate(989, "Halo 3: ODST", ["Xbox 360"]), candidate(987, "Halo 3", ["Xbox 360"])]
      if (q === "FIFA Soccer 2005") return [candidate(240278, "FIFA Football 2005", ["PSP"], "FIFA Soccer 2005"), candidate(703, "FIFA Football 2005", ["PlayStation 2"], "FIFA Soccer 2005")]
      return []
    },
    game: async (id, platform) =>
      ({
        igdb_id: id, title: `Jeu ${id}`, summary: null, developer: null, publisher: null, release_date: null, genres: null, game_modes: null,
        perspective: null, series: null, pegi: null, igdb_rating: null, igdb_url: null, cover_url: null, platforms: [platform ?? ""], covers: [],
      }) satisfies IgdbGame,
  }
  return { client, searched }
}

const dirs: string[] = []
const fresh = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "fullset-legacy-"))
  dirs.push(dir)
  return { dir, db: openDb(dir) }
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe("lecture de l'export de l'ancienne application", () => {
  const rows = parseLegacyCsv(legacyCsv)

  it("lit les 46 lignes et traduit toutes les valeurs, sans rien laisser de côté", () => {
    expect(rows).toHaveLength(46)
    expect(rows.flatMap((r) => r.warnings)).toEqual([])
    expect(rows[0]).toMatchObject({
      title: "Borderlands 2",
      platform: "PlayStation 3",
      copy: {
        support: "Physique", content: "Non défini", condition_game: "Très bon", condition_box: "Très bon", condition_manual: "Très bon",
        play_status: "Pas commencé", goal: "À garder", region: "PAL (Europe)", price: "6.49", purchase_date: "2026-02-21",
        purchase_place: "Boutique d'occasion", tags: null, barcode: null, comment: null, play_time_hours: null, rating: null,
      },
      estimatedCents: null,
    })
  })

  it("reconnaît un jeu Steam : PC, dématérialisé, sans état", () => {
    const steam = rows.find((r) => r.copy.purchase_place === "Steam")!
    expect(steam.platform).toBe("PC")
    expect(steam.copy).toMatchObject({ support: "Dématérialisé", content: "Dématérialisé", condition_game: null, condition_box: null, condition_manual: null })
  })

  it("accepte les colonnes françaises et reporte une valeur inconnue dans le commentaire", () => {
    const csv = "Nom;Plateforme;Statut;Contenu;Support;État (Jeu);État (Élément + Manuel);Prix d'achat;Prix estimé;Date d'acquisition;Lieu d'acquisition;Commentaire\n" +
      "Halo 3;Xbox 360;Non commencé;Élément + Boîte;Disque optique;Rayé;absente;4,99;12;03/04/2026;Vinted;Boîte fendue\n"
    const [r] = parseLegacyCsv(csv)
    expect(r.copy).toMatchObject({ content: "Jeu + boîte", support: "Physique", condition_game: null, condition_manual: "Absente", price: "4,99", purchase_date: "2026-04-03" })
    expect(r.copy.comment).toBe("Boîte fendue · État du jeu d'origine : Rayé")
    expect(r.estimatedCents).toBe(1200)
  })

  it("refuse un CSV qui n'est pas celui de l'ancienne application", () => {
    expect(() => parseLegacyCsv("titre_x;y\n1;2\n")).toThrow(/ancienne application/)
  })
})

describe("analyse", () => {
  it("reconnaît les 46 lignes déjà dans la collection sans interroger IGDB", async () => {
    const { db } = fresh()
    importCollection(db, collection)
    const { client, searched } = makeIgdb()
    const rows = await analyzeLegacy(db, client, legacyCsv)
    expect(rows.every((r) => r.status === "duplicate")).toBe(true)
    expect(new Set(rows.map((r) => r.duplicate!.copyId)).size).toBe(46)
    expect(searched).toEqual([])
  })

  it("propose un jeu IGDB, sûr seulement sur titre exact et bonne plateforme", async () => {
    const { db } = fresh()
    const { client } = makeIgdb()
    const csv = "Name,Platform,Support,Purchasing price\nCall of Duty: MW3,Xbox 360,Optical disc,0\nHalo 3,Xbox 360,Optical disc,5\nFIFA Soccer 2005,PlayStation 2,Optical disc,1\nJeu obscur,PlayStation 2,Optical disc,1\n"
    const rows = await analyzeLegacy(db, client, csv)
    expect(rows.map((r) => [r.status, r.proposed])).toEqual([
      ["check", 979],
      ["sure", 987],
      ["sure", 703],
      ["none", null],
    ])
  })
})

describe("import", () => {
  it("crée jeux, exemplaires et estimations, et réutilise un jeu existant", async () => {
    const { dir, db } = fresh()
    const { client } = makeIgdb()
    const copy = parseLegacyCsv(
      "Name,Platform,Support,Content,Purchasing price,Estimated price,Acquisition date\nCall of Duty: MW3,Xbox 360,Optical disc,Full,3.5,10,2026-05-01\n",
    )[0].copy
    const report = await commitLegacy(db, dir, client, [
      { title: "Call of Duty: MW3", platform: "Xbox 360", copy, estimatedCents: 1000, igdb_id: 979 },
      { title: "Call of Duty: MW3", platform: "Xbox 360", copy, estimatedCents: null, igdb_id: 979 },
      { title: "Jeu obscur", platform: "PlayStation 2", copy, estimatedCents: null, igdb_id: null },
    ])
    expect(report).toEqual({ copies: 3, gamesCreated: 2, valuations: 1 })
    const games = listLibrary(db)
    expect(games.map((g) => [g.title, g.copies.length])).toEqual([
      ["Jeu 979", 2],
      ["Jeu obscur", 1],
    ])
    expect(games[0].copies[0]).toMatchObject({ title_as_entered: "Call of Duty: MW3", price_cents: 350, content: "Complet (jeu + boîte + notice)", value_cents: 1000 })
    expect(stats(db).spentCents).toBe(1050)
  })

  it("valide tout avant d'écrire quoi que ce soit", async () => {
    const { dir, db } = fresh()
    const { client } = makeIgdb()
    await expect(
      commitLegacy(db, dir, client, [
        { title: "Bon", platform: "PC", copy: { support: "Dématérialisé", price: "1" }, estimatedCents: null, igdb_id: null },
        { title: "Mauvais", platform: "PC", copy: { support: "Physique", price: "douze" }, estimatedCents: null, igdb_id: null },
      ]),
    ).rejects.toThrow(/Ligne 2 \(Mauvais\)/)
    expect(listLibrary(db)).toEqual([])
  })

  it("passe par l'API : analyse d'un fichier puis import des lignes retenues", async () => {
    const { dir, db } = fresh()
    const { client } = makeIgdb()
    const server: Server = createApp(db, dir, { igdb: client, romm: null, openAccess: true }).listen(0)
    await new Promise((r) => server.once("listening", r))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const form = new FormData()
    form.append("file", new Blob(["Name,Platform,Support,Purchasing price\nHalo 3,Xbox 360,Optical disc,5\n"], { type: "text/csv" }), "export.csv")
    const analysis = await (await fetch(`${base}/api/import/legacy/analyze`, { method: "POST", body: form })).json()
    expect(analysis.rows[0]).toMatchObject({ status: "sure", proposed: 987 })
    const r = analysis.rows[0]
    const res = await fetch(`${base}/api/import/legacy/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [{ title: r.title, platform: r.platform, copy: r.copy, estimatedCents: r.estimatedCents, igdb_id: r.proposed }] }),
    })
    expect(await res.json()).toEqual({ copies: 1, gamesCreated: 1, valuations: 0 })
    server.close()
  })
})
