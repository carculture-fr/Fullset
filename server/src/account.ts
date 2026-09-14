import { createHash, randomBytes, scrypt, timingSafeEqual, type BinaryLike, type ScryptOptions } from "node:crypto"

import { ValidationError } from "./copies.js"
import type { Db } from "./db.js"
import { text } from "./domain.js"
import { msg } from "./i18n.js"

// Le compte unique de l'installation, créé par l'assistant de premier lancement, et ses sessions.

export type Account = { username: string; display_name: string | null; email: string | null }

export const getAccount = (db: Db) => db.prepare("SELECT username, display_name, email FROM account WHERE id = 1").get() as Account | undefined

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PASSWORD_MIN = 10

// --- Mots de passe : scrypt (bibliothèque standard de Node), sel aléatoire, paramètres dans l'empreinte.

const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 }
const derive = (password: string, salt: Buffer, o: typeof SCRYPT) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password as BinaryLike, salt, o.keylen, { N: o.N, r: o.r, p: o.p, maxmem: 128 * o.N * o.r * 2 } as ScryptOptions, (err, key) => (err ? reject(err) : resolve(key))),
  )

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await derive(password, salt, SCRYPT)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${key.toString("base64url")}`
}

export async function verifyPassword(password: string, stored: string) {
  const [kind, n, r, p, salt, key] = stored.split("$")
  if (kind !== "scrypt" || !salt || !key) return false
  const expected = Buffer.from(key, "base64url")
  const actual = await derive(password, Buffer.from(salt, "base64url"), { N: Number(n), r: Number(r), p: Number(p), keylen: expected.length })
  return timingSafeEqual(actual, expected)
}

// Empreinte factice : un identifiant inconnu coûte le même calcul qu'un mauvais mot de passe.
let dummyHash: Promise<string> | null = null
export const dummyPasswordHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString("hex")))

export function validatePassword(value: unknown) {
  const password = typeof value === "string" ? value : ""
  if (password.length < PASSWORD_MIN) throw new ValidationError(msg("account.passwordMin", { min: PASSWORD_MIN }))
  if (password.length > 200) throw new ValidationError(msg("account.passwordMax", { max: 200 }))
  return password
}

export function validateProfile(input: Record<string, unknown>) {
  const username = text(input.username)
  if (!username || /\s/.test(username) || username.length > 40) throw new ValidationError(msg("account.username"))
  const email = text(input.email)
  if (email && !EMAIL.test(email)) throw new ValidationError(msg("account.email"))
  const displayName = text(input.display_name)
  if (displayName && displayName.length > 60) throw new ValidationError(msg("account.displayName"))
  return { username, email, display_name: displayName }
}

/** Crée le compte unique. Une seconde création échoue (contrainte id = 1) : l'inscription est close. */
export async function createAccount(db: Db, input: Record<string, unknown>) {
  const profile = validateProfile(input)
  const hash = await hashPassword(validatePassword(input.password))
  const res = db
    .prepare("INSERT INTO account (id, username, display_name, email, password_hash) VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
    .run(profile.username, profile.display_name, profile.email, hash)
  return res.changes === 1
}

export async function checkCredentials(db: Db, username: unknown, password: unknown) {
  const row = db.prepare("SELECT username, password_hash FROM account WHERE id = 1").get() as { username: string; password_hash: string } | undefined
  const sameUser = Boolean(row && typeof username === "string" && row.username.toLowerCase() === username.trim().toLowerCase())
  const ok = await verifyPassword(typeof password === "string" ? password : "", sameUser ? row!.password_hash : await dummyPasswordHash())
  return sameUser && ok
}

export function updateProfile(db: Db, profile: ReturnType<typeof validateProfile>) {
  db.prepare("UPDATE account SET username = ?, email = ?, display_name = ?, updated_at = datetime('now') WHERE id = 1").run(
    profile.username,
    profile.email,
    profile.display_name,
  )
}

export async function setPassword(db: Db, password: string) {
  db.prepare("UPDATE account SET password_hash = ?, updated_at = datetime('now') WHERE id = 1").run(await hashPassword(validatePassword(password)))
}

// --- Sessions : un jeton aléatoire dans le cookie, son empreinte seule en base. Une session
// se ferme après 14 jours sans visite ; se déconnecter la supprime vraiment.

export const SESSION_IDLE_MS = 14 * 86_400_000
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

export function createSession(db: Db, userAgent: string | undefined, now = Date.now()) {
  db.prepare("DELETE FROM sessions WHERE last_seen < ?").run(now - SESSION_IDLE_MS)
  const token = randomBytes(32).toString("base64url")
  db.prepare("INSERT INTO sessions (token_hash, created_at, last_seen, user_agent) VALUES (?, ?, ?, ?)").run(sha256(token), now, now, userAgent?.slice(0, 200) ?? null)
  return token
}

/** La session du jeton, prolongée au plus une fois par heure ; null si inconnue ou expirée. */
export function findSession(db: Db, token: string | undefined, now = Date.now()) {
  if (!token) return null
  const row = db.prepare("SELECT last_seen FROM sessions WHERE token_hash = ?").get(sha256(token)) as { last_seen: number } | undefined
  if (!row || row.last_seen < now - SESSION_IDLE_MS) return null
  if (now - row.last_seen > 3_600_000) db.prepare("UPDATE sessions SET last_seen = ? WHERE token_hash = ?").run(now, sha256(token))
  return { token }
}

export const deleteSession = (db: Db, token: string) => db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token))
export const deleteOtherSessions = (db: Db, keep: string) => db.prepare("DELETE FROM sessions WHERE token_hash <> ?").run(sha256(keep))
export const deleteAllSessions = (db: Db) => db.prepare("DELETE FROM sessions").run()
