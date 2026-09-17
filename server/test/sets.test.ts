import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { openDb, type Db } from "../src/db.js"
import { parseSourcePage, sourceList, type SourceItem } from "../src/fullsetnet.js"
import type { IgdbClient } from "../src/igdb.js"
import { getSet, linkSetCovers, listSets, normTitle, saveSet } from "../src/sets.js"

const page = readFileSync(path.join(import.meta.dirname, "fixtures/fullsetnet-psvita.html"), "utf8")
const vita = sourceList("psvita_eu")!

let dir: string
let db: Db
let server: Server
let base: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-sets-"))
  db = openDb(dir)
  // La source n'est jamais appelée pour de vrai : le test sert la page d'exemple.
  const fetchImpl = (async (url: string) =>
    String(url).includes("/collection/psvita_eu.html")
      ? new Response(page, { headers: { "Content-Type": "text/html" } })
      : new Response("nope", { status: 404 })) as unknown as typeof fetch
  server = createApp(db, dir, { igdb: null, romm: null, openAccess: true, fetchImpl }).listen(0)
  await new Promise((r) => server.once("listening", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => {
  server?.close()
  db?.close()
  rmSync(dir, { recursive: true, force: true })
})

const send = (method: string, url: string, body?: unknown) =>
  fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })

describe("lecture d'une liste de la source", () => {
  it("lit le numéro, le titre, la fiche et la cote de chaque ligne", () => {
    const items = parseSourcePage(page)
    expect(items).toHaveLength(4)
    expect(items[0]).toMatchObject({ position: 1, title: "7'sCarlet", price_cents: 4459 })
    expect(items[0].url).toContain("/psvita_eu/item/")
    expect(items[3]).toMatchObject({ position: 4, title: "Aegis of Earth: Protonovus Assault" })
  })

  it("refuse une page sans ligne de jeu plutôt que d'enregistrer une liste vide", () => {
    expect(() => parseSourcePage("<html><body><p>Maintenance</p></body></html>")).toThrow()
  })
})

describe("rapprochement avec la collection", () => {
  const item = (position: number, title: string, price: number | null): SourceItem => ({ position, title, url: null, price_cents: price })

  it("compare les titres sans accents ni ponctuation, et ne compte que la bonne console", () => {
    db.prepare("INSERT INTO games (platform, title) VALUES (?, ?)").run("PlayStation Vita", "A Rose in the Twilight")
    db.prepare("INSERT INTO games (platform, title) VALUES (?, ?)").run("PlayStation 2", "99Vidas")
    const summary = saveSet(db, vita, [item(1, "7'sCarlet", 4459), item(2, "99Vidas", 11173), item(3, "A Rose In The Twilight", 10746)])
    expect(summary).toMatchObject({ count: 3, owned: 1, total_cents: 26378 })
    // Ce qui reste à dépenser : les deux jeux manquants, pas celui qu'on a déjà.
    expect(summary.missing_cents).toBe(4459 + 11173)
    const found = getSet(db, "psvita_eu")!
    expect(found.items.map((i) => i.owned_game_id !== null)).toEqual([false, false, true])
    expect(listSets(db)).toHaveLength(1)
  })

  it("garde les fiches IGDB déjà trouvées quand la liste est remise à jour", () => {
    db.prepare("UPDATE set_items SET igdb_id = 42, cover_url = 'https://images.igdb.com/x.jpg' WHERE set_slug = ? AND position = 1").run("psvita_eu")
    saveSet(db, vita, [item(1, "7'sCarlet", 5000), item(2, "99Vidas", 11173)])
    const again = getSet(db, "psvita_eu")!
    expect(again.items).toHaveLength(2)
    expect(again.items[0]).toMatchObject({ igdb_id: 42, price_cents: 5000 })
  })

  it("normalise les titres pour la comparaison", () => {
    expect(normTitle("The Legend of Zelda: Skyward Sword")).toBe("legend of zelda skyward sword")
    expect(normTitle("Ratchet & Clank")).toBe("ratchet and clank")
  })
})

describe("recherche des jaquettes", () => {
  const list = { slug: "test-progression", name: "Test", platform: "PlayStation Vita", region: null }
  const item = (position: number, title: string): SourceItem => ({ position, title, url: null, price_cents: null })
  // IGDB simulé : un seul titre est connu, les autres ne donnent rien.
  const igdb = {
    search: async (q: string) =>
      q === "7'sCarlet" ? [{ igdb_id: 111, name: q, original_name: null, year: null, platforms: ["PlayStation Vita"], cover: "https://images.igdb.com/x.jpg" }] : [],
    game: async () => {
      throw new Error("non utilisé")
    },
  } as unknown as IgdbClient

  it("ne repasse pas sur les titres déjà cherchés : la liste avance paquet par paquet", async () => {
    saveSet(db, list, [item(1, "Jeu introuvable A"), item(2, "Jeu introuvable B"), item(3, "7'sCarlet")])
    expect(await linkSetCovers(db, list.slug, igdb, 2)).toMatchObject({ looked: 2, linked: 0, untried: 1 })
    expect(await linkSetCovers(db, list.slug, igdb, 2)).toMatchObject({ looked: 1, linked: 1, remaining: 2, untried: 0 })
    // Plus rien à chercher : le bouton ne tourne pas dans le vide.
    expect(await linkSetCovers(db, list.slug, igdb, 2)).toMatchObject({ looked: 0 })
    // « Tout retenter » redonne leur chance aux titres sans fiche.
    expect(await linkSetCovers(db, list.slug, igdb, 5, true)).toMatchObject({ looked: 2, linked: 0 })
  })
})

describe("API", () => {
  it("liste les sources, récupère une liste et la rend avec son avancement", async () => {
    const lists = (await (await fetch(`${base}/api/sets`)).json()) as { lists: Array<{ slug: string; saved: unknown }> }
    expect(lists.lists.length).toBeGreaterThan(20)

    const refreshed = await send("POST", "/api/sets/psvita_eu/refresh")
    expect(refreshed.status).toBe(200)
    expect(await refreshed.json()).toMatchObject({ set: { slug: "psvita_eu", count: 4, platform: "PlayStation Vita" } })

    const detail = (await (await fetch(`${base}/api/sets/psvita_eu`)).json()) as { items: unknown[] }
    expect(detail.items).toHaveLength(4)

    expect((await send("POST", "/api/sets/inconnue/refresh")).status).toBe(404)
    expect((await send("DELETE", "/api/sets/psvita_eu")).status).toBe(200)
    expect((await fetch(`${base}/api/sets/psvita_eu`)).status).toBe(404)
  })
})
