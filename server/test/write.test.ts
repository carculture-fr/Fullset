import { existsSync, mkdtempSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createAccount } from "../src/account.js"
import { createApp } from "../src/app.js"
import { openDb, type Db } from "../src/db.js"
import type { IgdbClient, IgdbGame } from "../src/igdb.js"

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])

const fakeIgdb: IgdbClient = {
  search: async () => [],
  game: async (id, platform) =>
    ({
      igdb_id: id,
      title: `Jeu ${id}`,
      summary: "Résumé",
      developer: "Studio",
      publisher: "Éditeur",
      release_date: "2005-11-25",
      genres: "Course",
      game_modes: "Solo",
      perspective: null,
      series: null,
      pegi: "PEGI 3",
      igdb_rating: 80,
      igdb_url: null,
      cover_url: `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co${id}.jpg`,
      platforms: [platform ?? "PC"],
      covers: [{ label: "Europe", url: `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/eu${id}.jpg` }],
    }) satisfies IgdbGame,
}
const fakeFetch = (async () => new Response(JPEG, { headers: { "content-type": "image/jpeg" } })) as typeof fetch

let dir: string
let db: Db
let server: Server
let base: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-write-"))
  db = openDb(dir)
  server = createApp(db, dir, { igdb: fakeIgdb, fetchImpl: fakeFetch, openAccess: true }).listen(0)
  await new Promise((r) => server.once("listening", r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const send = (method: string, url: string, body?: unknown) =>
  fetch(`${base}${url}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
const json = async (res: Response) => ({ status: res.status, body: await res.json() })
const game = async (id: number) => (await fetch(`${base}/api/games/${id}`)).json()
const count = (table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
const uploadImage = (url: string, type = "image/jpeg") => {
  const form = new FormData()
  form.append("file", new Blob([JPEG], { type }), "photo.jpg")
  return fetch(`${base}${url}`, { method: "POST", body: form })
}
const physical = { support: "Physique", content: "Jeu + boîte", condition_game: "Bon", price: "12,50", purchase_date: "2026-09-12", purchase_place: "Boutique d'occasion" }

describe("ajout d'un jeu", () => {
  it("crée le jeu depuis IGDB avec son premier exemplaire et sa jaquette", async () => {
    const r = await json(await send("POST", "/api/games", { igdb_id: 10, platform: "PlayStation 2", copy: physical }))
    expect(r.status).toBe(201)
    expect(r.body.existed).toBe(false)
    const g = await game(r.body.gameId)
    expect(g).toMatchObject({ igdb_id: 10, title: "Jeu 10", platform: "PlayStation 2", pegi: "PEGI 3", cover_source: "igdb" })
    expect(g.cover).toMatch(new RegExp(`^/covers/${r.body.gameId}-`))
    expect(existsSync(path.join(dir, g.cover))).toBe(true)
    expect(g.copies[0]).toMatchObject({ price_cents: 1250, condition_game: "Bon", purchase_place: "Boutique d'occasion", title_as_entered: "Jeu 10" })
  })

  it("ajoute un exemplaire au jeu existant plutôt que de le dupliquer", async () => {
    const r = await json(await send("POST", "/api/games", { igdb_id: 10, platform: "PlayStation 2", copy: physical }))
    expect(r.body.existed).toBe(true)
    expect((await game(r.body.gameId)).copies).toHaveLength(2)
  })

  it("refuse un exemplaire invalide sans créer de jeu orphelin", async () => {
    const before = count("games")
    for (const copy of [{ ...physical, support: "Cartouche" }, { ...physical, price: "douze" }, { ...physical, purchase_date: "2026-02-31" }]) {
      const r = await json(await send("POST", "/api/games", { igdb_id: 11, platform: "PC", copy }))
      expect(r.status).toBe(400)
    }
    expect(count("games")).toBe(before)
  })

  it("ajoute un jeu sans IGDB, et ne garde pas d'état pour un dématérialisé", async () => {
    const r = await json(await send("POST", "/api/games", { platform: "PC", title: "Jeu perso", copy: { support: "Dématérialisé", condition_game: "Bon" } }))
    const g = await game(r.body.gameId)
    expect(g).toMatchObject({ igdb_id: null, title: "Jeu perso", cover: null })
    expect(g.copies[0]).toMatchObject({ content: "Dématérialisé", condition_game: null })
  })
})

describe("exemplaires", () => {
  it("modifie un exemplaire, le passage en démat. efface les états", async () => {
    const { body } = await json(await send("POST", "/api/games", { igdb_id: 20, platform: "Xbox 360", copy: physical }))
    expect((await send("PUT", `/api/copies/${body.copyId}`, { ...physical, support: "Dématérialisé" })).status).toBe(200)
    expect((await game(body.gameId)).copies[0]).toMatchObject({ support: "Dématérialisé", condition_game: null, price_cents: 1250 })
    expect((await send("PUT", `/api/copies/${body.copyId}`, { ...physical, condition_box: "Cassée" })).status).toBe(400)
  })

  it("supprime le dernier exemplaire avec le jeu, sa jaquette et ses photos", async () => {
    const { body } = await json(await send("POST", "/api/games", { igdb_id: 30, platform: "GameCube", copy: physical }))
    const cover = (await game(body.gameId)).cover
    const photo = await json(await uploadImage(`/api/copies/${body.copyId}/photos`))
    const del = await json(await send("DELETE", `/api/copies/${body.copyId}`))
    expect(del.body).toMatchObject({ gameDeleted: true })
    expect(existsSync(path.join(dir, cover))).toBe(false)
    expect(existsSync(path.join(dir, photo.body.url))).toBe(false)
    expect((await fetch(`${base}/api/games/${body.gameId}`)).status).toBe(404)
  })
})

describe("photos et jaquettes", () => {
  it("enregistre une photo, la protège derrière la session et la supprime", async () => {
    const { body } = await json(await send("POST", "/api/games", { igdb_id: 40, platform: "PC", copy: physical }))
    const photo = await json(await uploadImage(`/api/copies/${body.copyId}/photos`))
    expect(photo.status).toBe(201)
    expect(existsSync(path.join(dir, photo.body.url))).toBe(true)
    expect((await uploadImage(`/api/copies/${body.copyId}/photos`, "text/plain")).status).toBe(400)

    // Même base servie avec l'authentification : la photo exige une session.
    await createAccount(db, { username: "joueur", password: "mot-de-passe-de-test" })
    const guarded = createApp(db, dir, { igdb: null }).listen(0)
    await new Promise((r) => guarded.once("listening", r))
    const g = `http://127.0.0.1:${(guarded.address() as AddressInfo).port}`
    expect((await fetch(`${g}${photo.body.url}`)).status).toBe(401)
    const login = await fetch(`${g}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: g },
      body: JSON.stringify({ username: "joueur", password: "mot-de-passe-de-test" }),
    })
    const cookie = login.headers.get("set-cookie")!.split(";")[0]
    expect((await fetch(`${g}${photo.body.url}`, { headers: { cookie } })).status).toBe(200)
    expect((await fetch(`${g}/covers/nexistepas.jpg`)).status).toBe(404)
    guarded.close()
    db.prepare("DELETE FROM account").run()
    db.prepare("DELETE FROM sessions").run()

    expect((await send("DELETE", `/api/photos/${photo.body.id}`)).status).toBe(200)
    expect(existsSync(path.join(dir, photo.body.url))).toBe(false)
  })

  it("remplace la jaquette par une photo, et n'accepte que des images IGDB par adresse", async () => {
    const { body } = await json(await send("POST", "/api/games", { igdb_id: 50, platform: "PC", copy: physical }))
    const before = (await game(body.gameId)).cover
    const r = await json(await uploadImage(`/api/games/${body.gameId}/cover`, "image/png"))
    expect(r.body.cover).not.toBe(before)
    expect(existsSync(path.join(dir, before))).toBe(false)
    expect((await game(body.gameId)).cover_source).toBe("photo")
    expect((await send("POST", `/api/games/${body.gameId}/cover/url`, { url: "http://169.254.169.254/secret" })).status).toBe(400)
    const opts = await json(await fetch(`${base}/api/games/${body.gameId}/cover-options`))
    // Le libellé dit d'où vient l'image : plusieurs sources peuvent en proposer.
    expect(opts.body.covers[0]).toMatchObject({ source: "igdb", label: "IGDB · Europe" })
    expect((await send("POST", `/api/games/${body.gameId}/cover/url`, { url: opts.body.covers[0].url })).status).toBe(200)
  })
})

describe("jeux", () => {
  it("rattache un jeu sans IGDB, et refuse un doublon", async () => {
    const { body } = await json(await send("POST", "/api/games", { platform: "PlayStation 2", title: "Burnout Revenge", copy: physical }))
    const r = await json(await send("POST", `/api/games/${body.gameId}/igdb`, { igdb_id: 2626 }))
    expect(r.body).toMatchObject({ igdb_id: 2626, title: "Jeu 2626", cover_source: "igdb" })
    expect(r.body.copies[0].title_as_entered).toBe("Burnout Revenge")
    expect((await send("POST", `/api/games/${body.gameId}/igdb`, { igdb_id: 10 })).status).toBe(400)
  })

  it("modifie la fiche, titre obligatoire", async () => {
    const { body } = await json(await send("POST", "/api/games", { igdb_id: 60, platform: "PC", copy: physical }))
    const r = await json(await send("PUT", `/api/games/${body.gameId}`, { title: "Titre PAL", summary: "Résumé en français", release_date: "2004-10-08" }))
    expect(r.body).toMatchObject({ title: "Titre PAL", summary: "Résumé en français", release_date: "2004-10-08" })
    expect((await send("PUT", `/api/games/${body.gameId}`, { title: " " })).status).toBe(400)
  })

  it("répond clairement quand IGDB n'est pas configuré", async () => {
    const d = mkdtempSync(path.join(tmpdir(), "fullset-noigdb-"))
    const s = createApp(openDb(d), d, { igdb: null, openAccess: true }).listen(0)
    await new Promise((r) => s.once("listening", r))
    const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/api/igdb/search?q=halo`)
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/IGDB n'est pas configuré/)
    s.close()
    rmSync(d, { recursive: true, force: true })
  })
})
