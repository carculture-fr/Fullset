// Mot de passe oublié : à lancer dans le conteneur,
//   docker exec fullset node server/dist/cli/reset-password.js
// Pose un nouveau mot de passe tiré au hasard, l'affiche une fois, et ferme toutes les sessions.
import { randomBytes } from "node:crypto"
import path from "node:path"

import { deleteAllSessions, getAccount, setPassword } from "../account.js"
import { openDb } from "../db.js"

const dataDir = process.env.DATA_DIR ?? path.resolve(import.meta.dirname, "../../../data")
const db = openDb(dataDir)
try {
  const account = getAccount(db)
  if (!account) throw new Error("Aucun compte : ouvre Fullset dans le navigateur pour le créer.")
  const password = randomBytes(12).toString("base64url")
  await setPassword(db, password)
  deleteAllSessions(db)
  console.log(`Identifiant : ${account.username}\nNouveau mot de passe : ${password}\nChange-le dans Réglages → Sécurité après t'être connecté.`)
} catch (err) {
  console.error((err as Error).message)
  process.exitCode = 1
} finally {
  db.close()
}
