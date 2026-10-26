import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { canonicalPlatform } from "../src/catalog.js"
import { downloadMissingCovers } from "../src/covers.js"
import { openDb, type Db } from "../src/db.js"
import { UNDEFINED, isoDate, listValue, text, toCents } from "../src/domain.js"
import { CollectionNotEmptyError, importCollection, type CollectionEntry } from "../src/import-collection.js"
import { summary } from "../src/stats.js"

const entries: CollectionEntry[] = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "fixtures/collection.json"), "utf8"),
)

let dir: string
let db: Db

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-import-"))
  db = openDb(dir)
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

type CopyRow = Record<string, unknown> & { title: string; platform: string; igdb_id: number | null }
const copies = () =>
  db
    .prepare("SELECT c.*, g.title, g.platform, g.igdb_id FROM copies c JOIN games g ON g.id = c.game_id ORDER BY c.id")
    .all() as CopyRow[]

describe("import de collection.json", () => {
  it("donne les chiffres témoins : 48 exemplaires, 47 jeux, 672,48 €", () => {
    const r = importCollection(db, entries)
    expect(r).toMatchObject({ copies: 48, games: 47, totalCents: 67248 })
    expect(summary(db)).toMatchObject({ copies: 48, games: 47, physical: 24, digital: 24, spentCents: 67248 })
  })

  it("ne perd aucun champ de l'exemplaire", () => {
    importCollection(db, entries)
    const rows = copies()
    expect(rows).toHaveLength(entries.length)
    entries.forEach((e, i) => {
      const c = rows[i]
      const digital = e.support === "Dématérialisé"
      expect(c.title_as_entered).toBe(text(e.nom))
      // Le nom de la console suit le catalogue (RomM) : « GameCube » devient « Nintendo GameCube ».
      expect(c.platform).toBe(canonicalPlatform(String(e.plateforme)))
      expect(c.support).toBe(e.support)
      expect(c.price_cents).toBe(toCents(e.prix_achat))
      expect(c.purchase_date).toBe(isoDate(e.date_achat))
      expect(c.purchase_place).toBe(text(e.lieu_achat))
      expect(c.comment).toBe(text(e.note_perso))
      expect(c.region).toBe(text(e["Région"]))
      expect(c.edition).toBe(text(e["Édition"]))
      expect(c.play_status).toBe(text(e.Statut))
      expect(c.goal).toBe(text(e.Objectif))
      expect(c.content).toBe(listValue(e.Contenu) ?? UNDEFINED)
      expect(c.condition_game).toBe(digital ? null : listValue(e["État du jeu"]))
      expect(c.condition_box).toBe(digital ? null : listValue(e["État de la boîte"]))
      expect(c.condition_manual).toBe(digital ? null : listValue(e["État de la notice"]))
    })
  })

  it("conserve les trois états distincts d'un exemplaire", () => {
    importCollection(db, entries)
    const nfs = copies().find((c) => c.title_as_entered === "Need for Speed: Most Wanted")!
    expect([nfs.condition_game, nfs.condition_box, nfs.condition_manual]).toEqual(["Bon", "Bon", "Très bon"])
  })

  it("reprend les métadonnées du jeu", () => {
    importCollection(db, entries)
    const g = db.prepare("SELECT * FROM games WHERE title = 'Need for Speed: Most Wanted'").get() as Record<string, unknown>
    expect(g).toMatchObject({
      igdb_id: 243048,
      platform: "Nintendo GameCube",
      developer: "EA Redwood Shores, EA Black Box",
      publisher: "Electronic Arts",
      release_date: "2005-11-25",
      igdb_rating: 81,
      cover_source: "igdb",
    })
    expect(String(g.summary)).toMatch(/^Arrivé en ville avec une voiture de sport/)
  })

  it("regroupe deux exemplaires du même jeu, sépare deux plateformes", () => {
    importCollection(db, entries)
    const portal = copies().filter((c) => c.igdb_id === 72)
    expect(portal).toHaveLength(2)
    expect(new Set(portal.map((c) => c.game_id)).size).toBe(1)
    const borderlands = db.prepare("SELECT platform FROM games WHERE igdb_id = 1011 ORDER BY platform").all()
    expect(borderlands).toEqual([{ platform: "PC" }, { platform: "PlayStation 3" }])
  })

  it("signale les jeux sans identifiant IGDB et ne devine pas le contenu vide", () => {
    const r = importCollection(db, entries)
    expect(r.toMatch).toEqual(["Burnout 3: Takedown (PlayStation 2)", "Resistance: Fall of Man (PlayStation 3)"])
    const undefinedContent = copies().filter((c) => c.support === "Physique" && c.content === UNDEFINED)
    expect(undefinedContent.map((c) => c.title_as_entered).sort()).toEqual([
      "Assassin's Creed",
      "Borderlands 2",
      "Halo 3",
    ])
  })

  it("refuse un second import", () => {
    importCollection(db, entries)
    expect(() => importCollection(db, entries)).toThrow(CollectionNotEmptyError)
    expect(copies()).toHaveLength(48)
  })
})

describe("jaquettes", () => {
  it("télécharge les jaquettes manquantes et note les échecs", async () => {
    importCollection(db, entries)
    let calls = 0
    const fakeFetch = (async () => {
      calls++
      return calls === 1 ? new Response("erreur", { status: 404 }) : new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { "Content-Type": "image/jpeg" } })
    }) as typeof fetch

    const r = await downloadMissingCovers(db, dir, fakeFetch)
    expect(r.downloaded + r.failed.length).toBe(33)
    expect(r.failed).toHaveLength(1)
    const withFile = db.prepare("SELECT id, cover_file FROM games WHERE cover_file IS NOT NULL").all() as Array<{ cover_file: string }>
    expect(withFile).toHaveLength(32)
    expect(existsSync(path.join(dir, "covers", withFile[0].cover_file))).toBe(true)

    const retry = await downloadMissingCovers(db, dir, fakeFetch)
    expect(retry).toEqual({ downloaded: 1, failed: [] })
  })

  it("ne télécharge qu'une image IGDB : ni adresse interne, ni page HTML déguisée", async () => {
    importCollection(db, entries)
    const [a, b] = db.prepare("SELECT id FROM games WHERE cover_url IS NOT NULL ORDER BY id LIMIT 2").all() as Array<{ id: number }>
    db.prepare("UPDATE games SET cover_url = 'http://169.254.169.254/latest/meta-data/x.html' WHERE id = ?").run(a.id)
    db.prepare("UPDATE games SET cover_url = cover_url || '.html' WHERE id = ?").run(b.id)
    const asked: string[] = []
    const fakeFetch = (async (url: string) => {
      asked.push(url)
      return url.endsWith(".html") ? new Response("<script>alert(1)</script>", { headers: { "Content-Type": "text/html" } }) : new Response(new Uint8Array([0xff, 0xd8]), { headers: { "Content-Type": "image/jpeg" } })
    }) as unknown as typeof fetch

    const r = await downloadMissingCovers(db, dir, fakeFetch)
    expect(asked.some((u) => u.includes("169.254"))).toBe(false)
    expect(r.failed).toHaveLength(2)
    expect(db.prepare("SELECT count(*) AS n FROM games WHERE cover_file LIKE '%.html'").get()).toEqual({ n: 0 })
    expect(db.prepare("SELECT cover_file FROM games WHERE id IN (?, ?)").all(a.id, b.id)).toEqual([{ cover_file: null }, { cover_file: null }])
  })
})
