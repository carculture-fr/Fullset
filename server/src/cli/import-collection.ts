// Premier import de la collection, à lancer dans le conteneur :
//   docker exec fullset node server/dist/cli/import-collection.js /data/import/collection.json
// Relancé avec --covers-only, ne fait que retenter les jaquettes manquantes.
import { readFileSync } from "node:fs"
import path from "node:path"

import { downloadMissingCovers } from "../covers.js"
import { openDb } from "../db.js"
import { importCollection } from "../import-collection.js"

const args = process.argv.slice(2)
const coversOnly = args.includes("--covers-only")
const file = args.find((a) => !a.startsWith("--"))
if (!coversOnly && !file) {
  console.error("usage : import-collection.js <collection.json> | --covers-only")
  process.exit(1)
}

const dataDir = process.env.DATA_DIR ?? path.resolve(import.meta.dirname, "../../../data")
const db = openDb(dataDir)
const euros = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })

try {
  if (!coversOnly) {
    const r = importCollection(db, JSON.parse(readFileSync(file!, "utf8")))
    console.log(`Import : ${r.games} jeux, ${r.copies} exemplaires, ${euros(r.totalCents)} dépensés`)
    for (const t of r.toMatch) console.log(`  à rapprocher d'IGDB : ${t}`)
    for (const w of r.warnings) console.log(`  attention : ${w}`)
  }
  const c = await downloadMissingCovers(db, dataDir)
  console.log(`Jaquettes : ${c.downloaded} téléchargées, ${c.failed.length} en échec`)
  for (const f of c.failed) console.log(`  échec : ${f}`)
} catch (err) {
  console.error((err as Error).message)
  process.exitCode = 1
} finally {
  db.close()
}
