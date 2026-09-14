// Mot de passe oublié : à lancer dans le conteneur,
//   docker exec fullset node server/dist/cli/reset-password.js
// Pose un nouveau mot de passe tiré au hasard, l'affiche une fois, et ferme toutes les sessions.
import { randomBytes } from "node:crypto"
import path from "node:path"

import { deleteAllSessions, getAccount, setPassword } from "../account.js"
import { openDb } from "../db.js"
import { langFromEnv, msg } from "../i18n.js"

// Anglais, sauf si LANG commence par « fr ».
const lang = langFromEnv()
const dataDir = process.env.DATA_DIR ?? path.resolve(import.meta.dirname, "../../../data")
const db = openDb(dataDir)
try {
  const account = getAccount(db)
  if (!account) throw new Error(msg("cli.resetPassword.noAccount", {}, lang))
  const password = randomBytes(12).toString("base64url")
  await setPassword(db, password)
  deleteAllSessions(db)
  console.log(msg("cli.resetPassword.done", { username: account.username, password }, lang))
} catch (err) {
  console.error((err as Error).message)
  process.exitCode = 1
} finally {
  db.close()
}
