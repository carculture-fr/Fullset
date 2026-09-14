import path from "node:path"

import { getAccount } from "./account.js"
import { createApp, APP_VERSION } from "./app.js"
import { openDb } from "./db.js"

const dataDir = process.env.DATA_DIR ?? path.resolve(import.meta.dirname, "../../data")
const db = openDb(dataDir)

const port = Number(process.env.PORT ?? 3110)
const server = createApp(db, dataDir).listen(port, () => {
  console.log(`Fullset ${APP_VERSION} sur le port ${port}, données dans ${dataDir}`)
  if (!getAccount(db)) console.log(`Premier lancement : ouvre http://<adresse-du-serveur>:${port} pour créer ton compte.`)
})

// Fermer proprement la base à l'arrêt du conteneur : le WAL est réintégré au fichier principal.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.close()
      process.exit(0)
    })
  })
}
