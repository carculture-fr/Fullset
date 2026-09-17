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

  it("fabrique un identifiant de liste lisible", () => {
    expect(fileSlug("Full set Méga Drive (EUR)")).toBe("fichier-full-set-mega-drive-eur")
  })
})
