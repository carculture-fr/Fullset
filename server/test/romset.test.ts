import { describe, expect, it } from "vitest"

import { fileSlug, parseRomsetList } from "../src/romset.js"

// Les formes rencontrées dans les fichiers de packs de ROMs, reconstituées ici (aucune donnée
// d'un pack réel dans le dépôt).

describe("lecture d'une liste de jeux dans un fichier", () => {
  it("ignore la décoration et l'en-tête, garde les titres", () => {
    const { titles } = parseRomsetList(
      [
        "*******************************",
        "* INFORMATION                 *",
        "*******************************",
        "",
        "Uploader: quelqu'un",
        "Nombre de jeux: 3",
        "Taille : 11.83 GB",
        "",
        "007 - Everything or Nothing",
        "1080° Avalanche",
        "Animal Crossing",
      ].join("\n"),
    )
    expect(titles).toEqual(["007 - Everything or Nothing", "1080° Avalanche", "Animal Crossing"])
  })

  it("enlève le code produit, l'arborescence, l'extension et les tags de région", () => {
    const { titles } = parseRomsetList(
      [
        "PCSB00040 - Asphalt - Injection",
        "|    |----007 - GoldenEye 007_[SJBE52].wbfs",
        "2 in 1 - Mahjong + Mahjong Around the World (Europe) (En,Fr,De,Es,It,Nl).nds ... 16 MB",
        "0123. Metroid Prime",
      ].join("\n"),
    )
    expect(titles).toEqual(["Asphalt - Injection", "007 - GoldenEye 007", "2 in 1 - Mahjong + Mahjong Around the World", "Metroid Prime"])
  })

  it("ne garde qu'une fois un jeu répété", () => {
    expect(parseRomsetList("Halo\nhalo\nHalo 2").titles).toEqual(["Halo", "Halo 2"])
  })

  it("lit aussi un tableau numéro / titre / cote, comme le modèle proposé", () => {
    const { items, skipped } = parseRomsetList(
      ["numero;titre;cote", "1;Metroid Prime;24,90", "2;F-Zero GX;39.00", "3;Chibi-Robo!;", "Luigi's Mansion;18,50"].join("\n"),
    )
    expect(items).toEqual([
      { title: "Metroid Prime", price_cents: 2490 },
      { title: "F-Zero GX", price_cents: 3900 },
      { title: "Chibi-Robo!", price_cents: null },
      { title: "Luigi's Mansion", price_cents: 1850 },
    ])
    // Seule la ligne d'en-tête est écartée.
    expect(skipped).toBe(1)
  })

  it("laisse tranquille un titre qui contient une virgule", () => {
    expect(parseRomsetList("Jak II: Hors-la-loi\nBrothers in Arms - Road to Hill 30").items).toEqual([
      { title: "Jak II: Hors-la-loi", price_cents: null },
      { title: "Brothers in Arms - Road to Hill 30", price_cents: null },
    ])
  })

  it("fabrique un identifiant de liste lisible", () => {
    expect(fileSlug("Full set Méga Drive (EUR)")).toBe("fichier-full-set-mega-drive-eur")
  })
})
