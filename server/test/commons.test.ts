import { existsSync, mkdtempSync, rmSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { commonsQueries, pickAutomatic, type CommonsImage } from "../src/commons.js"
import { openDb, schemaVersion, type Db } from "../src/db.js"

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])

// Commons simulé : une recherche « PlayStation 2 » trouve deux fichiers, le reste rien.
const page = (index: number, title: string, mime = "image/jpeg", width = 4000) => ({
  title,
  index,
  imageinfo: [
    {
      mime,
      width,
      url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${encodeURIComponent(title.slice(5))}`,
      // Forme réelle depuis 2026 : vignette sur thumb.wikimedia.org, taille normalisée, paramètres utm_.
      thumburl: `https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/x/1280px-${encodeURIComponent(title.slice(5))}?utm_source=commons.wikimedia.org&utm_content=thumbnail`,
      descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
      extmetadata: { LicenseShortName: { value: "Public domain" }, Artist: { value: '<a href="#">Evan-Amos</a>' } },
    },
  ],
})
const PS2 = [page(1, "File:Sony-PlayStation-2-30001-Console-FL.jpg"), page(2, "File:PlayStation 2 logo.svg", "image/svg+xml"), page(3, "File:PS2-Versions.jpg")]
const calls: string[] = []
const fakeFetch = (async (input: string | URL) => {
  const url = String(input)
  calls.push(url)
  if (url.startsWith("https://thumb.wikimedia.org/")) return new Response(JPEG, { headers: { "content-type": "image/jpeg" } })
  const params = new URL(url).searchParams
  const q = params.get("gsrsearch") ?? ""
  const title = params.get("titles")
  const pages = title ? PS2.filter((p) => p.title === title) : q.startsWith("PlayStation 2") ? PS2 : []
  return Response.json({ query: { pages: Object.fromEntries(pages.map((p, i) => [String(i), p])) } })
}) as typeof fetch

let dir: string
let db: Db
let server: Server
let base: string

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-commons-"))
  db = openDb(dir)
  server = createApp(db, dir, { igdb: null, romm: null, openAccess: true, fetchImpl: fakeFetch }).listen(0)
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
const item = async (id: number) => (await (await send("GET", `/api/hardware/${id}`)).json()) as { image: string | null; image_credit: string | null; image_page: string | null }
const until = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 50 && !(await check()); i++) await new Promise((r) => setTimeout(r, 20))
}

describe("recherche Commons", () => {
  it("traduit couleur et édition, puis élargit", () => {
    expect(commonsQueries({ kind: "Console", platform: "GameCube", edition: null, color: "Platine" })).toEqual(["GameCube silver console", "GameCube console", "GameCube"])
    expect(commonsQueries({ kind: "Manette", platform: "Xbox 360", edition: "Slim", color: "Noir" })[0]).toBe("Xbox 360 slim black controller")
  })

  it("ramène les graphies courantes au nom employé sur Commons", () => {
    expect(commonsQueries({ kind: "Console", platform: "Megadrive", edition: null, color: null })).toEqual(["Mega Drive console", "Mega Drive"])
    expect(commonsQueries({ kind: "Console", platform: "PS1", edition: null, color: null })[0]).toBe("PlayStation console")
  })

  it("écarte les autres modèles, les cartes mères et les manettes seules ; préfère la vue d'ensemble", () => {
    const opt = (title: string) => ({ title }) as CommonsImage
    const pick = (platform: string, titles: string[], edition: string | null = null, kind = "Console") =>
      pickAutomatic({ kind, platform, edition, color: null }, titles.map(opt))?.title ?? null
    expect(pick("Xbox", ["File:Xbox-360-Pro-wController.jpg", "File:Xbox-360S-Console-Set.jpg", "File:Xbox-Debug-Console-Set.jpg", "File:Xbox-console.jpg"])).toBe("File:Xbox-console.jpg")
    expect(pick("Wii", ["File:Wii U Console and Gamepad.png", "File:Wii-console.jpg"])).toBe("File:Wii-console.jpg")
    expect(pick("PlayStation", ["File:PlayStation-Vita-1101-FL.jpg", "File:Sony-PlayStation-3-2001A-wController-L.jpg"])).toBeNull()
    expect(pick("Nintendo DS", ["File:Nintendo-DS-Lite-Black-Open.jpg"])).toBeNull()
    expect(pick("Nintendo DS", ["File:Nintendo-DS-Lite-Black-Open.jpg"], "Lite")).toBe("File:Nintendo-DS-Lite-Black-Open.jpg")
    expect(pick("Xbox 360", ["File:Xbox-360S-Console-Set.jpg"], "Slim")).toBe("File:Xbox-360S-Console-Set.jpg")
    expect(pick("Mega Drive", ["File:Sega-Mega-CD-with-Mega-Drive on top.jpg", "File:Sega-Genesis-Mk2-Motherboard-01.jpg", "File:Sega-Mega-Drive-EU-Mk1-wController-FL.png", "File:Sega-Mega-Drive-JP-Mk1-Console-Set.jpg"])).toBe(
      "File:Sega-Mega-Drive-JP-Mk1-Console-Set.jpg",
    )
    expect(pick("GameCube", ["File:Nintendo GameCube rear.jpg", "File:GameCube-Set.jpg"])).toBe("File:GameCube-Set.jpg")
    expect(pick("PlayStation", ["File:PlayStation Camera Mk2 on TV.jpg", "File:PS4-Console-wDS4.jpg", "File:PSX-Console-wController.jpg"])).toBe("File:PSX-Console-wController.jpg")
    expect(pick("PlayStation 3", ["File:Sony-PlayStation-3-2001A-wController-L.jpg", "File:Sony-PlayStation-PS3-Slim-Console-FL.jpg"], "Slim")).toBe("File:Sony-PlayStation-PS3-Slim-Console-FL.jpg")
    expect(pick("Wii", ["File:Nintendo-Wii-Remote-wNunchuk.jpg"])).toBeNull()
    // Noms du catalogue (RomM) et modèles choisis.
    const withModel = (platform: string, model: string, titles: string[]) =>
      pickAutomatic({ kind: "Console", platform, edition: null, color: null, model }, titles.map(opt))?.title ?? null
    expect(pick("Nintendo GameCube", ["File:GameCube-Set.jpg"])).toBe("File:GameCube-Set.jpg")
    expect(pick("Sega Mega Drive/Genesis", ["File:Sega-Mega-Drive-JP-Mk1-Console-Set.jpg"])).toBe("File:Sega-Mega-Drive-JP-Mk1-Console-Set.jpg")
    // La version fine et l'adaptateur Wi-Fi ne sont pas une Xbox 360 d'origine : rien plutôt qu'une image fausse.
    expect(withModel("Xbox 360", "Xbox 360 Original", ["File:Xbox-360S-Console-Set.jpg", "File:Xbox-360-WiFi-Adapter-Original.jpg"])).toBeNull()
    expect(withModel("Xbox 360", "Xbox 360 S", ["File:Xbox-360-Pro-wController.jpg", "File:Xbox-360S-Console-Set.jpg"])).toBe("File:Xbox-360S-Console-Set.jpg")
    expect(withModel("PlayStation 2", "Slimline", ["File:PS2-Fat-Console-Set.jpg", "File:PS2-Slim-Console-Set.jpg"])).toBe("File:PS2-Slim-Console-Set.jpg")
    expect(pick("PSP", ["File:PSP-Go-FL-Open.jpg", "File:Sony-PSP-1000-Body.png"])).toBe("File:Sony-PSP-1000-Body.png")
    expect(pick("Xbox 360", ["File:Xbox-360-S-Controller.jpg", "File:Xbox-s-controller.jpg"], null, "Manette")).toBe("File:Xbox-360-S-Controller.jpg")
  })

  it("ne choisit seul qu'un fichier dont le nom contient la console", () => {
    const opt = (title: string) => ({ title }) as CommonsImage
    const ps2 = { kind: "Console", platform: "PlayStation 2", edition: null, color: null }
    expect(pickAutomatic(ps2, [opt("File:PlayStation-Vita-1101-FL.jpg"), opt("File:Sony-PlayStation-2-30001-Console-FL.jpg")])?.title).toContain("30001")
    expect(pickAutomatic(ps2, [opt("File:Sony-PlayStation-3-2001A.jpg")])).toBeUndefined()
  })
})

describe("image par défaut du matériel", () => {
  it("migre le schéma", () => expect(schemaVersion(db)).toBe(11))

  it("est posée seule à la création quand une image correspond", async () => {
    const { id } = await (await send("POST", "/api/hardware", { kind: "Console", platform: "PlayStation 2", color: "Noir" })).json()
    await until(async () => (await item(id)).image !== null)
    const h = await item(id)
    expect(h.image).toMatch(/^\/covers\/hw-\d+-\w+\.jpg$/)
    expect(h.image_credit).toBe("Evan-Amos, Public domain")
    expect(h.image_page).toContain("commons.wikimedia.org")
    expect(existsSync(path.join(dir, h.image!))).toBe(true)
    // La couleur a d'abord été cherchée, puis sans couleur.
    expect(calls.some((c) => c.includes("PlayStation+2+black+console"))).toBe(true)
  })

  it("reste vide quand rien ne correspond", async () => {
    const { id } = await (await send("POST", "/api/hardware", { kind: "Console", platform: "Atari Jaguar" })).json()
    await new Promise((r) => setTimeout(r, 100))
    expect((await item(id)).image).toBeNull()
  })

  it("propose des photos (pas de SVG), se choisit par nom de fichier, se retire", async () => {
    const { id } = await (await send("POST", "/api/hardware", { kind: "Console", platform: "PlayStation 2" })).json()
    const { query, options } = await (await send("GET", `/api/hardware/${id}/image-options`)).json()
    expect(query).toBe("PlayStation 2 console")
    expect(options.map((o: CommonsImage) => o.title)).toEqual(["File:Sony-PlayStation-2-30001-Console-FL.jpg", "File:PS2-Versions.jpg"])
    expect(options[0].thumb).toMatch(/^https:\/\/thumb\.wikimedia\.org\/.*\/330px-Sony-PlayStation-2-30001-Console-FL\.jpg$/)
    expect(options[0].url).not.toContain("utm_")

    await until(async () => (await item(id)).image !== null)
    const before = (await item(id)).image!
    const res = await send("POST", `/api/hardware/${id}/image`, { title: "File:PS2-Versions.jpg" })
    expect(res.status).toBe(200)
    const after = (await item(id)).image!
    expect(after).not.toBe(before)
    expect(existsSync(path.join(dir, before))).toBe(false)

    expect((await send("POST", `/api/hardware/${id}/image`, { title: "https://evil.example/x.jpg" })).status).toBe(400)
    expect((await send("POST", `/api/hardware/${id}/image`, { title: "File:Inconnu.jpg" })).status).toBe(502)

    expect((await send("DELETE", `/api/hardware/${id}/image`)).status).toBe(200)
    expect((await item(id)).image).toBeNull()
    expect(existsSync(path.join(dir, after))).toBe(false)
  })
})
