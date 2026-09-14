import { describe, expect, it } from "vitest"

import { Igdb, igdbImage, mapGame } from "../src/igdb.js"

// Réponse réelle d'IGDB pour Need for Speed: Most Wanted (id 243048), relevée le 12/09/2026.
const NFS = {
  id: 243048,
  name: "Need for Speed: Most Wanted",
  summary: "The player arrives in Rockport City.",
  first_release_date: 1132012800,
  cover: { image_id: "co6b1f" },
  franchises: [{ name: "Need for Speed" }],
  collections: [{ name: "Need for Speed" }],
  game_modes: [{ name: "Single player" }, { name: "Multiplayer" }],
  genres: [{ name: "Racing" }],
  themes: [{ name: "Action" }],
  involved_companies: [
    { company: { name: "EA Redwood Shores" }, developer: true, publisher: false },
    { company: { name: "EA Black Box" }, developer: true, publisher: false },
    { company: { name: "Electronic Arts" }, developer: false, publisher: true },
  ],
  platforms: [
    { id: 11, name: "Xbox" },
    { id: 21, name: "Nintendo GameCube" },
    { id: 8, name: "PlayStation 2" },
  ],
  player_perspectives: [{ name: "Third person" }],
  release_dates: [
    { date: 1132012800, platform: 11, release_region: 2 },
    { date: 1132876800, platform: 21, release_region: 1 },
    { date: 1132876800, platform: 8, release_region: 1 },
    { date: 1132012800, platform: 21, release_region: 2 },
  ],
  total_rating: 81.23251861008973,
  url: "https://www.igdb.com/games/need-for-speed-most-wanted--4",
}

describe("traduction d'une fiche IGDB", () => {
  it("retrouve exactement l'enrichissement de collection.json", () => {
    expect(mapGame(NFS, "Nintendo GameCube")).toMatchObject({
      igdb_id: 243048,
      title: "Need for Speed: Most Wanted",
      developer: "EA Redwood Shores, EA Black Box",
      publisher: "Electronic Arts",
      release_date: "2005-11-25",
      genres: "Course, Action",
      game_modes: "Solo, Multijoueur",
      perspective: "Vue à la 3e personne",
      series: "Need for Speed",
      pegi: null,
      igdb_rating: 81,
      igdb_url: "https://www.igdb.com/games/need-for-speed-most-wanted--4",
      cover_url: igdbImage("co6b1f"),
      platforms: ["Xbox", "Nintendo GameCube", "PlayStation 2"],
    })
  })

  it("préfère le titre, la jaquette et la sortie européens", () => {
    const g = mapGame(
      {
        id: 1790,
        name: "Ratchet: Deadlocked",
        cover: { image_id: "cous" },
        platforms: [{ id: 8, name: "PlayStation 2" }],
        game_localizations: [{ name: "Ratchet: Gladiator", region: 4, cover: { image_id: "coeu" } }],
        age_ratings: [
          { organization: 1, rating_category: { rating: "T" } },
          { organization: 2, rating_category: { rating: "16" } },
        ],
        release_dates: [
          { date: 1130198400, platform: 8, release_region: 2 },
          { date: 1131062400, platform: 8, release_region: 1 },
        ],
      },
      "PlayStation 2",
    )
    expect(g).toMatchObject({ title: "Ratchet: Gladiator", pegi: "PEGI 16", release_date: "2005-11-04", cover_url: igdbImage("coeu") })
    expect(g.covers.map((c) => c.label)).toEqual(["Europe", "Principale"])
  })
})

