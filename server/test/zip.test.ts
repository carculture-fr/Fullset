import { describe, expect, it } from "vitest"

import { ZipError, crc32, unzipStore, zipStore } from "../src/zip.js"

// Archives « store » maison : ce qui compte est qu'un vrai outil puisse les ouvrir (en-têtes
// aux bons décalages) et qu'on relise sans perte ce qu'on vient d'écrire.

describe("archive de sauvegarde", () => {
  const entries = [
    { name: "fullset.json", data: Buffer.from('{"format":"fullset"}', "utf8") },
    { name: "covers/12-abcd.jpg", data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]) },
    { name: "photos/accents éàü.jpg", data: Buffer.from("photo", "utf8") },
  ]

  it("écrit une archive qu'on relit à l'identique", () => {
    const archive = zipStore(entries)
    expect(archive.readUInt32LE(0)).toBe(0x04034b50)
    const files = unzipStore(archive)
    expect([...files.keys()]).toEqual(entries.map((e) => e.name))
    for (const entry of entries) expect(files.get(entry.name)).toEqual(entry.data)
  })

  it("garde une archive vide lisible", () => {
    expect(unzipStore(zipStore([])).size).toBe(0)
  })

  it("refuse une archive abîmée", () => {
    const archive = zipStore(entries)
    // Contenu de la première entrée : en-tête local (30 octets) puis le nom, puis les données.
    const firstByte = 30 + Buffer.byteLength(entries[0].name) + 2
    archive[firstByte] = archive[firstByte] ^ 0xff
    expect(() => unzipStore(archive)).toThrow(ZipError)
    expect(() => unzipStore(Buffer.from("pas une archive"))).toThrow(ZipError)
  })

  it("calcule le CRC32 attendu", () => {
    // Valeur de référence connue pour « 123456789 ».
    expect(crc32(Buffer.from("123456789", "utf8"))).toBe(0xcbf43926)
  })
})
