import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createApp } from "../src/app.js"
import { openDb, type Db } from "../src/db.js"
import { langFromHeader, msg } from "../src/i18n.js"
import en from "../src/locales/en.json" with { type: "json" }
import fr from "../src/locales/fr.json" with { type: "json" }

type Running = { server: Server; base: string }
let dir: string
let db: Db
let open: Running
let guarded: Running

const listen = async (app: ReturnType<typeof createApp>): Promise<Running> => {
  const server = app.listen(0)
  await new Promise((r) => server.once("listening", r))
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "fullset-i18n-"))
  db = openDb(dir)
  open = await listen(createApp(db, dir, { igdb: null, romm: null, openAccess: true, steam: null }))
  // Sans accès ouvert : garde de session et contrôle d'origine actifs.
  guarded = await listen(createApp(db, dir, { igdb: null, romm: null, steam: null }))
})

afterAll(() => {
  open.server.close()
  guarded.server.close()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const lang = (l?: string): Record<string, string> => (l === undefined ? {} : { "Accept-Language": l })
const error = async (res: Response) => ((await res.json()) as { error: string }).error
const postJson = (base: string, p: string, body: unknown, l?: string) =>
  fetch(`${base}${p}`, { method: "POST", headers: { "Content-Type": "application/json", ...lang(l) }, body: JSON.stringify(body) })
const postFile = (p: string, content: string | null, l?: string) => {
  const form = new FormData()
  if (content !== null) form.append("file", new Blob([content], { type: "application/json" }), "collection.json")
  return fetch(`${open.base}${p}`, { method: "POST", headers: lang(l), body: form })
}

describe("langue des messages du serveur", () => {
  it("choisit la langue d'après Accept-Language", () => {
    expect(langFromHeader(undefined)).toBe("fr")
    expect(langFromHeader("")).toBe("fr")
    expect(langFromHeader("*")).toBe("fr")
    expect(langFromHeader("fr-CA")).toBe("fr")
    expect(langFromHeader("en-US,en;q=0.9")).toBe("en")
    expect(langFromHeader("de-DE")).toBe("en")
    expect(langFromHeader("de-DE,fr;q=0.8,en;q=0.9")).toBe("en")
    expect(langFromHeader("de-DE,fr;q=0.8")).toBe("fr")
  })

  it("renvoie la même erreur de validation en français sans en-tête, en anglais avec Accept-Language: en", async () => {
    const frRes = await postJson(open.base, "/api/games", { title: "Halo" })
    expect(frRes.status).toBe(400)
    expect(await error(frRes)).toBe("La plateforme est obligatoire.")
    const enRes = await postJson(open.base, "/api/games", { title: "Halo" }, "en")
    expect(enRes.status).toBe(400)
    expect(await error(enRes)).toBe("The platform is required.")
  })

  it("traduit un message composé après la lecture du corps JSON", async () => {
    expect(await error(await postJson(open.base, "/api/wishlist", { title: "Halo", target_price: "abc" }))).toBe("Prix cible : « abc » n'est pas un montant.")
    expect(await error(await postJson(open.base, "/api/wishlist", { title: "Halo", target_price: "abc" }, "en-GB,en;q=0.9"))).toBe(
      "Target price: “abc” is not an amount.",
    )
  })

  it("garde la langue après la lecture d'un envoi multipart", async () => {
    expect(await error(await postFile("/api/import", null, "en"))).toBe("No file received.")
    expect(await error(await postFile("/api/import", "[ pas du json", "en"))).toBe("Unreadable JSON.")
    expect(await error(await postFile("/api/import", "[ pas du json"))).toBe("JSON illisible.")
  })

  it("traduit 401, 403 et 404", async () => {
    expect(await error(await fetch(`${guarded.base}/api/library`, { headers: lang("en") }))).toBe("Authentication required.")
    expect(await error(await fetch(`${guarded.base}/api/library`))).toBe("Authentification requise.")
    expect(await error(await postJson(guarded.base, "/api/auth/logout", {}, "en"))).toBe("Origin refused.")
    expect(await error(await fetch(`${open.base}/api/nope`, { headers: lang("en") }))).toBe("Unknown route.")
    expect(await error(await fetch(`${open.base}/api/games/999`, { headers: lang("en") }))).toBe("Game not found.")
  })

  it("accorde les pluriels", () => {
    expect(msg("lists.inUse", { value: "Leclerc", count: 1 }, "en")).toBe("“Leclerc” is used 1 times: rename or merge it instead.")
    expect(msg("transfer.collectionNotEmpty", { count: 1 }, "fr")).toBe("La collection contient déjà 1 exemplaire : import refusé.")
    expect(msg("transfer.collectionNotEmpty", { count: 3 }, "en")).toBe("The collection already holds 3 copies: import refused.")
    expect(msg("clé.inconnue")).toBe("clé.inconnue")
  })
})

type Dict = { [k: string]: string | Dict }
const flat = (o: Dict, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [`${p}${k}`] : flat(v, `${p}${k}.`)))
const vars = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort()
const get = (o: Dict, key: string) => key.split(".").reduce<string | Dict | undefined>((n, k) => (typeof n === "object" ? n[k] : undefined), o)

describe("dictionnaires du serveur", () => {
  it("fr.json et en.json ont les mêmes clés et les mêmes variables", () => {
    expect(flat(en).sort()).toEqual(flat(fr).sort())
    for (const key of flat(fr)) expect([key, vars(get(en, key) as string)]).toEqual([key, vars(get(fr, key) as string)])
  })

  it("toute clé écrite en toutes lettres dans le code existe", () => {
    const src = path.resolve(import.meta.dirname, "../src")
    const files = (d: string): string[] =>
      readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? files(path.join(d, f)) : f.endsWith(".ts") ? [path.join(d, f)] : []))
    const keys = new Set(flat(fr).map((k) => k.replace(/_(one|other)$/, "")))
    const used = files(src).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/\bmsg\(\s*"([^"]+)"/g)].map((m) => m[1]))
    expect(used.length).toBeGreaterThan(50)
    expect(used.filter((k) => !keys.has(k))).toEqual([])
  })
})