describe("client IGDB", () => {
  const fakeFetch = () => {
    const calls: Array<{ url: string; body: string }> = []
    const impl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body = String(init?.body ?? "")
      calls.push({ url, body })
      const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } })
      if (url.startsWith("https://id.twitch.tv")) return json({ access_token: "jeton", expires_in: 3600 })
      if (url.endsWith("/alternative_names")) return json([{ game: 703 }])
      if (url.endsWith("/game_localizations")) return json([{ game: 703 }])
      if (url.endsWith("/games") && body.startsWith("search")) return json([])
      if (url.endsWith("/games") && body.includes("where id = (703)")) {
        return json([
          {
            id: 703,
            name: "FIFA Soccer 2005",
            first_release_date: 1097193600,
            platforms: [{ id: 8, name: "PlayStation 2" }, { id: 6, name: "PC (Microsoft Windows)" }],
            game_localizations: [{ name: "FIFA Football 2005", region: 4 }],
          },
        ])
      }
      return json([])
    }) as typeof fetch
    return { calls, impl }
  }

  it("trouve un jeu par son titre européen et ne demande le jeton qu'une fois", async () => {
    const { calls, impl } = fakeFetch()
    const igdb = new Igdb("id", "secret", impl)
    const results = await igdb.search("FIFA Football 2005")
    expect(results).toEqual([
      { igdb_id: 703, name: "FIFA Football 2005", original_name: "FIFA Soccer 2005", year: 2004, platforms: ["PlayStation 2", "PC"], cover: null },
    ])
    await igdb.search("autre")
    expect(calls.filter((c) => c.url.startsWith("https://id.twitch.tv"))).toHaveLength(1)
    expect(calls.find((c) => c.body.startsWith("search"))!.body).toContain("game_type != (1,5,7,13,14)")
  })

  it("cherche les titres localisés mot à mot, sans dépendre de la ponctuation", async () => {
    const { calls, impl } = fakeFetch()
    await new Igdb("id", "secret", impl).search("ratchet gladiator")
    const localized = calls.find((c) => c.url.endsWith("/game_localizations"))!
    expect(localized.body).toBe('fields game; where name ~ *"ratchet"* & name ~ *"gladiator"*; limit 10;')
  })

  it("met le jeu principal au titre exact avant les portages", async () => {
    const impl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const json = (v: unknown) => new Response(JSON.stringify(v))
      if (url.startsWith("https://id.twitch.tv")) return json({ access_token: "t", expires_in: 3600 })
      if (url.endsWith("/games") && String(init?.body).startsWith("search")) {
        return json([
          { id: 240278, name: "FIFA Soccer 2005", game_type: 11 },
          { id: 5, name: "FIFA Soccer 2005: Mobile", game_type: 0 },
          { id: 703, name: "FIFA Soccer 2005", game_type: 0 },
        ])
      }
      return json([])
    }) as typeof fetch
    const r = await new Igdb("id", "secret", impl).search("FIFA Soccer 2005")
    expect(r.map((c) => c.igdb_id)).toEqual([703, 240278, 5])
  })

  it("retente sans les mentions d'édition quand le titre saisi ne donne rien", async () => {
    const searched: string[] = []
    const impl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body = String(init?.body ?? "")
      const json = (v: unknown) => new Response(JSON.stringify(v))
      if (url.startsWith("https://id.twitch.tv")) return json({ access_token: "t", expires_in: 3600 })
      if (url.endsWith("/games") && body.startsWith("search")) {
        searched.push(body.match(/^search "([^"]*)"/)![1])
        return json(body.startsWith('search "Grid Autosport";') ? [{ id: 6415, name: "Grid: Autosport", game_type: 0 }] : [])
      }
      return json([])
    }) as typeof fetch
    const r = await new Igdb("id", "secret", impl).search("Grid Autosport Black (Limited Edition)")
    expect(r.map((c) => c.name)).toEqual(["Grid: Autosport"])
    expect(searched).toEqual(["Grid Autosport Black (Limited Edition)", "Grid Autosport Black", "Grid Autosport"])
  })

  it("neutralise les guillemets de la recherche", async () => {
    const { calls, impl } = fakeFetch()
    await new Igdb("id", "secret", impl).search('halo" ; fields *')
    expect(calls.find((c) => c.body.startsWith("search"))!.body).toMatch(/^search "halo ; fields \*";/)
  })
})
