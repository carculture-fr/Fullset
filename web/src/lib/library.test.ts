import { describe, expect, it } from "vitest"

import {
  NONE,
  applyFilters,
  facetCounts,
  groupByPlatform,
  normalize,
  readParams,
  sortResults,
  totals,
  writeParams,
  type LibraryCopy,
  type LibraryGame,
} from "./library"

const copy = (id: number, over: Partial<LibraryCopy> = {}): LibraryCopy => ({
  id,
  title_as_entered: "",
  support: "Physique",
  region: "PAL (Europe)",
  edition: "Standard",
  content: "Jeu + boîte",
  condition_game: "Bon",
  condition_box: "Bon",
  condition_manual: null,
  play_status: "Pas commencé",
  goal: "À garder",
  quantity: 1,
  status: null,
  left_on: null,
  price_cents: 500,
  purchase_date: "2026-03-01",
  purchase_place: "Vinted",
  tags: null,
  value_cents: null,
  valued_on: null,
  ...over,
})

const game = (id: number, title: string, platform: string, copies: LibraryCopy[], over: Partial<LibraryGame> = {}): LibraryGame => ({
  id,
  igdb_id: id,
  platform,
  title,
  series: null,
  developer: null,
  publisher: null,
  release_date: null,
  cover: null,
  copies,
  ...over,
})

const games = [
  game(1, "Pokémon Colosseum", "GameCube", [copy(1, { price_cents: 3000, purchase_date: "2026-04-10" })]),
  game(2, "Call of Duty: Modern Warfare 3", "Xbox 360", [copy(2, { title_as_entered: "Call of Duty: MW3", condition_box: "Moyen" })]),
  game(3, "Borderlands 2", "PC", [
    copy(3, { support: "Dématérialisé", content: "Dématérialisé", condition_game: null, condition_box: null, price_cents: 1000 }),
    copy(4, { support: "Physique", condition_box: "Mauvais", price_cents: 200, purchase_date: null }),
  ]),
  game(4, "Halo 3", "Xbox 360", [copy(5, { purchase_place: null, tags: "Collector, Steelbook" })]),
]

const titles = (r: ReturnType<typeof applyFilters>) => r.map((x) => x.game.title)

describe("recherche", () => {
  it("ignore accents, casse et ponctuation", () => {
    expect(normalize("Pokémon: Colosseum!")).toBe("pokemon colosseum")
    expect(titles(applyFilters(games, {}, "pokemon"))).toEqual(["Pokémon Colosseum"])
  })

  it("cherche aussi dans le titre saisi à l'ajout", () => {
    expect(titles(applyFilters(games, {}, "mw3"))).toEqual(["Call of Duty: Modern Warfare 3"])
  })

  it("exige tous les mots", () => {
    expect(titles(applyFilters(games, {}, "call 3"))).toEqual(["Call of Duty: Modern Warfare 3"])
    expect(applyFilters(games, {}, "call halo")).toEqual([])
  })
})

