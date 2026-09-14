import { describe, expect, it } from "vitest"

import { filterOptions, searchPlatforms } from "./platform-search"

const CATALOG = [
  "Xbox 360",
  "PlayStation 2",
  "Nintendo GameCube",
  "Nintendo Switch",
  "PlayStation",
  "PlayStation Portable",
  "Sega Mega Drive/Genesis",
  "Super Nintendo Entertainment System",
  "Nintendo Entertainment System",
  "Atari 2600",
  "3DO Interactive Multiplayer",
]

describe("recherche de console", () => {
  it("sans saisie, rend la liste dans son ordre", () => {
    expect(searchPlatforms(CATALOG, "", 3)).toEqual(["Xbox 360", "PlayStation 2", "Nintendo GameCube"])
    // Toute la liste au toucher : c'est ce qui manquait avec les pastilles.
    expect(searchPlatforms(CATALOG, "")).toHaveLength(CATALOG.length)
  })

  it("ignore casse, accents, espaces et tirets", () => {
    expect(searchPlatforms(CATALOG, "megadrive")).toEqual(["Sega Mega Drive/Genesis"])
    expect(searchPlatforms(CATALOG, "GAMECUBE")).toEqual(["Nintendo GameCube"])
    expect(searchPlatforms(CATALOG, "super nin")).toEqual(["Super Nintendo Entertainment System"])
  })

  it("comprend les abréviations d'usage, en tête de liste", () => {
    expect(searchPlatforms(CATALOG, "ps2")[0]).toBe("PlayStation 2")
    expect(searchPlatforms(CATALOG, "snes")[0]).toBe("Super Nintendo Entertainment System")
    expect(searchPlatforms(CATALOG, "psp")[0]).toBe("PlayStation Portable")
  })

  it("met devant les noms qui commencent par la saisie", () => {
    expect(searchPlatforms(CATALOG, "nin")).toEqual([
      "Nintendo GameCube",
      "Nintendo Switch",
      "Super Nintendo Entertainment System",
      "Nintendo Entertainment System",
    ])
    expect(searchPlatforms(CATALOG, "zzz")).toEqual([])
  })
})

describe("recherche des menus", () => {
  it("ignore casse et accents, préfère ce qui commence par la saisie", () => {
    const etats = ["Neuf", "Très bon", "Bon", "Moyen", "Mauvais", "Très mauvais", "Non défini"]
    expect(filterOptions(etats, "")).toEqual(etats)
    expect(filterOptions(etats, "tres")).toEqual(["Très bon", "Très mauvais"])
    expect(filterOptions(etats, "mauv")).toEqual(["Mauvais", "Très mauvais"])
    expect(filterOptions(["LeBonCoin", "Boutique d'occasion", "Vinted"], "leboncoin")).toEqual(["LeBonCoin"])
  })
})
