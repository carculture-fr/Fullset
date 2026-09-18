import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

import { PHOTOS_DIR } from "./copies.js"
import { COVERS_DIR } from "./covers.js"
import type { Db } from "./db.js"
import { msg } from "./i18n.js"
import { ImportFormatError, exportJson, importExport } from "./transfer.js"
import { unzipStore, zipStore } from "./zip.js"

/**
 * Sauvegarde complète : l'export JSON (collection, matériel, souhaits, estimations, journal) et
 * les images (jaquettes et photos) dans une seule archive. C'est le fichier à ranger quelque part,
 * et celui qui remet tout en place après une bêtise ou sur une nouvelle installation.
 */

const BACKUP_JSON = "fullset.json"
const IMAGE_DIRS = [COVERS_DIR, PHOTOS_DIR] as const

const filesOf = (dir: string) => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
  } catch {
    return []
  }
}

export function buildBackup(db: Db, dataDir: string): Buffer {
  const entries = [{ name: BACKUP_JSON, data: Buffer.from(JSON.stringify(exportJson(db), null, 2), "utf8") }]
  for (const dir of IMAGE_DIRS) {
    for (const file of filesOf(path.join(dataDir, dir))) {
      entries.push({ name: `${dir}/${file}`, data: readFileSync(path.join(dataDir, dir, file)) })
    }
  }
  return zipStore(entries)
}

/** Nom de fichier accepté à la restauration : « covers/… » ou « photos/… », sans chemin. */
function safeTarget(name: string) {
  const [dir, ...rest] = name.split("/")
  const base = rest.join("/")
  if (!(IMAGE_DIRS as readonly string[]).includes(dir) || rest.length !== 1) return null
  if (!base || base.includes("\\") || base.startsWith(".") || base.includes("..") || path.isAbsolute(base)) return null
  return { dir, base }
}

export type RestoreReport = { games: number; copies: number; totalCents: number; images: number }

/**
 * Remet une sauvegarde en place : la collection actuelle (jeux, matériel, souhaits, images) est
 * remplacée. Les listes du mode Fullset et les réglages ne sont pas touchés.
 */
export function restoreBackup(db: Db, dataDir: string, archive: Buffer): RestoreReport {
  const files = unzipStore(archive)
  const json = files.get(BACKUP_JSON)
  if (!json) throw new ImportFormatError(msg("transfer.badArchive"))

  db.transaction(() => {
    db.prepare("DELETE FROM games").run()
    db.prepare("DELETE FROM hardware").run()
    db.prepare("DELETE FROM wishlist").run()
  })()
  for (const dir of IMAGE_DIRS) {
    rmSync(path.join(dataDir, dir), { recursive: true, force: true })
    mkdirSync(path.join(dataDir, dir), { recursive: true })
  }

  const report = importExport(db, json.toString("utf8"))
  let images = 0
  for (const [name, data] of files) {
    if (name === BACKUP_JSON) continue
    const target = safeTarget(name)
    if (!target) continue
    writeFileSync(path.join(dataDir, target.dir, target.base), data)
    images += 1
  }
  return { ...report, images }
}