describe("filtres", () => {
  it("OU dans un critère, ET entre critères", () => {
    expect(titles(applyFilters(games, { plateforme: ["GameCube", "PC"] }, ""))).toEqual(["Pokémon Colosseum", "Borderlands 2"])
    expect(titles(applyFilters(games, { plateforme: ["Xbox 360"], "etat-boite": ["Moyen"] }, ""))).toEqual([
      "Call of Duty: Modern Warfare 3",
    ])
  })

  it("applique les critères d'exemplaire au même exemplaire", () => {
    expect(titles(applyFilters(games, { support: ["Dématérialisé"], "etat-boite": ["Mauvais"] }, ""))).toEqual([])
    const r = applyFilters(games, { support: ["Physique"], "etat-boite": ["Mauvais"] }, "")
    expect(titles(r)).toEqual(["Borderlands 2"])
    expect(r[0].copies.map((c) => c.id)).toEqual([4])
  })

  it("traite une valeur vide comme « Non renseigné »", () => {
    expect(titles(applyFilters(games, { lieu: [NONE] }, ""))).toEqual(["Halo 3"])
  })

  it("découpe les tags", () => {
    expect(titles(applyFilters(games, { tag: ["Steelbook"] }, ""))).toEqual(["Halo 3"])
  })

  it("compte les jeux par valeur sans tenir compte du critère lui-même", () => {
    const counts = facetCounts(games, { plateforme: ["Xbox 360"] }, "")
    expect(counts.plateforme).toEqual([
      { value: "Xbox 360", count: 2 },
      { value: "GameCube", count: 1 },
      { value: "PC", count: 1 },
    ])
    expect(counts.support).toEqual([{ value: "Physique", count: 2 }])
  })

  it("range les états dans l'ordre de la liste, « Non renseigné » en dernier", () => {
    expect(facetCounts(games, {}, "")["etat-jeu"].map((o) => o.value)).toEqual(["Bon", NONE])
  })

  it("recalcule les totaux sur les exemplaires retenus", () => {
    expect(totals(applyFilters(games, {}, ""))).toEqual({ games: 4, copies: 5, spentCents: 5200 })
    expect(totals(applyFilters(games, { support: ["Dématérialisé"] }, ""))).toEqual({ games: 1, copies: 1, spentCents: 1000 })
  })
})

describe("tri", () => {
  const all = applyFilters(games, {}, "")
  it("par nom, à la française", () => {
    expect(titles(sortResults(all, "nom"))).toEqual(["Borderlands 2", "Call of Duty: Modern Warfare 3", "Halo 3", "Pokémon Colosseum"])
  })
  it("par achat le plus récent", () => {
    expect(titles(sortResults(all, "achat"))[0]).toBe("Pokémon Colosseum")
  })
  it("par prix total du jeu", () => {
    expect(titles(sortResults(all, "prix")).slice(0, 2)).toEqual(["Pokémon Colosseum", "Borderlands 2"])
  })
  it("par valeur estimée, les jeux jamais estimés en dernier", () => {
    const valued = applyFilters(
      [
        game(10, "Estimé à zéro", "PC", [copy(10, { value_cents: 0 })]),
        game(11, "Jamais estimé", "PC", [copy(11)]),
        game(12, "Estimé haut", "PC", [copy(12, { value_cents: 4000 })]),
      ],
      {},
      "",
    )
    expect(titles(sortResults(valued, "valeur"))).toEqual(["Estimé haut", "Estimé à zéro", "Jamais estimé"])
  })
})

describe("regroupement par console", () => {
  it("regroupe dans l'ordre du tri, avec les totaux des exemplaires retenus", () => {
    const groups = groupByPlatform(sortResults(applyFilters(games, {}, ""), "plateforme"))
    expect(groups.map((g) => [g.platform, g.results.length, g.copies, g.spentCents])).toEqual([
      ["GameCube", 1, 1, 3000],
      ["PC", 1, 2, 1200],
      ["Xbox 360", 2, 2, 1000],
    ])
    expect(groups[2].results.map((r) => r.game.title)).toEqual(["Call of Duty: Modern Warfare 3", "Halo 3"])
  })
})

describe("adresse", () => {
  it("fait l'aller-retour des filtres dans l'URL", () => {
    const sp = writeParams({ plateforme: ["PC", "Xbox 360"], lieu: ["Vinted"] }, "halo", "prix")
    expect(readParams(new URLSearchParams(sp.toString()))).toEqual({
      filters: { plateforme: ["PC", "Xbox 360"], lieu: ["Vinted"] },
      q: "halo",
      sort: "prix",
    })
  })

  it("prend le tri par défaut des réglages quand l'adresse n'en porte pas", () => {
    expect(readParams(new URLSearchParams(""), "plateforme").sort).toBe("plateforme")
    expect(writeParams({}, "", "plateforme", "plateforme").toString()).toBe("")
    // Tri par défaut « par console » : revenir au nom doit s'écrire dans l'adresse.
    expect(writeParams({}, "", "nom", "plateforme").toString()).toBe("tri=nom")
    expect(readParams(new URLSearchParams("tri=nom"), "plateforme").sort).toBe("nom")
  })
})
