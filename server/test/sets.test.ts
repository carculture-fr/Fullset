import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { openDb, type Db } from "../src/db.js"
import { coverUrl, fetchSourceList, parseSourcePage, sourceList, type SourceItem } from "../src/fullsetnet.js"
import type { IgdbClient } from "../src/igdb.js"
import { getSet, linkSetCovers, listSets, missingCsv, normTitle, saveSet, setsForGame, wishMissing } from "../src/sets.js"

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

  it("va chercher chez la liste complète le numéro de jaquette d'une liste régionale", async () => {
    const ligne = (index: number, nom: string, fiche: string) =>
      `<tr data-fs-index="${index}" data-fs-name="${nom}" data-fs-price="10.00"><td class="le_nom"><a href="/psx/item/${fiche}.html">${nom}</a></td></tr>`
    const complete = `<table>${ligne(1, "Alpha", "alpha")}${ligne(2, "Bravo", "bravo")}${ligne(3, "Charlie", "charlie")}</table>`
    const regionale = `<table>${ligne(1, "Charlie", "charlie")}${ligne(2, "Alpha", "alpha")}</table>`
    const fetchImpl = (async (url: string) =>
      new Response(String(url).includes("/collection/psx.html") ? complete : regionale, { headers: { "Content-Type": "text/html" } })) as unknown as typeof fetch

    const pal = sourceList("psx_pal")!
    const items = await fetchSourceList(pal, fetchImpl)
    // Le 1er jeu de la liste PAL est le 3e de la liste complète, qui porte les images.
    expect(items.map((i) => [i.position, i.cover_pos])).toEqual([
      [1, 3],
      [2, 1],
    ])
    expect(coverUrl(pal, items[0].cover_pos!)).toBe("https://full-set.net/covers/psx/3.jpg")
    // Une liste qui a ses propres images garde sa numérotation.
    expect(coverUrl(vita, 12)).toBe("https://full-set.net/covers/psvita_eu/12.jpg")
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

describe("les manquants d'un coup", () => {
  const list = { slug: "test-manquants", name: "Full set de test", platform: "PlayStation Vita", region: null }
  const item = (position: number, title: string, price: number | null): SourceItem => ({ position, title, url: null, price_cents: price })

  it("ajoute les manquants aux souhaits, sans doublon, et les exporte en CSV", () => {
    db.prepare("INSERT INTO games (platform, title) VALUES (?, ?)").run("PlayStation Vita", "Tearaway")
    saveSet(db, list, [item(1, "Tearaway", 2500), item(2, "Gravity Rush", 3000), item(3, "Persona 4 Golden", 4500)])

    // Tearaway est possédé : seuls les deux autres partent dans les souhaits, cote en prix cible.
    expect(wishMissing(db, list.slug)).toEqual({ added: 2, missing: 2 })
    const wished = db.prepare("SELECT title, target_price_cents FROM wishlist ORDER BY title").all() as Array<{ title: string; target_price_cents: number | null }>
    expect(wished.map((w) => w.title)).toEqual(["Gravity Rush", "Persona 4 Golden"])
    expect(wished[0].target_price_cents).toBe(3000)

    // Deuxième passage : rien à ajouter.
    expect(wishMissing(db, list.slug)).toEqual({ added: 0, missing: 2 })

    const csv = missingCsv(db, list.slug)!
    expect(csv.startsWith("﻿numéro;titre;cote;fiche")).toBe(true)
    expect(csv).toContain("2;Gravity Rush;30,00;")
    expect(csv).not.toContain("Tearaway")
  })
})

describe("place d'un jeu dans les listes", () => {
  const list = { slug: "test-membership", name: "Full set Vita (test)", platform: "PlayStation Vita", region: null }

  it("dit dans quelle liste un jeu figure, et s'il te manque", () => {
    saveSet(db, list, [{ position: 1, title: "Soul Sacrifice", url: null, price_cents: 3200 }])

    // Absent de la collection : c'est un manquant, avec sa cote (réponse du scanner en brocante).
    expect(setsForGame(db, { title: "Soul Sacrifice", platform: "PlayStation Vita" })).toEqual([
      { slug: list.slug, name: list.name, platform: "PlayStation Vita", position: 1, price_cents: 3200, owned: false },
    ])
    // Le même titre sur une autre console ne concerne pas cette liste.
    expect(setsForGame(db, { title: "Soul Sacrifice", platform: "PlayStation 2" })).toEqual([])

    db.prepare("INSERT INTO games (platform, title) VALUES (?, ?)").run("PlayStation Vita", "Soul Sacrifice")
    // La casse et la ponctuation ne comptent pas.
    expect(setsForGame(db, { title: "soul sacrifice", platform: "PlayStation Vita" })[0]).toMatchObject({ owned: true })
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
    expect((await fetch(`${base}/api/sets/inconnue`)).status).toBe(404)
    expect((await send("DELETE", "/api/sets/psvita_eu")).status).toBe(200)
    expect((await fetch(`${base}/api/sets/psvita_eu`)).status).toBe(404)
  })

  it("sert le modèle de liste, sans le prendre pour une liste inconnue", async () => {
    const res = await fetch(`${base}/api/sets/modele.csv`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/csv")
    // BOM UTF-8 en tête : Excel français ouvre le fichier avec les bons accents. Il se lit sur
    // les octets — la lecture en texte le retire d'elle-même.
    const octets = new Uint8Array(await res.arrayBuffer())
    expect([...octets.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const csv = new TextDecoder().decode(octets)
    expect(csv.startsWith("numero;titre;cote")).toBe(true)
    expect(csv).toContain("Metroid Prime;24,90")
  })
})
