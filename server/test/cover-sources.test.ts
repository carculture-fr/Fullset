import { describe, expect, it } from "vitest"

import { gameCoverOptions, hardwareCoverOptions, screenscraperThumb } from "../src/cover-sources.js"
import type { IgdbClient } from "../src/igdb.js"
import type { ScreenscraperClient } from "../src/screenscraper.js"
import type { SteamGridClient } from "../src/steamgriddb.js"

// Les trois sources simulées : aucune requête ne part, on vérifie ce que l'écran recevra.

const igdb = {
  game: async () => ({
    covers: [
      { label: "Europe", url: "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/eu.jpg" },
      { label: "Principale", url: "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/main.jpg" },
    ],
  }),
} as unknown as IgdbClient

const screenscraper = {
  search: async (titre: string) =>
    titre === "Tearaway"
      ? [
          {
            id: 29579,
            systemId: 62,
            name: "Tearaway",
            system: "PS Vita",
            covers: [
              { key: "62/29579/box-2D(eu)", type: "box-2D", region: "eu", format: "png" },
              { key: "62/29579/box-3D(us)", type: "box-3D", region: "us", format: "png" },
            ],
          },
        ]
      : [],
  systemImages: async (platform: string) =>
    platform === "PlayStation Vita" ? [{ key: "62/0/photo(wor)", type: "photo", region: "wor", format: "png" }] : [],
  media: async () => ({ bytes: Buffer.from([0xff]), mime: "image/png" }),
  systems: async () => new Map<string, number>(),
} as unknown as ScreenscraperClient

const steamgriddb = {
  search: async () => [{ id: 37940, name: "Tearaway" }],
  covers: async () => [
    { id: 722136, url: "https://cdn2.steamgriddb.com/grid/abc.png", thumb: "https://cdn2.steamgriddb.com/thumb/abc.jpg", width: 600, height: 900, style: "alternate", author: "quelqu'un" },
  ],
} as unknown as SteamGridClient

const jeu = { igdb_id: 50, title: "Tearaway", platform: "PlayStation Vita" }
const toutes = { igdb: () => igdb, screenscraper: () => screenscraper, steamgriddb: () => steamgriddb }

describe("jaquettes proposées par les sources branchées", () => {
  it("rassemble les trois sources, en disant d'où vient chaque image", async () => {
    const options = await gameCoverOptions(toutes, jeu)
    expect(options.map((o) => o.source)).toEqual(["igdb", "igdb", "screenscraper", "screenscraper", "steamgriddb"])
    expect(options[0]).toMatchObject({ label: "IGDB · Europe", url: "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/eu.jpg" })

    // ScreenScraper ne donne jamais d'adresse : ses URL portent le mot de passe développeur.
    const ss = options.filter((o) => o.source === "screenscraper")
    expect(ss.every((o) => o.url === undefined)).toBe(true)
    expect(ss[0]).toMatchObject({ key: "62/29579/box-2D(eu)", label: "ScreenScraper · box-2D · eu", thumb: screenscraperThumb("62/29579/box-2D(eu)") })

    expect(options.at(-1)).toMatchObject({ source: "steamgriddb", url: "https://cdn2.steamgriddb.com/grid/abc.png", thumb: "https://cdn2.steamgriddb.com/thumb/abc.jpg" })
  })

  it("ne propose que ce qui est branché", async () => {
    const seul = { igdb: () => null, screenscraper: () => screenscraper, steamgriddb: () => null }
    expect((await gameCoverOptions(seul, jeu)).map((o) => o.source)).toEqual(["screenscraper", "screenscraper"])
    expect(await gameCoverOptions({ igdb: () => null, screenscraper: () => null, steamgriddb: () => null }, jeu)).toEqual([])
  })

  it("garde les autres sources quand l'une d'elles tombe", async () => {
    const enPanne = {
      igdb: () =>
        ({
          game: async () => {
            throw new Error("IGDB injoignable")
          },
        }) as unknown as IgdbClient,
      screenscraper: () => screenscraper,
      steamgriddb: () => null,
    }
    expect((await gameCoverOptions(enPanne, jeu)).map((o) => o.source)).toEqual(["screenscraper", "screenscraper"])
  })

  it("ne cherche pas chez IGDB un jeu qui n'a pas de fiche", async () => {
    const sansFiche = await gameCoverOptions(toutes, { ...jeu, igdb_id: null })
    expect(sansFiche.some((o) => o.source === "igdb")).toBe(false)
  })

  it("propose aussi les images d'une console", async () => {
    expect(await hardwareCoverOptions(toutes, "PlayStation Vita")).toEqual([
      { source: "screenscraper", label: "ScreenScraper · photo · wor", key: "62/0/photo(wor)", thumb: screenscraperThumb("62/0/photo(wor)") },
    ])
    expect(await hardwareCoverOptions(toutes, "Console inconnue")).toEqual([])
  })
})
